import { describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "../src/storage/adapter";
import {
  type CloudMirrorState,
  type CloudMirrorStorage,
  withCloudMirror,
} from "../src/storage/cloud-mirror";

// In-memory `CloudMirrorStorage` used by every test. Production wires
// up `createIdbCloudMirrorStorage(userId)` from `idb-adapter.ts`; the
// wrapper itself is storage-agnostic so the tests don't need an IDB
// shim.
function memoryStorage(initial: CloudMirrorState | null = null): {
  storage: CloudMirrorStorage;
  peek: () => CloudMirrorState | null;
} {
  let state: CloudMirrorState | null = initial ? { ...initial } : null;
  return {
    storage: {
      async read() {
        return state ? { ...state } : null;
      },
      async write(next) {
        state = { ...next };
      },
      async clear() {
        state = null;
      },
    },
    peek: () => (state ? { ...state } : null),
  };
}

// Drain the microtask + macrotask queue so a background `revalidate`
// (fired with `void` from `load()`) settles before assertions run.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeInner(
  overrides: Partial<StorageAdapter> = {},
): StorageAdapter & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    id: "dropbox",
    label: "Dropbox",
    capabilities: new Set(),
    async load() {
      calls.push({ method: "load", args: [] });
      return null;
    },
    async save(text: string, baseRevision?: string) {
      calls.push({ method: "save", args: [text, baseRevision] });
      return { text, revision: "auto" };
    },
    calls,
    ...overrides,
  } as StorageAdapter & { calls: { method: string; args: unknown[] }[] };
}

