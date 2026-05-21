import { createLogger } from "../utils/logger";
import {
  AuthError,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import {
  clearRawStorage,
  readRawStorage,
  writeRawStorage,
} from "./local-adapter";

const log = createLogger("cloud-mirror");

// Higher-order adapter that keeps a copy of the cloud bytes in
// localStorage so a session opened with no network can still load
// the last-known state, edit it locally, and push when the cloud
// comes back. Sits *under* `withEncryption` so the mirror holds the
// same envelope bytes the cloud holds — encryption-on installs keep
// their on-disk threat model end-to-end.
//
// State transitions the wrapper drives:
//
// 1. `load()` while online: fetch from cloud, write the result to
//    the mirror, return the cloud snapshot.
// 2. `load()` while offline: return the mirror snapshot with
//    `offline: true`. The hook surfaces `kind: "offline"` and the
//    user keeps editing.
// 3. `load()` with pending local edits and an unchanged remote: push
//    the mirror to the cloud first, then return the post-push
//    snapshot. Same baseRevision the offline `save()` would have
//    used, so the cloud accepts it cleanly.
// 4. `load()` with pending local edits and a moved remote: throw
//    `ConflictError` carrying both `local` (the mirror) and `remote`
//    (the freshly-fetched cloud bytes) so the hook can prompt the
//    user to pick a side.
// 5. `save()` while online: push to cloud, mirror the result.
// 6. `save()` while offline: write the new bytes to the mirror with
//    `localRevision` bumped and the last-known `cloudRevision` kept,
//    return a snapshot tagged `offline: true` so the hook doesn't
//    treat it as a hard error.

// On-disk shape of the mirror. Kept under `cloudMirrorKey(userId)`
// in `localStorage`. `text` is the bytes the inner adapter would
// have returned — ciphertext when encryption is on, plaintext
// otherwise. `cloudRevision` is the revision token the cloud
// returned the last time we successfully synced (Dropbox `rev`,
// Drive `ETag`, …). `localRevision` is a monotonic counter that
// bumps every time `save` was called while offline; 0 means the
// mirror matches the cloud at `cloudRevision`. `updatedAt` is the
// wall-clock ms the mirror was last written, surfaced in the
// "offline since {when}" copy.
export type CloudMirrorState = {
  text: string;
  cloudRevision: string | null;
  localRevision: number;
  updatedAt: number;
};

const SCHEMA_VERSION = 1;

type SerializedMirror = {
  v: typeof SCHEMA_VERSION;
  text: string;
  cloudRevision: string | null;
  localRevision: number;
  updatedAt: number;
};

export function readCloudMirror(key: string): CloudMirrorState | null {
  const raw = readRawStorage(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SerializedMirror;
    if (parsed.v !== SCHEMA_VERSION) return null;
    if (typeof parsed.text !== "string") return null;
    return {
      text: parsed.text,
      cloudRevision:
        typeof parsed.cloudRevision === "string" ? parsed.cloudRevision : null,
      localRevision:
        typeof parsed.localRevision === "number" ? parsed.localRevision : 0,
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    };
  } catch (err) {
    log.warn(`mirror parse failed key=${key}`, err);
    return null;
  }
}

export function writeCloudMirror(key: string, state: CloudMirrorState): void {
  const payload: SerializedMirror = {
    v: SCHEMA_VERSION,
    text: state.text,
    cloudRevision: state.cloudRevision,
    localRevision: state.localRevision,
    updatedAt: state.updatedAt,
  };
  writeRawStorage(JSON.stringify(payload), key);
}

export function clearCloudMirror(key: string): void {
  clearRawStorage(key);
}

// Fetch failures bubble out of the cloud adapters as native errors
// (TypeError from `fetch`, AbortError, "Failed to fetch", …). HTTP
// error responses come back as `new Error("Dropbox load failed: 500
// ...")` — we leave those alone because they're not really "offline",
// the server is reachable and saying no. Auth and conflict errors are
// signals the wrapper needs to forward verbatim.
function isOfflineError(err: unknown): boolean {
  if (err instanceof AuthError) return false;
  if (err instanceof ConflictError) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const name = err.name;
    if (name === "AbortError" || name === "NetworkError") return true;
    const msg = err.message.toLowerCase();
    if (msg.includes("failed to fetch")) return true;
    if (msg.includes("network")) return true;
    if (msg.includes("offline")) return true;
  }
  return false;
}

