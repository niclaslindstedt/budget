import { describe, expect, it } from "vitest";

import { ConflictError } from "../src/storage/adapter";
import { createGdriveAdapter } from "../src/storage/gdrive-adapter";

// Minimal `Response` shim. The adapter only ever reads `.status`,
// `.ok`, `.headers.get`, `.json()`, and `.text()` — no need to drag
// in undici / a real fetch implementation.
function makeResponse(opts: {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}): Response {
  const status = opts.status;
  const body = opts.body ?? "";
  const headers = new Headers(opts.headers ?? {});
  return {
    status,
    ok: status >= 200 && status < 300,
    headers,
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  } as unknown as Response;
}

type Call = { url: string; init?: RequestInit };

function fakeFetch(handler: (call: Call) => Response): {
  fn: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fn: typeof fetch = (async (
    url: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fn, calls };
}

// Match against the URL fragments that identify each Drive endpoint
// the adapter touches. Kept as small functions so the test bodies
// read like English.
function isSearch(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/drive/v3/files?") &&
    url.includes("q=") &&
    !url.includes("alt=media")
  );
}

function isDownload(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/drive/v3/files/") &&
    url.includes("alt=media")
  );
}

function isMetadata(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/drive/v3/files/") &&
    !url.includes("alt=media") &&
    !url.includes("q=")
  );
}

// Drive folders (the app folder + the backups folder) are created
// via a non-upload POST against `?fields=id` carrying the folder
// metadata as the body. Distinct from the multipart `isCreate`
// path which uploads file bytes.
function isFolderCreate(url: string): boolean {
  return url === "https://www.googleapis.com/drive/v3/files?fields=id";
}

function isCreate(url: string): boolean {
  return url.startsWith(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
  );
}

function isUpdate(url: string): boolean {
  return (
    url.startsWith("https://www.googleapis.com/upload/drive/v3/files/") &&
    url.includes("uploadType=media")
  );
}

