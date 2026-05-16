import { STORAGE_KEY } from "../data/constants";
import type { Snapshot, StorageAdapter } from "./adapter";

// localStorage-backed adapter. This is the default; the app starts
// here on first launch and stays here until the user opts into a
// cloud backend.
//
// Synchronous on both sides: `loadSync` hands the snapshot back
// before the first paint, and `save` writes immediately. There is no
// revision token — nothing else writes to `STORAGE_KEY` from outside
// the tab, so optimistic concurrency would be ceremony with no
// payoff.

function readRaw(): string | null {
  try {
    return typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(STORAGE_KEY);
  } catch {
    // disabled / blocked storage — caller treats this as "no data"
    return null;
  }
}

function writeRaw(text: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // quota / disabled — silent fail; a future surface could notify the user
  }
}

export const localAdapter: StorageAdapter = {
  id: "local",
  label: "This device",
  saveDebounceMs: 0,

  loadSync(): Snapshot | null {
    const raw = readRaw();
    return raw === null ? null : { text: raw };
  },

  async load(): Promise<Snapshot | null> {
    return this.loadSync!();
  },

  async save(text: string): Promise<Snapshot> {
    writeRaw(text);
    return { text };
  },
};
