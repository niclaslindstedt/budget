import {
  cloudMirrorKey,
  nsIdbName,
  userDataKey,
} from "../data/constants/storage";
import { createLogger } from "../utils/logger";
import type { Snapshot, StorageAdapter } from "./adapter";
import type { CloudMirrorState, CloudMirrorStorage } from "./cloud-mirror";
import { readRawStorage } from "./local-adapter";

// IndexedDB-backed persistence for the budget. Replaces the
// localStorage adapter as the default `browser` backend so big
// budgets no longer slam into the ~5 MB per-origin localStorage cap
// (UTF-16 code units, which works out to ~2.5 MB of JSON in the worst
// case). IndexedDB exposes tens to hundreds of MB per origin and is
// already used elsewhere in the codebase for the folder-handle store
// — same Promise-wrapped raw API, same best-effort failure mode when
// the browser doesn't expose `indexedDB` (Firefox private mode, etc.).
//
// Two object stores share one database so the cloud-mirror — which is
// just as big as the budget bytes it caches — moves out of
// localStorage in the same swap:
//
//   userData     keyPath "userId"  → { userId, text, updatedAt }
//   cloudMirror  keyPath "userId"  → { userId, state }
//
// Production opens `budget-data`; the `/preview/` build opens
// `budget-data-preview` via `nsIdbName()` so the two slots cannot
// touch each other's bytes.

const log = createLogger("idb");

const DB_NAME = nsIdbName("budget-data");
const DB_VERSION = 1;
const USER_DATA_STORE = "userData";
const CLOUD_MIRROR_STORE = "cloudMirror";

type UserDataRecord = {
  userId: string;
  text: string;
  updatedAt: number;
};

type CloudMirrorRecord = {
  userId: string;
  state: CloudMirrorState;
};

// Single-flight DB handle so concurrent callers don't trip
// `VersionError` racing each other on the same `indexedDB.open`.
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      log.warn("indexedDB unavailable — adapter will be a no-op");
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      log.error("indexedDB.open threw", err);
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(USER_DATA_STORE)) {
        db.createObjectStore(USER_DATA_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(CLOUD_MIRROR_STORE)) {
        db.createObjectStore(CLOUD_MIRROR_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab requested a higher version — close so it can upgrade.
      db.onversionchange = () => {
        log.warn("versionchange — closing DB so the upgrading tab can proceed");
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      log.error(`indexedDB.open failed (${request.error?.message ?? "?"})`);
      resolve(null);
    };
    request.onblocked = () => {
      log.warn("indexedDB.open blocked — another tab holds an older version");
      resolve(null);
    };
  });
  return dbPromise;
}

// Quota-aware put: surface `QuotaExceededError` so the caller (the
// adapter's `save`) can throw it instead of silently swallowing the
// write the way the localStorage adapter used to.
function putRecord<T>(
  db: IDBDatabase,
  storeName: string,
  record: T,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let req: IDBRequest;
    try {
      const tx = db.transaction(storeName, "readwrite");
      req = tx.objectStore(storeName).put(record);
    } catch (err) {
      reject(err);
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("IDB put failed"));
  });
}

function getRecord<T>(
  db: IDBDatabase,
  storeName: string,
  key: string,
): Promise<T | null> {
  return new Promise((resolve) => {
    let req: IDBRequest;
    try {
      const tx = db.transaction(storeName, "readonly");
      req = tx.objectStore(storeName).get(key);
    } catch (err) {
      log.error(`get(${storeName}/${key}) tx threw`, err);
      resolve(null);
      return;
    }
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => {
      log.error(`get(${storeName}/${key}) failed`, req.error);
      resolve(null);
    };
  });
}

function deleteRecord(
  db: IDBDatabase,
  storeName: string,
  key: string,
): Promise<void> {
  return new Promise((resolve) => {
    let req: IDBRequest;
    try {
      const tx = db.transaction(storeName, "readwrite");
      req = tx.objectStore(storeName).delete(key);
    } catch (err) {
      log.error(`delete(${storeName}/${key}) tx threw`, err);
      resolve();
      return;
    }
    req.onsuccess = () => resolve();
    req.onerror = () => {
      log.error(`delete(${storeName}/${key}) failed`, req.error);
      resolve();
    };
  });
}

