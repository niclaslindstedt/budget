// Ephemeral in-memory storage backend preloaded with fake data, used
// by the developer "Fake data" toggle (see `src/hooks/useDevSeed.ts`
// and the swap in `AppShell`). It is never persisted: the seed lives
// in a closure variable for the lifetime of the adapter instance, edits
// during the dev session round-trip through `save`, and the whole thing
// is discarded when the toggle flips off (or the page reloads), at
// which point `AppShell` feeds the real adapter back and the load
// effect reloads the user's untouched data.
//
// Because the substitution happens AFTER the encryption / cloud-mirror
// wrapping in `useStorageBackend`, the fake bytes are never encrypted,
// mirrored, or written to any real backend.

import { buildSeedUserData } from "../data/dev/seed";
import type { Snapshot, StorageAdapter } from "./adapter";
import { serializeUserData } from "./file";

export function createDevSeedAdapter(): StorageAdapter {
  // Seed once on creation. A fresh adapter (fresh seed) is built each
  // time the toggle is turned on.
  let text = serializeUserData(buildSeedUserData());

  return {
    id: "dev",
    label: "Developer (fake data)",
    saveDebounceMs: 0,
    // `loadSync` so the seed paints on the first frame, no spinner —
    // mirrors the localStorage fast path. No backups / receipts /
    // payslips: those gate cloud / folder UI we don't want for a
    // throwaway in-memory store.
    capabilities: new Set(["loadSync"]),

    loadSync(): Snapshot | null {
      return { text };
    },

    load(): Promise<Snapshot | null> {
      return Promise.resolve({ text });
    },

    save(next: string): Promise<Snapshot> {
      text = next;
      return Promise.resolve({ text });
    },
  };
}
