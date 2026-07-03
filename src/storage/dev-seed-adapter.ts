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
import type { ReceiptOps, Snapshot, StorageAdapter } from "./adapter";
import { serializeUserData } from "./file";

// One throwaway in-memory blob folder, one per file capability. The
// real backends keep receipts / payslips / property files / exports in
// separate sibling folders, so each capability gets its own map rather
// than a single shared one — a receipt and a property file that happen
// to share a relative path must not collide. Bytes live only for the
// lifetime of the adapter instance (the fake-data session) and are
// never persisted, encrypted, or mirrored.
function inMemoryFileOps(): ReceiptOps {
  const blobs = new Map<string, Blob>();
  return {
    upload(path, blob) {
      blobs.set(path, blob);
      return Promise.resolve();
    },
    download(path) {
      return Promise.resolve(blobs.get(path) ?? null);
    },
    remove(path) {
      blobs.delete(path);
      return Promise.resolve();
    },
  };
}

export function createDevSeedAdapter(): StorageAdapter {
  // Seed once on creation. A fresh adapter (fresh seed) is built each
  // time the toggle is turned on.
  let text = serializeUserData(buildSeedUserData());

  return {
    id: "dev",
    label: "Developer (fake data)",
    saveDebounceMs: 0,
    // Advertise the blob-file capabilities so the attachment flows the
    // seed preloads data for — property files, repair receipts, item
    // receipts, payslips, car contracts, saved exports — are fully reachable in
    // fake-data mode. Without these, the Files manager (and friends)
    // would list seeded rows but hide the upload button, since the UI
    // gates the upload / manage affordance on the capability. The seed
    // preloads file *records* whose bytes were never written to these
    // maps, so opening a seeded file still shows the viewer's "can't
    // load" state — but uploading, replacing, and removing round-trip
    // through the in-memory store. No `backups` (a different,
    // manifest-shaped contract unrelated to the attachment flows) and
    // no `loadSync` — see the file header for why the sync path stays
    // off.
    capabilities: new Set([
      "receipts",
      "payslips",
      "propertyFiles",
      "carFiles",
      "exports",
    ]),
    receipts: inMemoryFileOps(),
    payslips: inMemoryFileOps(),
    propertyFiles: inMemoryFileOps(),
    carFiles: inMemoryFileOps(),
    exports: inMemoryFileOps(),

    load(): Promise<Snapshot | null> {
      return Promise.resolve({ text });
    },

    save(next: string): Promise<Snapshot> {
      text = next;
      return Promise.resolve({ text });
    },
  };
}
