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
//
// DELIBERATELY NO `loadSync` / `"loadSync"` capability. This adapter is
// only ever swapped in MID-SESSION (the toggle is off at mount), never
// the initial adapter. The load effect in `useLoadState` only runs the
// synchronous fast path on the first mount (`!hasLoadedRef`); once a
// previous backend has loaded, a `loadSync` adapter hits the "load
// skipped" branch and the seed never replaces the real data on screen.
// The async `load()` path, by contrast, handles adapter swaps and
// repopulates state. So this adapter stays async-only on purpose —
// adding `loadSync` to "avoid a spinner" silently reintroduces the bug
// where toggling the seed on leaves the real data in place. `load()`
// resolves on a microtask anyway, so there is no visible spinner.

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
    // No backups / receipts / payslips: those gate cloud / folder UI we
    // don't want for a throwaway in-memory store. No `loadSync` either
    // — see the file header.
    capabilities: new Set(),

    load(): Promise<Snapshot | null> {
      return Promise.resolve({ text });
    },

    save(next: string): Promise<Snapshot> {
      text = next;
      return Promise.resolve({ text });
    },
  };
}
