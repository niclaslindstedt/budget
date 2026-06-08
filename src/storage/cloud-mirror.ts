import { unlock } from "../data/achievements";
import { createLogger } from "../utils/logger";
import {
  AuthError,
  ConflictError,
  type AdapterCapability,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";

const log = createLogger("cloud-mirror");

// Higher-order adapter that keeps a copy of the cloud bytes locally
// so a session opened with no network can still load the last-known
// state, edit it locally, and push when the cloud comes back. Sits
// *under* `withEncryption` so the mirror holds the same envelope
// bytes the cloud holds — encryption-on installs keep their on-disk
// threat model end-to-end.
//
// The wrapper is storage-agnostic: it takes a `CloudMirrorStorage`
// implementation (async read / write / clear) so the bytes can land
// anywhere — production uses `createIdbCloudMirrorStorage(userId)`
// from `idb-adapter.ts`, tests inject an in-memory store.
//
// State transitions the wrapper drives:
//
// 1. `load()` with a clean cache (no pending offline edits):
//    stale-while-revalidate. Return the mirror snapshot immediately so
//    the app paints from local IndexedDB without waiting on the
//    network, and kick off a background `revalidate`. Revalidation
//    first asks the inner adapter for just the revision token
//    (`getRevision`, when supported) and skips the full body download
//    when it matches the mirror; only a genuinely-moved remote is
//    downloaded, persisted, and delivered through the `watch` channel
//    as a re-paint. Auth / offline errors hit in the background don't
//    yank the user off their cached data — the next `save` surfaces and
//    queues them through transition 6.
// 2. `load()` with no cache (first run): fetch from cloud, write the
//    result to the mirror, return the cloud snapshot — and surface
//    auth / conflict synchronously so the hook can react. A network
//    failure here with no cache to fall back on bubbles up.
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

// `text` is the bytes the inner adapter would have returned —
// ciphertext when encryption is on, plaintext otherwise.
// `cloudRevision` is the revision token the cloud returned the last
// time we successfully synced (Dropbox `rev`, Drive `ETag`, …).
// `localRevision` is a monotonic counter that bumps every time
// `save` was called while offline; 0 means the mirror matches the
// cloud at `cloudRevision`. `updatedAt` is the wall-clock ms the
// mirror was last written, surfaced in the "offline since {when}"
// copy. `backendId` records which inner adapter wrote the cache —
// the mirror is per-user only, so without this tag a switch from
// one cloud to another would re-use the previous provider's pending
// edits against the new provider and either overwrite the new cloud
// with stale bytes or trip a bogus conflict on cross-provider
// revisions.
export type CloudMirrorState = {
  text: string;
  cloudRevision: string | null;
  localRevision: number;
  updatedAt: number;
  backendId: string;
};

// Pluggable backing store for the mirror. Production hooks this up
// to IndexedDB (`createIdbCloudMirrorStorage` in `idb-adapter.ts`);
// tests pass an in-memory implementation.
export type CloudMirrorStorage = {
  read(): Promise<CloudMirrorState | null>;
  write(state: CloudMirrorState): Promise<void>;
  clear(): Promise<void>;
};

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
  // Backing store for the mirror state. Per-user in production
  // (`createIdbCloudMirrorStorage(userId)`).
  storage: CloudMirrorStorage;
};

