import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "../src/storage/adapter";
import {
  type CloudMirrorState,
  readCloudMirror,
  withCloudMirror,
  writeCloudMirror,
} from "../src/storage/cloud-mirror";

// Drop-in localStorage shim — mirrors the one used in
// `storage_adapter_test.ts`. Vitest runs under Node, so without it
// the wrapper's `readRawStorage` / `writeRawStorage` calls would
// silently no-op and the assertions would all pass for the wrong
// reason.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const KEY = "budget.cloud-mirror.test";

function makeInner(
  overrides: Partial<StorageAdapter> = {},
): StorageAdapter & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    id: "dropbox",
    label: "Dropbox",
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
  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
      new MemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
  });

  it("mirrors a successful cloud load into localStorage", async () => {
    const inner = makeInner({
      async load() {
        return { text: "remote-bytes", revision: "rev-1" };
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const snap = await adapter.load();
    expect(snap).toEqual({ text: "remote-bytes", revision: "rev-1" });
    const mirror = readCloudMirror(KEY);
    expect(mirror?.text).toBe("remote-bytes");
    expect(mirror?.cloudRevision).toBe("rev-1");
    expect(mirror?.localRevision).toBe(0);
  });

  it("serves the mirror as `offline: true` when load throws a network error", async () => {
    writeCloudMirror(KEY, {
      text: "cached-bytes",
      cloudRevision: "rev-7",
      localRevision: 0,
      updatedAt: 1,
    });
    const inner = makeInner({
      async load() {
        // TypeError is what `fetch` throws on a network failure.
        throw new TypeError("Failed to fetch");
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const snap = await adapter.load();
    expect(snap).toEqual({
      text: "cached-bytes",
      revision: "rev-7",
      offline: true,
    });
  });

  it("propagates AuthError without falling back to the mirror", async () => {
    writeCloudMirror(KEY, {
      text: "cached",
      cloudRevision: "rev-3",
      localRevision: 0,
      updatedAt: 1,
    });
    const inner = makeInner({
      async load() {
        throw new AuthError("expired");
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    await expect(adapter.load()).rejects.toBeInstanceOf(AuthError);
  });

  it("captures offline saves to the mirror with bumped localRevision", async () => {
    writeCloudMirror(KEY, {
      text: "synced",
      cloudRevision: "rev-2",
      localRevision: 0,
      updatedAt: 1,
    });
    const inner = makeInner({
      async save() {
        throw new TypeError("Failed to fetch");
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const snap = await adapter.save("offline-bytes", "rev-2");
    expect(snap).toEqual({
      text: "offline-bytes",
      revision: "rev-2",
      offline: true,
    });
    const mirror = readCloudMirror(KEY);
    expect(mirror?.text).toBe("offline-bytes");
    expect(mirror?.cloudRevision).toBe("rev-2");
    expect(mirror?.localRevision).toBe(1);
  });

  it("flushes pending local edits on next online save", async () => {
    writeCloudMirror(KEY, {
      text: "offline-bytes",
      cloudRevision: "rev-2",
      localRevision: 1,
      updatedAt: 1,
    });
    let received: { text: string; baseRev?: string } | null = null;
    const inner = makeInner({
      async save(text: string, baseRevision?: string) {
        received = { text, baseRev: baseRevision };
        return { text, revision: "rev-3" };
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const snap = await adapter.save("offline-bytes", "rev-2");
    expect(snap).toEqual({ text: "offline-bytes", revision: "rev-3" });
    expect(received).toEqual({ text: "offline-bytes", baseRev: "rev-2" });
    const mirror = readCloudMirror(KEY);
    expect(mirror?.localRevision).toBe(0);
    expect(mirror?.cloudRevision).toBe("rev-3");
  });

  it("surfaces divergence as a ConflictError carrying both sides", async () => {
    writeCloudMirror(KEY, {
      text: "local-bytes",
      cloudRevision: "rev-2",
      localRevision: 1,
      updatedAt: 1,
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
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    await expect(adapter.load()).rejects.toMatchObject({
      name: "ConflictError",
      remote,
      local: { text: "local-bytes", revision: "rev-2" },
    });
  });

  it("flushes pending edits inside load when the remote hasn't moved", async () => {
    writeCloudMirror(KEY, {
      text: "local-bytes",
      cloudRevision: "rev-2",
      localRevision: 1,
      updatedAt: 1,
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
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const snap = await adapter.load();
    expect(pushed).toEqual({ text: "local-bytes", baseRev: "rev-2" });
    expect(snap).toEqual({ text: "local-bytes", revision: "rev-3" });
    const mirror = readCloudMirror(KEY);
    expect(mirror?.localRevision).toBe(0);
    expect(mirror?.cloudRevision).toBe("rev-3");
  });

  it("attaches local bytes to a save-time ConflictError so the modal can show both", async () => {
    writeCloudMirror(KEY, {
      text: "stale-cache",
      cloudRevision: "rev-5",
      localRevision: 0,
      updatedAt: 1,
    });
    const remote: Snapshot = { text: "winner", revision: "rev-9" };
    const inner = makeInner({
      async save() {
        throw new ConflictError(remote);
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const err = await adapter
      .save("loser", "rev-5")
      .catch((e: unknown) => e as ConflictError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.remote).toEqual(remote);
    expect(err.local).toEqual({ text: "loser", revision: "rev-5" });
    // The wrapper also persists the would-have-been bytes so a
    // reload re-surfaces the conflict.
    const mirror = readCloudMirror(KEY) as CloudMirrorState;
    expect(mirror.text).toBe("loser");
    expect(mirror.localRevision).toBe(1);
  });

  it("markSynced stamps the mirror with caller-supplied bytes and resets localRevision", () => {
    writeCloudMirror(KEY, {
      text: "stale-local",
      cloudRevision: "rev-5",
      localRevision: 3,
      updatedAt: 1,
    });
    const inner = makeInner();
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    adapter.markSynced!({ text: "winner", revision: "rev-9" });
    const mirror = readCloudMirror(KEY);
    expect(mirror?.text).toBe("winner");
    expect(mirror?.cloudRevision).toBe("rev-9");
    expect(mirror?.localRevision).toBe(0);
  });

  it("clears the mirror when the remote returns null and a cache existed", async () => {
    writeCloudMirror(KEY, {
      text: "stale",
      cloudRevision: "rev-1",
      localRevision: 0,
      updatedAt: 1,
    });
    const inner = makeInner({
      async load() {
        return null;
      },
    });
    const adapter = withCloudMirror(inner, { storageKey: KEY });

    const snap = await adapter.load();
    expect(snap).toBeNull();
    expect(readCloudMirror(KEY)).toBeNull();
  });
});
