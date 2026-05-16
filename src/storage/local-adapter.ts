import { STORAGE_KEY } from "../data/constants";
import type { Snapshot, StorageAdapter } from "./adapter";

// localStorage-backed adapter. This is the default; the app starts
// here on first launch and stays here until the user opts into a
// cloud backend.
//
// Synchronous on both sides: `loadSync` hands the snapshot back
// before the first paint, and `save` writes immediately. There is no
// revision token — nothing else writes to the same key from outside
// the tab, so optimistic concurrency would be ceremony with no
// payoff.

function readRaw(key: string): string | null {
  try {
    return typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(key);
  } catch {
    // disabled / blocked storage — caller treats this as "no data"
    return null;
  }
}

function writeRaw(key: string, text: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, text);
  } catch {
    // quota / disabled — silent fail; a future surface could notify the user
  }
}

export function readRawStorage(key: string = STORAGE_KEY): string | null {
  return readRaw(key);
}

export function writeRawStorage(text: string, key: string = STORAGE_KEY): void {
  writeRaw(key, text);
}

export function clearRawStorage(key: string = STORAGE_KEY): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // disabled / blocked storage — silent fail
  }
}

// Factory: produce a localStorage adapter bound to a specific key.
// Used so each user's budget can live under its own key without
// duplicating the surrounding adapter logic.
export function createLocalAdapter(key: string): StorageAdapter {
  return {
    id: "local",
    label: "This device",
    saveDebounceMs: 0,

    loadSync(): Snapshot | null {
      const raw = readRaw(key);
      return raw === null ? null : { text: raw };
    },

    async load(): Promise<Snapshot | null> {
      const raw = readRaw(key);
      return raw === null ? null : { text: raw };
    },

    async save(text: string): Promise<Snapshot> {
      writeRaw(key, text);
      return { text };
    },
  };
}

// Default adapter pointed at the legacy single-user bucket. Kept for
// the migration path that copies pre-account data into a new user's
// budget on first launch.
export const localAdapter: StorageAdapter = createLocalAdapter(STORAGE_KEY);