export function withCloudMirror(
  inner: StorageAdapter,
  options: CloudMirrorOptions,
): StorageAdapter {
  const { storage } = options;
  const backendId = inner.id;

  // Read the cache, but only honour it if it was written by the
  // same backend that's wrapped now. A cross-backend cache (Dropbox
  // ↔ Google Drive switch, or Local ↔ cloud) carries pending
  // edits and a cloudRevision token that mean nothing to the new
  // provider; treating them as authoritative is how blank-budget
  // wipes happen after a switch.
  async function mirror(): Promise<CloudMirrorState | null> {
    const cached = await storage.read();
    if (!cached) return null;
    if (cached.backendId !== backendId) {
      log.warn(
        `mirror: dropping stale cache from backend=${cached.backendId} (now wrapping ${backendId})`,
      );
      await storage.clear();
      return null;
    }
    return cached;
  }

  async function persist(
    state: Omit<CloudMirrorState, "backendId">,
  ): Promise<void> {
    await storage.write({ ...state, backendId });
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
      await persist({
        text: pushed.text,
        cloudRevision: pushed.revision ?? null,
        localRevision: 0,
        updatedAt: Date.now(),
      });
      log.info(
        `load: flush ok newRev=${pushed.revision ?? "<none>"} bytes=${pushed.text.length}`,
      );
      // The mirror only accumulates pending edits when a prior save
      // couldn't reach the cloud (offline). Flushing them on the next
      // load is the app reconnecting gracefully — the `airplaneMode`
      // gesture. The bus dedupes, so the first reconnect wins.
      unlock("airplaneMode");
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

  // Stale-while-revalidate plumbing. A clean cache (no pending offline
  // edits) is served from `load()` instantly; the network round-trip
  // moves to `revalidate`, which only delivers a re-paint when the
  // remote actually moved. Delivery rides the `watch` channel below
  // (the hook turns a watch callback into `setData`), so the wrapper
  // synthesizes a `watch` even when the inner cloud adapter has none.
  // `revalidating` dedupes overlapping refreshes (mount load + an
  // immediate pull-to-refresh); `bufferedDelivery` holds a fresh
  // snapshot that resolved before the hook subscribed, flushed on
  // subscribe so the re-paint isn't lost to a mount-order race.
  let revalidateListener: ((snapshot: Snapshot) => void) | null = null;
  let bufferedDelivery: Snapshot | null = null;
  let revalidating = false;

  function deliver(snapshot: Snapshot): void {
    if (revalidateListener) {
      revalidateListener(snapshot);
    } else {
      bufferedDelivery = snapshot;
    }
  }

  async function revalidate(cached: CloudMirrorState): Promise<void> {
    // Only one in-flight revalidation at a time — a mount load() and a
    // near-simultaneous reload() would otherwise both hit the network.
    if (revalidating) return;
    revalidating = true;
    try {
      // Cheap probe first: when the backend can hand back just the
      // revision token, compare it and skip the multi-MB body download
      // entirely if the remote hasn't moved — the common refresh case.
      if (inner.getRevision) {
        try {
          const rev = await inner.getRevision();
          if (rev !== null && rev === cached.cloudRevision) {
            log.info("revalidate: remote unchanged (probe) — cache stands");
            return;
          }
        } catch (err) {
          if (err instanceof AuthError) {
            log.warn("revalidate: auth probe failed — deferring to next save");
            return;
          }
          if (isOfflineError(err)) {
            log.info("revalidate: offline probe — staying on cache");
            return;
          }
          // Some other probe failure — fall through to a full load
          // rather than leaving the cache unrevalidated.
          log.warn("revalidate: getRevision failed — full load", err);
        }
      }
      const fresh = await inner.load();
      if (!fresh) {
        // Remote was deleted out from under us. Clear the mirror so the
        // next load seeds a fresh budget — but don't yank the bytes the
        // user is currently looking at mid-session.
        log.warn("revalidate: remote empty — clearing mirror");
        await storage.clear();
        return;
      }
      if (
        fresh.revision !== undefined &&
        fresh.revision === cached.cloudRevision
      ) {
        log.info("revalidate: remote unchanged (load) — cache stands");
        return;
      }
      await persist({
        text: fresh.text,
        cloudRevision: fresh.revision ?? null,
        localRevision: 0,
        updatedAt: Date.now(),
      });
      log.info(
        `revalidate: remote moved — delivering bytes=${fresh.text.length} rev=${fresh.revision ?? "<none>"}`,
      );
      deliver(fresh);
    } catch (err) {
      // Auth / offline discovered in the background don't yank the
      // user off their cached data — the next save surfaces and queues
      // the right way through the existing save path. Delivering them
      // here would force a `setData` (and undo-history reset) over a
      // possibly mid-edit session for no gain.
      if (err instanceof AuthError) {
        log.warn("revalidate: auth failed — deferring to next save");
        return;
      }
      if (isOfflineError(err)) {
        log.info("revalidate: offline — staying on cache");
        return;
      }
      log.error("revalidate: failed — staying on cache", err);
    } finally {
      revalidating = false;
    }
  }

  // Forward inner capabilities, drop `loadSync` (mirror reads are an
  // async IDB round-trip), and always advertise `markSynced` plus
  // `watch` since this wrapper implements both regardless of the inner
  // (`watch` doubles as the stale-while-revalidate delivery channel).
  const capabilities = new Set<AdapterCapability>(inner.capabilities);
  capabilities.delete("loadSync");
  capabilities.add("markSynced");
  capabilities.add("watch");

  return {
    id: inner.id,
    label: inner.label,
    saveDebounceMs: inner.saveDebounceMs,
    capabilities,
    backups: inner.backups,
    // Receipts, payslips, property files, and saved exports pass straight
    // through the mirror — only the live budget bytes are mirrored for offline
    // reads; these binary files are not. Forwarding each is mandatory: the
    // mirror copies the inner capability set above, so dropping an ops
    // object here would leave its capability advertised but unusable (the
    // row menus show "View / Remove" but the calls throw).
    receipts: inner.receipts,
    payslips: inner.payslips,
    propertyFiles: inner.propertyFiles,
    exports: inner.exports,

    markSynced(snapshot: Snapshot): void {
      log.info(
        `markSynced: stamping mirror bytes=${snapshot.text.length} rev=${snapshot.revision ?? "<none>"}`,
      );
      // Fire-and-forget — the caller's contract is sync. Matches the
      // existing pattern in `withEncryption` which already returns
      // before its own async encrypt step finishes.
      void persist({
        text: snapshot.text,
        cloudRevision: snapshot.revision ?? null,
        localRevision: 0,
        updatedAt: Date.now(),
      });
    },

    // No `loadSync` even when the inner has one: the mirror is an
    // async round-trip, and a cloud adapter never offers sync loads
    // anyway. Callers fall back to async `load()`.

    async load(): Promise<Snapshot | null> {
      const cached = await mirror();
      log.info(
        `load: start cached=${cached ? `bytes=${cached.text.length} localRev=${cached.localRevision} cloudRev=${cached.cloudRevision ?? "<none>"}` : "<none>"}`,
      );
      // Stale-while-revalidate: a cache with no pending offline edits is
      // authoritative-enough to paint immediately. Serve it now and move
      // the network round-trip into a background `revalidate`, which only
      // re-paints (via the `watch` channel) when the remote actually
      // moved. The pending-edits and no-cache cases fall through to the
      // blocking path below — they need the network result synchronously
      // to detect conflicts or seed the first load.
      if (cached && cached.localRevision === 0) {
        log.info("load: serving cache, revalidating in background");
        void revalidate(cached);
        return {
          text: cached.text,
          revision: cached.cloudRevision ?? undefined,
        };
      }
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
          await persist({
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
          await storage.clear();
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
        await persist({
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
          const cached = await mirror();
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
          await persist({
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
          const cached = await mirror();
          const nextState: Omit<CloudMirrorState, "backendId"> = {
            text,
            cloudRevision: cached?.cloudRevision ?? baseRevision ?? null,
            localRevision: (cached?.localRevision ?? 0) + 1,
            updatedAt: Date.now(),
          };
          await persist(nextState);
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

    // Always present, even when the inner cloud adapter can't push:
    // this is also the channel `revalidate` delivers stale-while-
    // revalidate re-paints through. Registering the callback both wires
    // the background revalidation and (when the inner supports it)
    // subscribes to genuine out-of-band remote pushes.
    watch(onRemoteChange: (snapshot: Snapshot) => void): () => void {
      revalidateListener = onRemoteChange;
      // A revalidation that resolved before the hook subscribed parked
      // its snapshot here — flush it now so the re-paint isn't lost.
      if (bufferedDelivery) {
        const pending = bufferedDelivery;
        bufferedDelivery = null;
        onRemoteChange(pending);
      }
      const innerUnsub = inner.watch
        ? inner.watch((snap) => {
            // A remote-push notification means another device wrote
            // a new revision. Drop any unsynced local edits and
            // mirror the new remote — the user already saw "offline"
            // copy or we wouldn't be in this branch, so silently
            // replacing it is wrong. Bail and let the next `load`
            // surface the divergence.
            void (async () => {
              const cached = await mirror();
              if (cached && cached.localRevision > 0) {
                log.warn(
                  `watch: remote moved but local has ${cached.localRevision} pending edits — ignoring push, divergence will surface on next load/save`,
                );
                return;
              }
              await persist({
                text: snap.text,
                cloudRevision: snap.revision ?? null,
                localRevision: 0,
                updatedAt: Date.now(),
              });
              onRemoteChange(snap);
            })();
          })
        : undefined;
      return () => {
        revalidateListener = null;
        innerUnsub?.();
      };
    },
  };
}