// Best-effort persistence request — without this, browsers may evict
// the whole origin's IndexedDB under storage pressure. Chrome silently
// upgrades us to persistent when the site is installed as a PWA or
// has high engagement; Safari prompts the user. Either way we ask
// once on first DB open and ignore the answer.
let persistenceRequested = false;
async function requestPersistence(): Promise<void> {
  if (persistenceRequested) return;
  persistenceRequested = true;
  if (typeof navigator === "undefined") return;
  if (!navigator.storage || typeof navigator.storage.persist !== "function") {
    return;
  }
  try {
    const granted = await navigator.storage.persist();
    log.info(`storage.persist granted=${granted}`);
  } catch (err) {
    log.warn("storage.persist threw", err);
  }
}

// Lazy migration: on the first read for a given user, copy any
// pre-existing localStorage bucket into IndexedDB and delete the
// localStorage copy. Idempotent — once the IDB record exists, this
// short-circuits.
async function ensureUserDataMigrated(
  db: IDBDatabase,
  userId: string,
): Promise<UserDataRecord | null> {
  const existing = await getRecord<UserDataRecord>(db, USER_DATA_STORE, userId);
  if (existing) return existing;
  const legacyKey = userDataKey(userId);
  const legacy = readRawStorage(legacyKey);
  if (legacy === null) return null;
  log.info(`migrating localStorage ${legacyKey} → IDB userData/${userId}`);
  const record: UserDataRecord = {
    userId,
    text: legacy,
    updatedAt: Date.now(),
  };
  try {
    await putRecord(db, USER_DATA_STORE, record);
    removeRawLocalStorage(legacyKey);
    return record;
  } catch (err) {
    log.error(
      `migration of ${legacyKey} failed — leaving localStorage intact`,
      err,
    );
    return { userId, text: legacy, updatedAt: Date.now() };
  }
}

async function ensureCloudMirrorMigrated(
  db: IDBDatabase,
  userId: string,
): Promise<CloudMirrorRecord | null> {
  const existing = await getRecord<CloudMirrorRecord>(
    db,
    CLOUD_MIRROR_STORE,
    userId,
  );
  if (existing) return existing;
  const legacyKey = cloudMirrorKey(userId);
  const legacy = readRawStorage(legacyKey);
  if (legacy === null) return null;
  let parsed: CloudMirrorState | null = null;
  try {
    const obj = JSON.parse(legacy) as {
      v?: number;
      text?: unknown;
      cloudRevision?: unknown;
      localRevision?: unknown;
      updatedAt?: unknown;
      backendId?: unknown;
    };
    // The reader in cloud-mirror.ts rejects pre-v2 payloads (no
    // backendId), so we mirror that gate here. A migrated invalid
    // payload would just confuse the next reader.
    if (
      obj.v === 2 &&
      typeof obj.text === "string" &&
      typeof obj.backendId === "string"
    ) {
      parsed = {
        text: obj.text,
        cloudRevision:
          typeof obj.cloudRevision === "string" ? obj.cloudRevision : null,
        localRevision:
          typeof obj.localRevision === "number" ? obj.localRevision : 0,
        updatedAt:
          typeof obj.updatedAt === "number" ? obj.updatedAt : Date.now(),
        backendId: obj.backendId,
      };
    }
  } catch (err) {
    log.warn(`mirror migration: parse failed for ${legacyKey}`, err);
  }
  // Always delete the legacy key even if parsing failed — the new
  // path doesn't read it and leaving it around would keep eating
  // localStorage quota.
  removeRawLocalStorage(legacyKey);
  if (!parsed) return null;
  log.info(`migrating localStorage ${legacyKey} → IDB cloudMirror/${userId}`);
  const record: CloudMirrorRecord = { userId, state: parsed };
  try {
    await putRecord(db, CLOUD_MIRROR_STORE, record);
  } catch (err) {
    log.error(`mirror migration write failed for ${userId}`, err);
  }
  return record;
}

// Raw localStorage delete — the project's `clearRawStorage` defaults
// the key argument to `STORAGE_KEY`, which is the wrong call shape
// here. Kept local so the migration helpers don't accidentally wipe
// the legacy single-user bucket.
function removeRawLocalStorage(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // disabled / blocked — silent fail
  }
}

function isQuotaError(err: unknown): boolean {
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    if (err.name === "QuotaExceededError") return true;
    if (err.code === 22) return true;
  }
  return false;
}

