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

  it("advertises the blob-file capabilities so attachment flows are reachable", () => {
    const adapter = createDevSeedAdapter();
    // The seed preloads property files / receipts; without these the
    // Files manager lists rows but hides the upload button.
    for (const cap of [
      "propertyFiles",
      "receipts",
      "payslips",
      "exports",
    ] as const) {
      expect(adapter.capabilities.has(cap)).toBe(true);
    }
    expect(adapter.propertyFiles).toBeDefined();
    expect(adapter.receipts).toBeDefined();
    expect(adapter.payslips).toBeDefined();
    expect(adapter.exports).toBeDefined();
  });

  it("round-trips uploaded file bytes through the in-memory store", async () => {
    const adapter = createDevSeedAdapter();
    const blob = new Blob(["hello"], { type: "text/plain" });
    await adapter.propertyFiles!.upload("Cabin/files/note.txt", blob);

    const back = await adapter.propertyFiles!.download("Cabin/files/note.txt");
    expect(back).not.toBeNull();
    expect(await back!.text()).toBe("hello");

    // A path that was never uploaded (e.g. a seeded record whose bytes
    // never existed) resolves to null, not a throw — the viewer turns
    // that into its "can't load" state.
    expect(await adapter.propertyFiles!.download("Cabin/files/ghost.pdf")).toBe(
      null,
    );

    await adapter.propertyFiles!.remove("Cabin/files/note.txt");
    expect(await adapter.propertyFiles!.download("Cabin/files/note.txt")).toBe(
      null,
    );
  });

  it("keeps each file capability in its own folder", async () => {
    const adapter = createDevSeedAdapter();
    const samePath = "shared/name.jpg";
    await adapter.receipts!.upload(
      samePath,
      new Blob(["receipt"], { type: "text/plain" }),
    );
    await adapter.propertyFiles!.upload(
      samePath,
      new Blob(["property"], { type: "text/plain" }),
    );

    expect(await (await adapter.receipts!.download(samePath))!.text()).toBe(
      "receipt",
    );
    expect(
      await (await adapter.propertyFiles!.download(samePath))!.text(),
    ).toBe("property");
  });
});
