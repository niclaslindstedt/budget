import { describe, expect, it } from "vitest";

import { pickOauthProvider } from "../src/storage/oauth-pkce";

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
