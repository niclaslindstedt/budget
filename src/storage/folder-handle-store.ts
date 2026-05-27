// IndexedDB-backed persistence for `FileSystemDirectoryHandle`s
// granted by the user when they pick a folder as the storage backend.
// Handles are structured-clone-safe, so IDB can persist them across
// reloads — the OS-level permission grant survives too, gated by a
// fresh `queryPermission` call on the next session.
//
// All operations are best-effort. If IDB is unavailable (Firefox
// private mode, exotic browser settings), every function resolves to
// the empty / null result and the caller falls back to the browser
// backend.

import { nsIdbName } from "../data/constants/storage";

// Preview build uses `budget-folder-handles-preview` so picking a
// folder in preview doesn't replace the production folder handle.
const DB_NAME = nsIdbName("budget-folder-handles");
const DB_VERSION = 1;
const STORE = "handles";

type HandleRecord = {
  userId: string;
  handle: FileSystemDirectoryHandle;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function saveDirectoryHandle(
  userId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const req = tx(db, "readwrite").put({
      userId,
      handle,
      createdAt: Date.now(),
    } satisfies HandleRecord);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
  db.close();
}

export async function loadDirectoryHandle(
  userId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  if (!db) return null;
  const record = await new Promise<HandleRecord | null>((resolve) => {
    const req = tx(db, "readonly").get(userId);
    req.onsuccess = () =>
      resolve((req.result as HandleRecord | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return record?.handle ?? null;
}

export async function clearDirectoryHandle(userId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const req = tx(db, "readwrite").delete(userId);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
  db.close();
}

// True only in browsers that expose the File System Access API
// directory picker. Currently Chromium-based (Chrome, Edge, Opera,
// Brave, Arc); Firefox and Safari return false.
export function isFolderBackendAvailable(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export type FolderPermissionResult = "granted" | "denied" | "prompt-denied";

// Probe (and, when allowed, request) the readwrite permission for an
// existing handle. Pass `requestIfPrompt: false` from non-gesture
// contexts (boot effect) so the call doesn't blow up; pass true from
// the Connect / Reconnect click handler where a user gesture is in
// scope.
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: FileSystemPermissionMode = "readwrite",
  requestIfPrompt = false,
): Promise<FolderPermissionResult> {
  const status = await handle.queryPermission({ mode });
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  // status === "prompt"
  if (!requestIfPrompt) return "prompt-denied";
  const requested = await handle.requestPermission({ mode });
  if (requested === "granted") return "granted";
  return "prompt-denied";
}
