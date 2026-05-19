import { afterEach, describe, expect, it } from "vitest";

import { pickOauthProvider, redirectUri } from "../src/storage/oauth-pkce";

// `window.location` is absent in Node — stub a minimal shim so the
// pathname branch in `redirectUri` is exercised end-to-end. The shim
// is reset between tests so a leftover pathname can't bleed across.
function setLocation(origin: string, pathname: string): void {
  const g = globalThis as {
    window?: { location?: { origin: string; pathname: string } };
  };
  if (!g.window) g.window = {};
  g.window.location = { origin, pathname };
}

afterEach(() => {
  const g = globalThis as { window?: unknown };
  delete g.window;
});

describe("redirectUri", () => {
  // Production root at `/` should match the existing OAuth app
  // registration — bare origin, no trailing slash.
  it("returns bare origin when pathname is /", () => {
    setLocation("https://budget.niclaslindstedt.se", "/");
    expect(redirectUri()).toBe("https://budget.niclaslindstedt.se");
  });

  // Preview build at `/preview/` must round-trip back to itself so
  // the PKCE verifier (stashed under the preview's namespaced
  // sessionStorage key) is reachable when the redirect lands. The
  // bug this fix addresses is the verifier landing on `/` with no
  // way for the production app to read it.
  it("appends pathname for /preview/ (trailing slash stripped)", () => {
    setLocation("https://budget.niclaslindstedt.se", "/preview/");
    expect(redirectUri()).toBe("https://budget.niclaslindstedt.se/preview");
  });

  it("appends pathname for /preview (no trailing slash)", () => {
    setLocation("https://budget.niclaslindstedt.se", "/preview");
    expect(redirectUri()).toBe("https://budget.niclaslindstedt.se/preview");
  });

  // Google rejects redirect URIs that end in `/`; multiple trailing
  // slashes get collapsed to a single trim so a stray double-slash
  // doesn't trip the provider.
  it("strips multiple trailing slashes", () => {
    setLocation("https://budget.niclaslindstedt.se", "/preview///");
    expect(redirectUri()).toBe("https://budget.niclaslindstedt.se/preview");
  });

  it("handles localhost dev", () => {
    setLocation("http://localhost:5173", "/");
    expect(redirectUri()).toBe("http://localhost:5173");
  });
});

describe("pickOauthProvider", () => {
  // The PKCE verifier is the source of truth: each provider stashes
  // exactly one before redirecting, and presence alone identifies the
  // flow. State is only used as a tiebreaker.
  it("uses gdrive verifier when only gdrive is pending", () => {
    expect(
      pickOauthProvider({
        state: null,
        gdrivePending: true,
        dropboxPending: false,
      }),
    ).toBe("gdrive");
  });

  it("uses dropbox verifier when only dropbox is pending", () => {
    expect(
      pickOauthProvider({
        state: null,
        gdrivePending: false,
        dropboxPending: true,
      }),
    ).toBe("dropbox");
  });

  // The original bug: Google's redirect occasionally landed back here
  // with `state` not echoed cleanly (or stripped by a redirect chain).
  // The old code defaulted to "dropbox" in that case, routing the
  // Google `?code=` through the Dropbox completion path. With the
  // verifier as the source of truth, the missing `state` no longer
  // matters as long as we know which flow we kicked off.
  it("ignores missing state when only one verifier is pending", () => {
    expect(
      pickOauthProvider({
        state: null,
        gdrivePending: true,
        dropboxPending: false,
      }),
    ).toBe("gdrive");
  });

  it("ignores wrong state when only one verifier is pending", () => {
    expect(
      pickOauthProvider({
        state: "dropbox",
        gdrivePending: true,
        dropboxPending: false,
      }),
    ).toBe("gdrive");
  });

  it("breaks ambiguous ties with state=gdrive", () => {
    expect(
      pickOauthProvider({
        state: "gdrive",
        gdrivePending: true,
        dropboxPending: true,
      }),
    ).toBe("gdrive");
  });

  it("breaks ambiguous ties with state=dropbox", () => {
    expect(
      pickOauthProvider({
        state: "dropbox",
        gdrivePending: true,
        dropboxPending: true,
      }),
    ).toBe("dropbox");
  });

  it("returns null when both pending and state is missing", () => {
    expect(
      pickOauthProvider({
        state: null,
        gdrivePending: true,
        dropboxPending: true,
      }),
    ).toBeNull();
  });

  it("returns null when neither verifier is present", () => {
    expect(
      pickOauthProvider({
        state: "gdrive",
        gdrivePending: false,
        dropboxPending: false,
      }),
    ).toBeNull();
  });
});