describe("withCloudMirror", () => {
  it("mirrors a successful cloud load into the storage", async () => {
    const { storage, peek } = memoryStorage();
    const inner = makeInner({
      async load() {
        return { text: "remote-bytes", revision: "rev-1" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.load();
    expect(snap).toEqual({ text: "remote-bytes", revision: "rev-1" });
    const mirror = peek();
    expect(mirror?.text).toBe("remote-bytes");
    expect(mirror?.cloudRevision).toBe("rev-1");
    expect(mirror?.localRevision).toBe(0);
  });

  it("forwards receipt, payslip, and property-file ops alongside their capabilities", async () => {
    // The wrapper copies the inner capability set, so it must also
    // forward the matching ops objects — otherwise the salary / item /
    // property row menus advertise "View / Remove" (capability present)
    // but the calls throw because `adapter.payslips` / `adapter.receipts`
    // / `adapter.propertyFiles` is undefined.
    const { storage } = memoryStorage();
    const receipts = { upload: async () => {}, download: async () => null };
    const payslips = { upload: async () => {}, download: async () => null };
    const propertyFiles = {
      upload: async () => {},
      download: async () => null,
    };
    const inner = makeInner({
      capabilities: new Set(["receipts", "payslips", "propertyFiles"]),
      receipts: receipts as unknown as StorageAdapter["receipts"],
      payslips: payslips as unknown as StorageAdapter["payslips"],
      propertyFiles:
        propertyFiles as unknown as StorageAdapter["propertyFiles"],
    });
    const adapter = withCloudMirror(inner, { storage });

    expect(adapter.capabilities.has("receipts")).toBe(true);
    expect(adapter.capabilities.has("payslips")).toBe(true);
    expect(adapter.capabilities.has("propertyFiles")).toBe(true);
    expect(adapter.receipts).toBe(receipts);
    expect(adapter.payslips).toBe(payslips);
    expect(adapter.propertyFiles).toBe(propertyFiles);
  });

  it("serves a clean cache instantly and revalidates in the background", async () => {
    // Stale-while-revalidate: with no pending offline edits the cache is
    // painted immediately and the network round-trip moves to a
    // background revalidation. When the cheap revision probe matches,
    // the body download is skipped entirely.
    const { storage } = memoryStorage({
      text: "cached-bytes",
      cloudRevision: "rev-7",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    let loadCalls = 0;
    const inner = makeInner({
      capabilities: new Set(["getRevision"]),
      async getRevision() {
        return "rev-7";
      },
      async load() {
        loadCalls += 1;
        return { text: "should-not-download", revision: "rev-7" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.load();
    // Painted from the cache, not the network.
    expect(snap).toEqual({ text: "cached-bytes", revision: "rev-7" });
    await flush();
    // The matching probe meant the full body was never downloaded.
    expect(loadCalls).toBe(0);
  });

  it("delivers fresh remote bytes through watch when the revision moved", async () => {
    const { storage, peek } = memoryStorage({
      text: "cached-bytes",
      cloudRevision: "rev-7",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner({
      capabilities: new Set(["getRevision"]),
      async getRevision() {
        return "rev-8";
      },
      async load() {
        return { text: "fresh-bytes", revision: "rev-8" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const delivered: Snapshot[] = [];
    adapter.watch!((snap) => delivered.push(snap));

    const snap = await adapter.load();
    expect(snap).toEqual({ text: "cached-bytes", revision: "rev-7" });
    await flush();
    // The moved revision triggered a body download, delivered through
    // the watch channel and persisted to the mirror.
    expect(delivered).toEqual([{ text: "fresh-bytes", revision: "rev-8" }]);
    expect(peek()?.text).toBe("fresh-bytes");
    expect(peek()?.cloudRevision).toBe("rev-8");
  });

  it("buffers a background delivery until a watcher subscribes", async () => {
    // The mount load() can resolve and revalidate before the hook's
    // watch effect runs. The fresh snapshot is parked and flushed on
    // subscribe so the re-paint isn't lost to the mount-order race.
    const { storage } = memoryStorage({
      text: "cached-bytes",
      cloudRevision: "rev-7",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner({
      async load() {
        return { text: "fresh-bytes", revision: "rev-9" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    await adapter.load();
    await flush();
    // Subscribe only after the revalidation has already resolved.
    const delivered: Snapshot[] = [];
    adapter.watch!((snap) => delivered.push(snap));
    expect(delivered).toEqual([{ text: "fresh-bytes", revision: "rev-9" }]);
  });

  it("falls back to a full load to revalidate when getRevision is absent", async () => {
    const { storage } = memoryStorage({
      text: "cached-bytes",
      cloudRevision: "rev-7",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    let loadCalls = 0;
    const inner = makeInner({
      async load() {
        loadCalls += 1;
        // Same revision — nothing to deliver, but the body was fetched.
        return { text: "cached-bytes", revision: "rev-7" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const delivered: Snapshot[] = [];
    adapter.watch!((snap) => delivered.push(snap));
    await adapter.load();
    await flush();
    expect(loadCalls).toBe(1);
    expect(delivered).toEqual([]);
  });

  it("keeps the cache (no reject) when a background revalidation hits offline", async () => {
    // A network failure discovered in the background doesn't yank the
    // user off their cached data — offline surfaces and queues on the
    // next save through the existing save path.
    const { storage } = memoryStorage({
      text: "cached-bytes",
      cloudRevision: "rev-7",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner({
      async load() {
        // TypeError is what `fetch` throws on a network failure.
        throw new TypeError("Failed to fetch");
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const delivered: Snapshot[] = [];
    adapter.watch!((snap) => delivered.push(snap));
    const snap = await adapter.load();
    expect(snap).toEqual({ text: "cached-bytes", revision: "rev-7" });
    await flush();
    expect(delivered).toEqual([]);
  });

  it("keeps the cache (no reject) when a background revalidation hits AuthError", async () => {
    const { storage } = memoryStorage({
      text: "cached",
      cloudRevision: "rev-3",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner({
      async load() {
        throw new AuthError("expired");
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const delivered: Snapshot[] = [];
    adapter.watch!((snap) => delivered.push(snap));
    const snap = await adapter.load();
    expect(snap).toEqual({ text: "cached", revision: "rev-3" });
    await flush();
    expect(delivered).toEqual([]);
  });

  it("propagates AuthError on the blocking path when there is no cache", async () => {
    // First load (nothing cached) still surfaces auth synchronously so
    // the hook can show the Reconnect affordance instead of a blank app.
    const { storage } = memoryStorage();
    const inner = makeInner({
      async load() {
        throw new AuthError("expired");
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    await expect(adapter.load()).rejects.toBeInstanceOf(AuthError);
  });

  it("captures offline saves to the mirror with bumped localRevision", async () => {
    const { storage, peek } = memoryStorage({
      text: "synced",
      cloudRevision: "rev-2",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner({
      async save() {
        throw new TypeError("Failed to fetch");
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.save("offline-bytes", "rev-2");
    expect(snap).toEqual({
      text: "offline-bytes",
      revision: "rev-2",
      offline: true,
    });
    const mirror = peek();
    expect(mirror?.text).toBe("offline-bytes");
    expect(mirror?.cloudRevision).toBe("rev-2");
    expect(mirror?.localRevision).toBe(1);
  });

  it("flushes pending local edits on next online save", async () => {
    const { storage, peek } = memoryStorage({
      text: "offline-bytes",
      cloudRevision: "rev-2",
      localRevision: 1,
      updatedAt: 1,
      backendId: "dropbox",
    });
    let received: { text: string; baseRev?: string } | null = null;
    const inner = makeInner({
      async save(text: string, baseRevision?: string) {
        received = { text, baseRev: baseRevision };
        return { text, revision: "rev-3" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.save("offline-bytes", "rev-2");
    expect(snap).toEqual({ text: "offline-bytes", revision: "rev-3" });
    expect(received).toEqual({ text: "offline-bytes", baseRev: "rev-2" });
    const mirror = peek();
    expect(mirror?.localRevision).toBe(0);
    expect(mirror?.cloudRevision).toBe("rev-3");
  });

  it("surfaces divergence as a ConflictError carrying both sides", async () => {
    const { storage } = memoryStorage({
      text: "local-bytes",
      cloudRevision: "rev-2",
      localRevision: 1,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const remote: Snapshot = { text: "remote-bytes", revision: "rev-9" };
    const inner = makeInner({
      async load() {
        return remote;
      },
      async save() {
        throw new ConflictError(remote);
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    await expect(adapter.load()).rejects.toMatchObject({
      name: "ConflictError",
      remote,
      local: { text: "local-bytes", revision: "rev-2" },
    });
  });

  it("flushes pending edits inside load when the remote hasn't moved", async () => {
    const { storage, peek } = memoryStorage({
      text: "local-bytes",
      cloudRevision: "rev-2",
      localRevision: 1,
      updatedAt: 1,
      backendId: "dropbox",
    });
    let pushed: { text: string; baseRev?: string } | null = null;
    const inner = makeInner({
      async load() {
        return { text: "remote-old", revision: "rev-2" };
      },
      async save(text: string, baseRevision?: string) {
        pushed = { text, baseRev: baseRevision };
        return { text, revision: "rev-3" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.load();
    expect(pushed).toEqual({ text: "local-bytes", baseRev: "rev-2" });
    expect(snap).toEqual({ text: "local-bytes", revision: "rev-3" });
    const mirror = peek();
    expect(mirror?.localRevision).toBe(0);
    expect(mirror?.cloudRevision).toBe("rev-3");
  });

  it("attaches local bytes to a save-time ConflictError so the modal can show both", async () => {
    const { storage, peek } = memoryStorage({
      text: "stale-cache",
      cloudRevision: "rev-5",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const remote: Snapshot = { text: "winner", revision: "rev-9" };
    const inner = makeInner({
      async save() {
        throw new ConflictError(remote);
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const err = await adapter
      .save("loser", "rev-5")
      .catch((e: unknown) => e as ConflictError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.remote).toEqual(remote);
    expect(err.local).toEqual({ text: "loser", revision: "rev-5" });
    // The wrapper also persists the would-have-been bytes so a
    // reload re-surfaces the conflict.
    const mirror = peek() as CloudMirrorState;
    expect(mirror.text).toBe("loser");
    expect(mirror.localRevision).toBe(1);
  });

  it("markSynced stamps the mirror with caller-supplied bytes and resets localRevision", async () => {
    const { storage, peek } = memoryStorage({
      text: "stale-local",
      cloudRevision: "rev-5",
      localRevision: 3,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner();
    const adapter = withCloudMirror(inner, { storage });

    adapter.markSynced!({ text: "winner", revision: "rev-9" });
    // markSynced is fire-and-forget — yield once so the queued write
    // settles before we inspect.
    await Promise.resolve();
    await Promise.resolve();
    const mirror = peek();
    expect(mirror?.text).toBe("winner");
    expect(mirror?.cloudRevision).toBe("rev-9");
    expect(mirror?.localRevision).toBe(0);
  });

  it("drops a cache written by a different backend instead of treating it as pending edits", async () => {
    // Regression: the mirror is per-user only, so a Google Drive ↔
    // Dropbox switch would re-use the previous provider's cache.
    // With `localRevision > 0` the wrapper would either push the
    // stale bytes through the new provider or trip a bogus conflict
    // on revisions from a completely different service. Both end
    // with a blank budget on the new cloud.
    const { storage, peek } = memoryStorage({
      text: "gdrive-pending",
      cloudRevision: "gdrive-rev",
      localRevision: 5,
      updatedAt: 1,
      backendId: "gdrive",
    });
    let pushed = false;
    const inner = makeInner({
      // makeInner defaults to id="dropbox" — different backend.
      async load() {
        return { text: "real-dropbox-bytes", revision: "dropbox-rev" };
      },
      async save() {
        pushed = true;
        return { text: "", revision: "" };
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.load();
    expect(snap).toEqual({
      text: "real-dropbox-bytes",
      revision: "dropbox-rev",
    });
    // Critically: no save fired. The stale GDrive bytes did not
    // overwrite Dropbox.
    expect(pushed).toBe(false);
    // The mirror is re-stamped with the new backend's bytes.
    const mirror = peek();
    expect(mirror?.text).toBe("real-dropbox-bytes");
    expect(mirror?.backendId).toBe("dropbox");
    expect(mirror?.localRevision).toBe(0);
  });

  it("clears the mirror in the background when the remote was deleted", async () => {
    // Remote deleted out from under a clean cache: the user keeps
    // seeing their cached data this session (the cache is still served),
    // but the background revalidation clears the mirror so the next
    // load seeds a fresh budget rather than resurrecting deleted bytes.
    const { storage, peek } = memoryStorage({
      text: "stale",
      cloudRevision: "rev-1",
      localRevision: 0,
      updatedAt: 1,
      backendId: "dropbox",
    });
    const inner = makeInner({
      async load() {
        return null;
      },
    });
    const adapter = withCloudMirror(inner, { storage });

    const snap = await adapter.load();
    // Cache is still painted this session.
    expect(snap).toEqual({ text: "stale", revision: "rev-1" });
    await flush();
    // ...but the mirror is cleared so the next load starts fresh.
    expect(peek()).toBeNull();
  });
});

describe("ConflictError", () => {
  it("carries the remote snapshot", () => {
    const err = new ConflictError({ text: "{}", revision: "rev-2" });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConflictError");
    expect(err.remote).toEqual({ text: "{}", revision: "rev-2" });
  });
});
