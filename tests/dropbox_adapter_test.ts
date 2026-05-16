import { describe, expect, it } from "vitest";

import { ConflictError } from "../src/storage/adapter";
import { createDropboxAdapter } from "../src/storage/dropbox-adapter";

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

describe("dropbox adapter", () => {
  it("round-trips revision through save then load", async () => {
    let stored = '{"version":5}';
    let rev = "abc123";
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        rev = "def456";
        stored = (call.init?.body as string) ?? "";
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev }),
        });
      }
      if (call.url.includes("/files/download")) {
        return makeResponse({
          status: 200,
          body: stored,
          headers: { "Dropbox-API-Result": JSON.stringify({ rev }) },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter("token-123", fn);
    const saved = await adapter.save("payload-1");
    expect(saved.revision).toBe("def456");
    expect(saved.text).toBe("payload-1");

    const loaded = await adapter.load();
    expect(loaded).toEqual({ text: "payload-1", revision: "def456" });
  });

  it("returns null on first load when Dropbox responds 409 not_found", async () => {
    const { fn } = fakeFetch(() =>
      makeResponse({
        status: 409,
        body: JSON.stringify({
          error_summary: "path/not_found/",
          error: { ".tag": "path", path: { ".tag": "not_found" } },
        }),
      }),
    );
    const adapter = createDropboxAdapter("token-123", fn);
    expect(await adapter.load()).toBeNull();
  });

  it("throws ConflictError carrying the remote snapshot when save 409s", async () => {
    let firstUpload = true;
    const remoteText = '{"version":5,"remote":true}';
    const remoteRev = "remote-rev";
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        if (firstUpload) {
          firstUpload = false;
          // Simulate a write_conflict response.
          return makeResponse({
            status: 409,
            body: JSON.stringify({
              error_summary: "path/conflict/file/",
              error: { ".tag": "path", reason: { ".tag": "conflict" } },
            }),
          });
        }
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "x" }),
        });
      }
      if (call.url.includes("/files/download")) {
        return makeResponse({
          status: 200,
          body: remoteText,
          headers: { "Dropbox-API-Result": JSON.stringify({ rev: remoteRev }) },
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter("token-123", fn);
    await expect(
      adapter.save("our-payload", "stale-rev"),
    ).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: remoteText, revision: remoteRev },
    });
  });

  it("sets a 5-minute debounce so saves coalesce", () => {
    const { fn } = fakeFetch(() => makeResponse({ status: 200, body: "{}" }));
    const adapter = createDropboxAdapter("token-123", fn);
    expect(adapter.saveDebounceMs).toBe(5 * 60 * 1000);
  });

  it("uses update mode when a baseRevision is supplied", async () => {
    const { fn, calls } = fakeFetch(() =>
      makeResponse({ status: 200, body: JSON.stringify({ rev: "r2" }) }),
    );
    const adapter = createDropboxAdapter("token-123", fn);
    await adapter.save("payload", "r1");
    const uploadCall = calls.find((c) => c.url.includes("/files/upload"));
    const apiArg = JSON.parse(
      (uploadCall?.init?.headers as Record<string, string>)["Dropbox-API-Arg"],
    );
    expect(apiArg.mode).toBe("update");
    expect(apiArg.update).toBe("r1");
  });

  it("uses add mode for the very first save", async () => {
    const { fn, calls } = fakeFetch(() =>
      makeResponse({ status: 200, body: JSON.stringify({ rev: "r1" }) }),
    );
    const adapter = createDropboxAdapter("token-123", fn);
    await adapter.save("payload");
    const uploadCall = calls.find((c) => c.url.includes("/files/upload"));
    const apiArg = JSON.parse(
      (uploadCall?.init?.headers as Record<string, string>)["Dropbox-API-Arg"],
    );
    expect(apiArg.mode).toBe("add");
  });

  it("forwards the bearer token on both load and save", async () => {
    const { fn, calls } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "r" }),
        });
      }
      return makeResponse({
        status: 200,
        body: "{}",
        headers: { "Dropbox-API-Result": JSON.stringify({ rev: "r" }) },
      });
    });
    const adapter = createDropboxAdapter("token-abc", fn);
    await adapter.save("payload");
    await adapter.load();
    for (const call of calls) {
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      expect(auth).toBe("Bearer token-abc");
    }
  });
});

describe("ConflictError integration with dropbox", () => {
  it("the thrown error is detected by instanceof ConflictError", async () => {
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 409,
          body: JSON.stringify({ error_summary: "path/conflict/" }),
        });
      }
      return makeResponse({
        status: 200,
        body: '{"x":1}',
        headers: { "Dropbox-API-Result": JSON.stringify({ rev: "r9" }) },
      });
    });
    const adapter = createDropboxAdapter("token", fn);
    try {
      await adapter.save("text", "rev-old");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ConflictError);
    }
  });
});
