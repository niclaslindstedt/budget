// The dev-seed adapter is swapped in MID-SESSION by the "Fake data"
// toggle, never as the initial adapter. The load effect in
// `useLoadState` only runs an adapter's synchronous `loadSync` fast
// path on the FIRST mount; a `loadSync` adapter that swaps in after a
// real backend already loaded hits the "load skipped" branch and the
// seed never reaches the screen (the symptom: banner shows, but the
// real Dropbox / browser data stays). So this adapter must stay
// ASYNC-ONLY — the test below is the guard against re-adding `loadSync`.

import { describe, expect, it } from "vitest";

import { createDevSeedAdapter } from "../src/storage/dev-seed-adapter";
import { parseUserData } from "../src/storage/file";

describe("createDevSeedAdapter", () => {
  it("does not advertise the synchronous fast path", () => {
    const adapter = createDevSeedAdapter();
    // Both must be absent together: the capability gates UI, the method
    // gates the load effect. Either one present reintroduces the
    // mid-session-swap bug.
    expect(adapter.loadSync).toBeUndefined();
    expect(adapter.capabilities.has("loadSync")).toBe(false);
    expect(adapter.id).toBe("dev");
  });

  it("load() returns valid seed bytes", async () => {
    const snap = await createDevSeedAdapter().load();
    expect(snap).not.toBeNull();
    const parsed = parseUserData(snap!.text);
    expect(parsed.ok).toBe(true);
  });

  it("round-trips edits through save() within the session", async () => {
    const adapter = createDevSeedAdapter();
    await adapter.save('{"edited":true}\n');
    const snap = await adapter.load();
    expect(snap?.text).toBe('{"edited":true}\n');
  });
});