export type CloudMirrorOptions = {
  // Where to persist the mirror. Pass the per-user key from
  // `cloudMirrorKey(userId)` so each account on a shared device gets
  // its own cache.
  storageKey: string;
};

export function withCloudMirror(
  inner: StorageAdapter,
  options: CloudMirrorOptions,
): StorageAdapter {
  const { storageKey } = options;

  function mirror(): CloudMirrorState | null {
    return readCloudMirror(storageKey);
  }

  function persist(state: CloudMirrorState): void {
    writeCloudMirror(storageKey, state);
  }

  // Helper to compare an inner-adapter snapshot against the mirror's
  // last-known cloud revision. When both sides agree, we can safely
  // push the mirror's pending edits without prompting the user.
  function remoteMovedPast(
    cached: CloudMirrorState,
    fresh: Snapshot | null,
  ): boolean {
    const remoteRev = fresh?.revision ?? null;
    return remoteRev !== cached.cloudRevision;
  }

  async function tryPushPending(
    cached: CloudMirrorState,
  ): Promise<Snapshot | null> {
    // Used by `load()` when the mirror has unsynced edits and the
    // remote hasn't moved past our cloudRevision. We push the
    // mirror bytes through the cloud adapter; on success the mirror
    // collapses back to "in sync", on offline failure we keep the
    // mirror as-is and surface offline so the user keeps editing.
    log.info(
      `load: flushing pending edits localRev=${cached.localRevision} cloudRev=${cached.cloudRevision ?? "<none>"}`,
    );
    try {
      const pushed = await inner.save(
        cached.text,
        cached.cloudRevision ?? undefined,
      );
      persist({
        text: pushed.text,
        cloudRevision: pushed.revision ?? null,
        localRevision: 0,
        updatedAt: Date.now(),
      });
      log.info(
        `load: flush ok newRev=${pushed.revision ?? "<none>"} bytes=${pushed.text.length}`,
      );
      return pushed;
    } catch (err) {
      if (err instanceof ConflictError) {
        // Remote moved while we were flushing — surface as
        // divergence so the user can pick a side. The cloud adapter
        // re-reads on conflict, so `err.remote` already carries the
        // fresh bytes.
        log.warn(
          `load: flush conflict remoteRev=${err.remote.revision ?? "<none>"}`,
        );
        throw new ConflictError(err.remote, {
          text: cached.text,
          revision: cached.cloudRevision ?? undefined,
        });
      }
      if (isOfflineError(err)) {
        log.info("load: flush failed offline — serving mirror");
        return {
          text: cached.text,
          revision: cached.cloudRevision ?? undefined,
          offline: true,
        };
      }
      throw err;
    }
  }

  return {
    id: inner.id,
    label: inner.label,
    saveDebounceMs: inner.saveDebounceMs,
    backups: inner.backups,

    markSynced(snapshot: Snapshot): void {
      log.info(
        `markSynced: stamping mirror bytes=${snapshot.text.length} rev=${snapshot.revision ?? "<none>"}`,
      );
      persist({
        text: snapshot.text,
        cloudRevision: snapshot.revision ?? null,
        localRevision: 0,
        updatedAt: Date.now(),
      });
    },

    // No `loadSync` even when the inner has one: the mirror is a
    // localStorage round-trip, and a cloud adapter never offers
    // sync loads anyway. Callers fall back to async `load()`.

    async load(): Promise<Snapshot | null> {
      const cached = mirror();
      log.info(
        `load: start cached=${cached ? `bytes=${cached.text.length} localRev=${cached.localRevision} cloudRev=${cached.cloudRevision ?? "<none>"}` : "<none>"}`,
      );
      try {
        const fresh = await inner.load();
        if (cached && cached.localRevision > 0) {
          if (remoteMovedPast(cached, fresh)) {
            log.warn(
              `load: divergence — local has ${cached.localRevision} pending edits, remoteRev=${fresh?.revision ?? "<none>"} cachedCloudRev=${cached.cloudRevision ?? "<none>"}`,
            );
            // `fresh` may be null (remote was deleted while we were
            // offline) — still a conflict the user has to resolve.
            const remoteSnapshot: Snapshot = fresh ?? {
              text: "",
              revision: undefined,
            };
            throw new ConflictError(remoteSnapshot, {
              text: cached.text,
              revision: cached.cloudRevision ?? undefined,
            });
          }
          // Remote unchanged from our perspective — push the pending
          // edits before returning.
          return tryPushPending(cached);
        }
        if (fresh) {
          persist({
            text: fresh.text,
            cloudRevision: fresh.revision ?? null,
            localRevision: 0,
            updatedAt: Date.now(),
          });
          log.info(
            `load: mirrored remote bytes=${fresh.text.length} rev=${fresh.revision ?? "<none>"}`,
          );
        } else if (cached) {
          // Cloud has nothing but we cached a copy previously —
          // serving the cache here would resurrect a file the user
          // intentionally deleted from the cloud, which is the
          // wrong default. Clear the mirror and return null so the
          // hook seeds a fresh budget.
          log.warn("load: remote empty but cache exists — clearing mirror");
          clearCloudMirror(storageKey);
        }
        return fresh;
      } catch (err) {
        if (err instanceof ConflictError) throw err;
        if (err instanceof AuthError) throw err;
        if (isOfflineError(err) && cached) {
          log.info(
            `load: offline — serving mirror bytes=${cached.text.length} rev=${cached.cloudRevision ?? "<none>"}`,
          );
          return {
            text: cached.text,
            revision: cached.cloudRevision ?? undefined,
            offline: true,
          };
        }
        throw err;
      }
    },

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      // `baseRevision` from the hook is the revision of the last
      // snapshot we handed it. When we served an offline mirror, the
      // revision we handed back was `cached.cloudRevision` — so the
      // hook's baseRevision lines up with our cached cloud rev,
      // which is exactly what the cloud expects on the next push.
      log.info(
        `save: bytes=${text.length} baseRev=${baseRevision ?? "<none>"}`,
      );
      try {
        const pushed = await inner.save(text, baseRevision);
        persist({
          text: pushed.text,
          cloudRevision: pushed.revision ?? null,
          localRevision: 0,
          updatedAt: Date.now(),
        });
        log.info(
          `save: ok newRev=${pushed.revision ?? "<none>"} bytes=${pushed.text.length}`,
        );
        return pushed;
      } catch (err) {
        if (err instanceof ConflictError) {
          const cached = mirror();
          // Attach the local bytes so the resolution modal can show
          // both sides without a second adapter call. Prefer the
          // bytes the user just tried to save — they're the freshest
          // local state — falling back to the mirror only if the
          // hook handed us empty (shouldn't happen in practice).
          const local: Snapshot = {
            text,
            revision: cached?.cloudRevision ?? baseRevision,
          };
          // Persist the local bytes so a reload re-surfaces the
          // conflict instead of silently discarding the unsynced
          // edit. Don't bump `cloudRevision` — the cloud's `rev`
          // didn't change for our copy.
          persist({
            text,
            cloudRevision: cached?.cloudRevision ?? null,
            localRevision: (cached?.localRevision ?? 0) + 1,
            updatedAt: Date.now(),
          });
          log.warn(
            `save: conflict remoteRev=${err.remote.revision ?? "<none>"} — surfacing both sides`,
          );
          throw new ConflictError(err.remote, local);
        }
        if (err instanceof AuthError) throw err;
        if (isOfflineError(err)) {
          const cached = mirror();
          const nextState: CloudMirrorState = {
            text,
            cloudRevision: cached?.cloudRevision ?? baseRevision ?? null,
            localRevision: (cached?.localRevision ?? 0) + 1,
            updatedAt: Date.now(),
          };
          persist(nextState);
          log.info(
            `save: offline — mirrored bytes=${text.length} localRev=${nextState.localRevision}`,
          );
          return {
            text,
            revision: nextState.cloudRevision ?? undefined,
            offline: true,
          };
        }
        throw err;
      }
    },

    watch: inner.watch
      ? (onRemoteChange) =>
          inner.watch!((snap) => {
            // A remote-push notification means another device wrote
            // a new revision. Drop any unsynced local edits and
            // mirror the new remote — the user already saw "offline"
            // copy or we wouldn't be in this branch, so silently
            // replacing it is wrong. Bail and let the next `load`
            // surface the divergence.
            const cached = mirror();
            if (cached && cached.localRevision > 0) {
              log.warn(
                `watch: remote moved but local has ${cached.localRevision} pending edits — ignoring push, divergence will surface on next load/save`,
              );
              return;
            }
            persist({
              text: snap.text,
              cloudRevision: snap.revision ?? null,
              localRevision: 0,
              updatedAt: Date.now(),
            });
            onRemoteChange(snap);
          })
      : undefined,
  };
}