describe("gdrive adapter", () => {
  it("returns null on first load when no file matches the search", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [] }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    expect(await adapter.load()).toBeNull();
  });

  it("getRevision returns the ETag from a metadata GET without downloading the body", async () => {
    let downloaded = false;
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isMetadata(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "file-abc" }),
          headers: { ETag: "etag-meta-1" },
        });
      }
      if (isDownload(call.url)) {
        downloaded = true;
        return makeResponse({ status: 200, body: "{}" });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);

    expect(await adapter.getRevision!()).toBe("etag-meta-1");
    expect(downloaded).toBe(false);
    expect(adapter.capabilities.has("getRevision")).toBe(true);
  });

  it("getRevision returns null when no file matches the search", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [] }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    expect(await adapter.getRevision!()).toBeNull();
  });

  it("loads the snapshot when a matching file exists", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"version":8}',
          headers: { ETag: '"etag-v1"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    const loaded = await adapter.load();
    expect(loaded).toEqual({ text: '{"version":8}', revision: '"etag-v1"' });
  });

  it("creates a new file via multipart upload on the first save", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [] }),
        });
      }
      if (isFolderCreate(call.url)) {
        // The first save also has to spin up the `budget/` app
        // folder before the file can be parented under it.
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "app-folder-id" }),
        });
      }
      if (isCreate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "new-file-id" }),
        });
      }
      if (isMetadata(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "new-file-id" }),
          headers: { ETag: '"etag-new"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    const saved = await adapter.save("payload-1");
    expect(saved).toEqual({ text: "payload-1", revision: '"etag-new"' });

    const folderCreate = calls.find((c) => isFolderCreate(c.url));
    expect(folderCreate?.init?.method).toBe("POST");
    const folderBody = JSON.parse((folderCreate?.init?.body as string) ?? "{}");
    expect(folderBody.name).toBe("budget");
    expect(folderBody.mimeType).toBe("application/vnd.google-apps.folder");

    const createCall = calls.find((c) => isCreate(c.url));
    expect(createCall?.init?.method).toBe("POST");
    const ct = (createCall?.init?.headers as Record<string, string>)[
      "Content-Type"
    ];
    expect(ct).toMatch(/^multipart\/related; boundary=/);
    const body = createCall?.init?.body as string;
    expect(body).toContain('"name":"budget.json"');
    expect(body).toContain('"parents":["app-folder-id"]');
    expect(body).toContain("payload-1");
  });

  it("updates an existing file via PATCH on subsequent saves", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "file-abc" }),
          headers: { ETag: '"etag-v2"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    const saved = await adapter.save("payload-2", '"etag-v1"');
    expect(saved.revision).toBe('"etag-v2"');

    const updateCall = calls.find((c) => isUpdate(c.url));
    expect(updateCall?.init?.method).toBe("PATCH");
    const headers = updateCall?.init?.headers as Record<string, string>;
    expect(headers["If-Match"]).toBe('"etag-v1"');
  });

  it("omits If-Match when no baseRevision is provided", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "file-abc" }),
          headers: { ETag: '"etag-fresh"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    await adapter.save("payload");
    const updateCall = calls.find((c) => isUpdate(c.url));
    const headers = updateCall?.init?.headers as Record<string, string>;
    expect(headers["If-Match"]).toBeUndefined();
  });

  it("throws ConflictError on 412 with the remote snapshot", async () => {
    let first = true;
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "file-abc" }] }),
        });
      }
      if (isUpdate(call.url)) {
        if (first) {
          first = false;
          return makeResponse({ status: 412, body: "" });
        }
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "file-abc" }),
          headers: { ETag: '"etag-new"' },
        });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"remote":true}',
          headers: { ETag: '"etag-remote"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    await expect(
      adapter.save("our-payload", '"etag-stale"'),
    ).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: '{"remote":true}', revision: '"etag-remote"' },
    });
  });

  it("recovers when the cached fileId points at a deleted file (404)", async () => {
    let searchCalls = 0;
    let updateCalls = 0;
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        searchCalls += 1;
        // First search finds an old id; if the adapter ever searched
        // again it would still find the same id because we don't
        // model the deletion in this fake. The point of this test is
        // that an existing-id update returning 404 falls back to the
        // create path.
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "stale-id" }] }),
        });
      }
      if (isUpdate(call.url)) {
        updateCalls += 1;
        return makeResponse({ status: 404, body: "" });
      }
      if (isCreate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "fresh-id" }),
        });
      }
      if (isMetadata(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "fresh-id" }),
          headers: { ETag: '"etag-fresh"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-123", fn);
    const saved = await adapter.save("payload");
    expect(saved).toEqual({ text: "payload", revision: '"etag-fresh"' });
    expect(updateCalls).toBe(1);
    // The recovery path does not re-search after the 404 — `create`
    // populates `cachedFileId` directly and reuses the cached app
    // folder id. The two pre-PATCH searches are the app-folder
    // lookup and the in-folder file lookup.
    expect(searchCalls).toBe(2);
  });

  it("migrates a legacy budget.json from My Drive root into the app folder", async () => {
    // Pre-subfolder builds wrote `budget.json` at My Drive root.
    // First load after upgrade should: see no file inside the new
    // `budget/` folder, find the legacy file at root, ensure the
    // folder, and reparent the file via PATCH addParents/removeParents.
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        const q = decodeURIComponent(
          new URL(call.url).searchParams.get("q") ?? "",
        );
        // App folder lookup at root: not yet created.
        if (q.includes("mimeType='application/vnd.google-apps.folder'")) {
          return makeResponse({
            status: 200,
            body: JSON.stringify({ files: [] }),
          });
        }
        // Legacy file lookup at root — the migration entry point.
        if (q.includes("'root' in parents")) {
          return makeResponse({
            status: 200,
            body: JSON.stringify({ files: [{ id: "legacy-file-id" }] }),
          });
        }
        throw new Error(`Unexpected search: ${q}`);
      }
      if (isFolderCreate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "app-folder-id" }),
        });
      }
      if (isMetadata(call.url) && call.init?.method === "PATCH") {
        // The reparent PATCH the migration issues — Drive returns
        // the file id; the body / params carry addParents and
        // removeParents.
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "legacy-file-id" }),
        });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"version":8}',
          headers: { ETag: '"etag-legacy"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token", fn);
    const loaded = await adapter.load();
    expect(loaded).toEqual({
      text: '{"version":8}',
      revision: '"etag-legacy"',
    });

    const move = calls.find(
      (c) => isMetadata(c.url) && c.init?.method === "PATCH",
    );
    expect(move?.url).toContain("addParents=app-folder-id");
    expect(move?.url).toContain("removeParents=root");
    expect(move?.url).toContain("/legacy-file-id?");
    // The download targets the migrated file id.
    const download = calls.find((c) => isDownload(c.url));
    expect(download?.url).toContain("/legacy-file-id");
  });

  it("sets a 1-second debounce so keystrokes coalesce", () => {
    const { fn } = fakeFetch(() => makeResponse({ status: 200, body: "{}" }));
    const adapter = createGdriveAdapter("token-123", fn);
    expect(adapter.saveDebounceMs).toBe(1000);
  });

  it("forwards the bearer token on every request", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "f1" }] }),
        });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: "{}",
          headers: { ETag: '"e1"' },
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id: "f1" }),
          headers: { ETag: '"e2"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token-abc", fn);
    await adapter.load();
    await adapter.save("payload");
    for (const call of calls) {
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe("Bearer token-abc");
    }
  });
});