// Adapter implementation. The wrapper chain on top (encryption,
// cloud-mirror for cloud backends) treats this as just another
// `StorageAdapter` — no `loadSync` (IDB is async-only) and no
// revision token (nothing else writes the same record from outside
// this tab, mirroring the localStorage adapter's no-concurrency
// stance).
export function createIdbAdapter({
  userId,
}: {
  userId: string;
}): StorageAdapter {
  return {
    id: "browser",
    label: "This browser",
    saveDebounceMs: 0,
    capabilities: new Set(),

    async load(): Promise<Snapshot | null> {
      void requestPersistence();
      const db = await openDb();
      if (!db) {
        const fallback = readRawStorage(userDataKey(userId));
        if (fallback === null) return null;
        log.warn(
          `IDB unavailable — returning localStorage fallback (${fallback.length} B)`,
        );
        return { text: fallback };
      }
      const record = await ensureUserDataMigrated(db, userId);
      return record ? { text: record.text } : null;
    },

    async save(text: string): Promise<Snapshot> {
      const db = await openDb();
      if (!db) {
        log.warn(`IDB unavailable — dropping save (${text.length} B)`);
        return { text };
      }
      try {
        await putRecord<UserDataRecord>(db, USER_DATA_STORE, {
          userId,
          text,
          updatedAt: Date.now(),
        });
      } catch (err) {
        if (isQuotaError(err)) {
          log.error(
            `save quota exceeded (${text.length} B) — IDB quota hit; user should migrate to a cloud or folder backend`,
          );
        } else {
          log.error("save failed", err);
        }
        throw err;
      }
      return { text };
    },
  };
}

// Direct byte access used by App.tsx's account-creation flow (legacy
// bucket → first real user, guest user → first real user, account
// deletion). Mirrors what `readRawStorage` / `writeRawStorage` /
// `clearRawStorage` did against localStorage, but routed through the
// IDB userData store and with the same lazy-migration trigger as the
// adapter's `load()`.
export async function readUserDataBytes(
  userId: string,
): Promise<string | null> {
  const db = await openDb();
  if (!db) return readRawStorage(userDataKey(userId));
  const record = await ensureUserDataMigrated(db, userId);
  return record?.text ?? null;
}

export async function writeUserDataBytes(
  userId: string,
  text: string,
): Promise<void> {
  const db = await openDb();
  if (!db) {
    log.warn(
      `IDB unavailable — dropping byte write for ${userId} (${text.length} B)`,
    );
    return;
  }
  try {
    await putRecord<UserDataRecord>(db, USER_DATA_STORE, {
      userId,
      text,
      updatedAt: Date.now(),
    });
  } catch (err) {
    if (isQuotaError(err)) {
      log.error(`writeUserDataBytes quota exceeded for ${userId}`);
    }
    throw err;
  }
}

export async function clearUserDataBytes(userId: string): Promise<void> {
  // Always sweep the legacy localStorage bucket too — covers users
  // who created an account before the lazy migration ever fired
  // against their record.
  removeRawLocalStorage(userDataKey(userId));
  const db = await openDb();
  if (!db) return;
  await deleteRecord(db, USER_DATA_STORE, userId);
}

// Cloud-mirror storage backed by the same IDB database. Pure-logic
// `withCloudMirror` in `cloud-mirror.ts` takes a `CloudMirrorStorage`
// so tests can inject an in-memory implementation; production wires
// this one in.
export function createIdbCloudMirrorStorage(
  userId: string,
): CloudMirrorStorage {
  return {
    async read(): Promise<CloudMirrorState | null> {
      const db = await openDb();
      if (!db) return null;
      const record = await ensureCloudMirrorMigrated(db, userId);
      return record?.state ?? null;
    },
    async write(state: CloudMirrorState): Promise<void> {
      const db = await openDb();
      if (!db) {
        log.warn(`IDB unavailable — dropping cloud-mirror write for ${userId}`);
        return;
      }
      try {
        await putRecord<CloudMirrorRecord>(db, CLOUD_MIRROR_STORE, {
          userId,
          state,
        });
      } catch (err) {
        if (isQuotaError(err)) {
          log.error(`cloud-mirror write quota exceeded for ${userId}`);
        }
        throw err;
      }
    },
    async clear(): Promise<void> {
      // Sweep the legacy localStorage bucket on every clear so a
      // user who never triggered the lazy mirror migration still
      // gets their old key wiped.
      removeRawLocalStorage(cloudMirrorKey(userId));
      const db = await openDb();
      if (!db) return;
      await deleteRecord(db, CLOUD_MIRROR_STORE, userId);
    },
  };
}

// Convenience for the call sites that just need to drop the mirror
// without holding a CloudMirrorStorage handle (account deletion,
// cloud disconnect, offline-mirror opt-out).
export async function clearCloudMirrorBytes(userId: string): Promise<void> {
  await createIdbCloudMirrorStorage(userId).clear();
}
