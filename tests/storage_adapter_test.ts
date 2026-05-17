import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STORAGE_KEY } from "../src/data/constants";
import { createDefaultSheet } from "../src/data/sheet";
import type { UserData } from "../src/data/types";
import { ConflictError } from "../src/storage/adapter";
import { serializeUserData } from "../src/storage/file";
import { localAdapter } from "../src/storage/local-adapter";

function sampleData(): UserData {
  const accountId = "acct-1";
  const sheet = createDefaultSheet("Tests", accountId);
  return {
    version: 7,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: accountId, name: "Default" }],
    categories: [],
  } as unknown as UserData;
}

// Drop-in localStorage shim for the test environment. Vitest runs under
// Node, which has no DOM by default — so the adapter's `typeof
// localStorage === "undefined"` branch would otherwise be the only one
// exercised. We attach a minimal Storage to globalThis so both branches
// of the adapter are observable.
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

describe("localAdapter", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
      storage;
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
  });

  it("loadSync returns null when nothing is stored", () => {
    expect(localAdapter.loadSync?.()).toBeNull();
  });

  it("round-trips data through save + loadSync", async () => {
    const text = serializeUserData(sampleData());
    await localAdapter.save(text);
    expect(storage.getItem(STORAGE_KEY)).toBe(text);
    expect(localAdapter.loadSync?.()).toEqual({ text });
  });

  it("async load mirrors loadSync", async () => {
    const text = serializeUserData(sampleData());
    await localAdapter.save(text);
    const snap = await localAdapter.load();
    expect(snap).toEqual({ text });
  });

  it("save resolves to a snapshot containing the written text", async () => {
    const text = serializeUserData(sampleData());
    const snap = await localAdapter.save(text);
    expect(snap.text).toBe(text);
    // Local has no revision — nothing else writes the same key.
    expect(snap.revision).toBeUndefined();
  });

  it("declares zero debounce so behavior matches pre-adapter saves", () => {
    expect(localAdapter.saveDebounceMs).toBe(0);
  });

  it("does not throw when localStorage is unavailable", async () => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
    const text = serializeUserData(sampleData());
    await expect(localAdapter.save(text)).resolves.toEqual({ text });
    await expect(localAdapter.load()).resolves.toBeNull();
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
