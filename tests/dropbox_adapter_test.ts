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
    // `update` must travel inside the `mode` tag-union struct; sending
    // it as a sibling field makes the Dropbox upload endpoint reject
    // the call with `unknown field 'update'`.
    expect(apiArg.mode).toEqual({ ".tag": "update", update: "r1" });
    expect(apiArg.update).toBeUndefined();
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

describe("dropbox silent token refresh", () => {
  it("refreshes the access token on 401 and retries the request", async () => {
    let accessToken = "expired-access";
    let refreshCalls = 0;
    const refreshed: string[] = [];
    const { fn, calls } = fakeFetch((call) => {
      if (call.url === "https://api.dropboxapi.com/oauth2/token") {
        refreshCalls += 1;
        const body = (call.init?.body as string) ?? "";
        expect(body).toContain("grant_type=refresh_token");
        expect(body).toContain("refresh_token=ref-1");
        accessToken = "fresh-access";
        return makeResponse({
          status: 200,
          body: JSON.stringify({
            access_token: "fresh-access",
            token_type: "bearer",
            expires_in: 14400,
          }),
        });
      }
      if (call.url.includes("/files/upload")) {
        const auth = (call.init?.headers as Record<string, string>)
          .Authorization;
        if (auth === "Bearer expired-access") {
          return makeResponse({
            status: 401,
            body: JSON.stringify({
              error_summary: "expired_access_token/",
              error: { ".tag": "expired_access_token" },
            }),
          });
        }
        expect(auth).toBe(`Bearer ${accessToken}`);
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "after-refresh" }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });

    const adapter = createDropboxAdapter(
      {
        accessToken: "expired-access",
        refreshToken: "ref-1",
        onAccessTokenRefreshed: (token) => {
          refreshed.push(token);
        },
      },
      fn,
    );
    const snap = await adapter.save("payload");
    expect(snap.revision).toBe("after-refresh");
    expect(refreshCalls).toBe(1);
    expect(refreshed).toEqual(["fresh-access"]);
    const uploadCalls = calls.filter((c) => c.url.includes("/files/upload"));
    expect(uploadCalls).toHaveLength(2);
  });

  it("falls through to the 401 when no refresh token is available", async () => {
    const { fn } = fakeFetch((call) => {
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 401,
          body: JSON.stringify({
            error_summary: "expired_access_token/",
            error: { ".tag": "expired_access_token" },
          }),
        });
      }
      throw new Error(`Unexpected URL: ${call.url}`);
    });
    const adapter = createDropboxAdapter(
      {
        accessToken: "expired-access",
        refreshToken: null,
        onAccessTokenRefreshed: () => {},
      },
      fn,
    );
    await expect(adapter.save("payload")).rejects.toThrow(/401/);
  });

  it("only swaps tokens once when concurrent calls all see 401", async () => {
    let refreshCalls = 0;
    const { fn } = fakeFetch((call) => {
      if (call.url === "https://api.dropboxapi.com/oauth2/token") {
        refreshCalls += 1;
        return makeResponse({
          status: 200,
          body: JSON.stringify({ access_token: "fresh", expires_in: 14400 }),
        });
      }
      const auth = (call.init?.headers as Record<string, string>).Authorization;
      if (auth === "Bearer expired") {
        if (call.url.includes("/files/upload")) {
          return makeResponse({
            status: 401,
            body: JSON.stringify({
              error_summary: "expired_access_token/",
            }),
          });
        }
        return makeResponse({
          status: 401,
          body: JSON.stringify({
            error_summary: "expired_access_token/",
          }),
        });
      }
      if (call.url.includes("/files/upload")) {
        return makeResponse({
          status: 200,
          body: JSON.stringify({ rev: "ok" }),
        });
      }
      return makeResponse({
        status: 200,
        body: "{}",
        headers: { "Dropbox-API-Result": JSON.stringify({ rev: "ok" }) },
      });
    });
    const adapter = createDropboxAdapter(
      {
        accessToken: "expired",
        refreshToken: "ref",
        onAccessTokenRefreshed: () => {},
      },
      fn,
    );
    await Promise.all([adapter.save("a"), adapter.load(), adapter.save("b")]);
    expect(refreshCalls).toBe(1);
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
