import { STORAGE_KEY } from "../data/constants/storage";

// Raw localStorage byte access for the small per-user / per-device
// preferences that still live in `localStorage`: the legacy pre-
// account `STORAGE_KEY` bucket, the users registry, backend
// preferences, OAuth tokens, download preferences, the dev-mode
// flags. These need synchronous reads at boot, are tiny (well under
// 5 MB combined), and can't move to IndexedDB without paying for an
// async open on every page load.
//
// The user-data bucket and the cloud-mirror cache — the two big
// surfaces that used to live here — now live in IndexedDB; see
// `idb-adapter.ts`.

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
    // quota / disabled — silent fail
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