describe("gdrive backups", () => {
  // Fake a Drive workspace just rich enough for the backup ops.
  // Each file has a synthetic id, a parent folder id (root or the
  // backups folder), and a body. Search-by-name plus parent filter
  // drives the lookup paths.
  function gdriveFs(): { fn: typeof fetch } {
    type File = { id: string; name: string; parent: string; body: string };
    const files: File[] = [];
    let nextId = 1;
    const fn: typeof fetch = (async (
      url: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const u = String(url);
      if (isSearch(u)) {
        const params = new URL(u).searchParams;
        const q = params.get("q") ?? "";
        const nameMatch = q.match(/name='([^']+)'/);
        const parentMatch = q.match(/'([^']+)' in parents/);
        // No mime-type filtering — name + parent uniquely identifies
        // every record this fake cares about (the `budget` app
        // folder, the `backups` folder inside it, the budget file,
        // and the backup blobs).
        let matches = files;
        if (nameMatch) matches = matches.filter((f) => f.name === nameMatch[1]);
        if (parentMatch)
          matches = matches.filter((f) => f.parent === parentMatch[1]);
        return makeResponse({
          status: 200,
          body: JSON.stringify({
            files: matches.map((f) => ({ id: f.id })),
          }),
        });
      }
      if (u.endsWith("?fields=id") && init?.method === "POST") {
        const body = JSON.parse((init.body as string) ?? "{}");
        const id = `gen-${nextId++}`;
        files.push({
          id,
          name: body.name,
          parent: body.parents?.[0] ?? "root",
          body: "",
        });
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id }),
        });
      }
      if (isCreate(u)) {
        const raw = init?.body as string;
        const metaMatch = raw.match(
          /Content-Type: application\/json; charset=UTF-8\r\n\r\n(\{[^}]*\})/,
        );
        const meta = metaMatch ? JSON.parse(metaMatch[1]) : { name: "?" };
        const bodyMatch = raw.match(
          /Content-Type: application\/octet-stream\r\n\r\n([\s\S]+)\r\n--/,
        );
        const id = `gen-${nextId++}`;
        files.push({
          id,
          name: meta.name,
          parent: meta.parents?.[0] ?? "root",
          body: bodyMatch ? bodyMatch[1] : "",
        });
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id }),
        });
      }
      if (isUpdate(u)) {
        const id = u
          .replace("https://www.googleapis.com/upload/drive/v3/files/", "")
          .split("?")[0];
        const file = files.find((f) => f.id === id);
        if (!file) return makeResponse({ status: 404, body: "" });
        file.body = (init?.body as string) ?? "";
        return makeResponse({
          status: 200,
          body: JSON.stringify({ id }),
          headers: { ETag: `"etag-${file.id}"` },
        });
      }
      if (isDownload(u)) {
        const id = u
          .replace("https://www.googleapis.com/drive/v3/files/", "")
          .split("?")[0];
        const file = files.find((f) => f.id === id);
        if (!file) return makeResponse({ status: 404, body: "" });
        return makeResponse({
          status: 200,
          body: file.body,
          headers: { ETag: `"etag-${file.id}"` },
        });
      }
      throw new Error(`Unexpected URL: ${u}`);
    }) as typeof fetch;
    return { fn };
  }

  it("list() is empty before any backup is created", async () => {
    const { fn } = gdriveFs();
    const adapter = createGdriveAdapter("token", fn);
    expect(await adapter.backups!.list()).toEqual([]);
  });

  it("create() persists the body in the backups folder and updates the index", async () => {
    const { fn } = gdriveFs();
    const adapter = createGdriveAdapter("token", fn);
    await adapter.backups!.create('{"v":17}', {
      filename: "snap.json",
      createdAt: 1700000000000,
      accountCount: 4,
      entryCount: 8,
    });
    expect(await adapter.backups!.read("snap.json")).toBe('{"v":17}');
    const list = await adapter.backups!.list();
    expect(list).toEqual([
      {
        filename: "snap.json",
        createdAt: 1700000000000,
        accountCount: 4,
        entryCount: 8,
      },
    ]);
  });
});

describe("ConflictError integration with gdrive", () => {
  it("the thrown error is detected by instanceof ConflictError", async () => {
    const { fn } = fakeFetch((call) => {
      if (isSearch(call.url)) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ files: [{ id: "f1" }] }),
        });
      }
      if (isUpdate(call.url)) {
        return makeResponse({ status: 412, body: "" });
      }
      if (isDownload(call.url)) {
        return makeResponse({
          status: 200,
          body: '{"x":1}',
          headers: { ETag: '"e-remote"' },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createGdriveAdapter("token", fn);
    try {
      await adapter.save("text", '"e-old"');
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });
});
