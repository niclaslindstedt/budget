import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { unlock } from "../data/achievements";
import type { MigrationContext } from "../data/migrations";
import type { UserData } from "../data/types";
import { createLogger } from "../utils/logger";
import {
  AuthError,
  ConflictError,
  RateLimitError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import { serializeUserData } from "./file";
import { readUserDataFromText, tryReadUserDataFromText } from "./local";
import {
  backoffDelayMs,
  isRetryableSaveError,
  MAX_TRANSIENT_SAVE_RETRIES,
} from "./save-retry";
import { createSaveChain } from "./save-chain";
import {
  isBailStatus,
  type SaveStatus,
  type StatusAction,
} from "./useUserDataStorage";

const log = createLogger("storage-save");

// Fraction of the previous saved size below which a save is paused
// for confirmation. 0.05 = "shrunk by more than 5%". A 1 MB → 3 KB
// fresh-budget overwrite (the original incident) is a 99.7% shrink
// and trips this trivially; routine edits never do.
const SHRINK_WARN_THRESHOLD = 0.05;

// Minimum previous size for the shrink check to engage. A new user
// going from 0 → small budget should never be challenged, and edits
// on small files never need a guardrail.
const SHRINK_WARN_MIN_PREV_BYTES = 4096;

// Sleep for the transient-retry backoff. Lives inside the save chain's
// in-flight body (not a tracked timer) so the chain stays "busy"
// during the wait and a queued save coalesces behind it; the loop's
// post-sleep `isStale()` check bails cleanly if the adapter swapped or
// a newer save superseded this one while we waited.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Inputs the save path shares with the rest of the storage hook. The
// hook owns the save chain (serialises overlapping save attempts), the
// shrink-warning safeguard, the conflict-exit callbacks
// (`resolveKeepLocal`, `resolveKeepRemote`), the manual `saveNow`, the
// throttle resume timer, and the debounced auto-save effect.
//
// The refs the hook mutates (lastSnapshotRef, skipNextSaveRef,
// pendingTimerRef) are owned by the outer hook because the load path
// reads them too — they're the straddle points where load and save
// coordinate. Passing them in rather than minting fresh refs inside
// the hook keeps both halves looking at the same instances.
//
// The throttle resume timer lives entirely inside this hook (only the
// save path schedules it and only the save path resumes from it). The
// hook installs its own adapter-scoped cleanup effect so a backend
// swap doesn't leave a `setTimeout` firing into the new adapter.
type Params = {
  adapter: StorageAdapter;
  data: UserData;
  // The live SaveStatus value (not just the ref) — `saveNow`,
  // `confirmShrinkSave`, `discardShrinkSave`, and `resolveKeepRemote`
  // narrow on `status.kind` at call time, so they need the value to
  // close over for the discriminated-union refinement.
  status: SaveStatus;
  migrationCtx: MigrationContext;
  beforeSerializeRef: MutableRefObject<((d: UserData) => UserData) | undefined>;
  statusRef: MutableRefObject<SaveStatus>;
  lastSnapshotRef: MutableRefObject<Snapshot | null>;
  skipNextSaveRef: MutableRefObject<boolean>;
  hasLoadedRef: MutableRefObject<boolean>;
  pendingTimerRef: MutableRefObject<number | null>;
  setData: (next: UserData | ((prev: UserData) => UserData)) => void;
  setLastSavedData: (next: UserData | null) => void;
  dispatchStatus: (action: StatusAction) => void;
  // Clear the in-memory undo timeline when state is replaced from
  // outside the dispatch path — used here by `discardShrinkSave`
  // (reverting to last-saved bytes) and `resolveKeepRemote` (adopting
  // the remote copy on conflict resolution).
  resetHistory: (seed: UserData) => void;
};

export type SaveStateMachine = {
  // Drive a save against the storage adapter. Surfaced so the load
  // path's `reload` can call into it for the dirty pre-flush — the
  // typical save consumer goes through the debounced auto-save effect
  // and `saveNow`, neither of which the outer hook has to wire up
  // because they live inside this hook.
  performSave: (
    text: string,
    savedData: UserData,
    isStale: () => boolean,
    options?: { skipShrinkCheck?: boolean; ignoreBailStatus?: boolean },
  ) => Promise<void>;
  // Save the current in-memory state verbatim. Bypasses
  // `beforeSerialize` so the user can persist half-filled rows when
  // they ask for it via the explicit "save" button. Refuses to push
  // when the load hasn't completed yet or when a paused state owns
  // the screen.
  saveNow: () => void;
  // Resolve a conflict by overwriting the remote with the local copy.
  // The save re-issues with the current remote revision as baseRev so
  // the cloud accepts it cleanly.
  resolveKeepLocal: () => void;
  // Resolve a conflict by adopting the remote copy. Replaces
  // in-memory state, silences the next auto-save, and tells the
  // adapter chain that the remote bytes are now authoritative.
  resolveKeepRemote: () => void;
  // Confirm the paused shrink save: re-enter the save path with the
  // shrink check disabled so the paused payload goes through.
  confirmShrinkSave: () => void;
  // Discard the paused shrink save: revert in-memory state to the
  // last-saved bytes so the user's cloud copy is preserved and the
  // dirty flag clears.
  discardShrinkSave: () => void;
};

// Owns the save chain, the shrink-warning safeguard, the conflict-exit
// callbacks, the manual `saveNow`, the throttle resume timer, and the
// debounced auto-save effect. The outer hook calls into `performSave`
// from the load path's dirty pre-flush; otherwise the save path is
// self-contained — the auto-save effect runs internally and drives
// `adapter.save()` directly.
export function useSaveStateMachine(params: Params): SaveStateMachine {
  const {
    adapter,
    data,
    status,
    migrationCtx,
    beforeSerializeRef,
    statusRef,
    lastSnapshotRef,
    skipNextSaveRef,
    hasLoadedRef,
    pendingTimerRef,
    setData,
    setLastSavedData,
    dispatchStatus,
    resetHistory,
  } = params;

  // Serialises every `performSave` call: a new save can't start
  // until the prior one has settled. Without this, a save that fires
  // while another is still awaiting the network reads the same
  // `lastSnapshot.current.revision` as the in-flight one, both calls
  // send the same baseRev, the cloud accepts the first and 409s the
  // second — surfacing as a phantom "Sync conflict" popup on a
  // single-device account. The chain also coalesces: a second queued
  // body replaces the first, so a burst of edits over a slow network
  // catches up with one trailing save instead of a deep backlog.
  const saveChainRef = useRef(createSaveChain());

  // Timer that flips status back to `idle` after a cloud-side rate
  // limit (HTTP 429) cooldown expires. Cleared on adapter unmount so a
  // backend swap doesn't leave a dangling resume firing into the new
  // adapter. The `resumeNonce` bump alongside the flip re-runs the save
  // effect against the latest `data` even when nothing else changed in
  // the meantime — pending edits coalesce into the next single save.
  const throttleResumeRef = useRef<number | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);

  // Count of back-to-back rate limits (HTTP 429) with no successful
  // save in between. Drives the backoff floor on the throttle path so
  // a server that keeps returning a tiny `retryAfterMs` escalates the
  // cooldown instead of letting us resend on a tight loop. Reset to 0
  // the moment a save lands (success or offline-mirror).
  const consecutiveThrottlesRef = useRef(0);

  const performSave = useCallback(
    (
      text: string,
      savedData: UserData,
      isStale: () => boolean,
      {
        skipShrinkCheck = false,
        ignoreBailStatus = false,
      }: { skipShrinkCheck?: boolean; ignoreBailStatus?: boolean } = {},
    ): Promise<void> =>
      saveChainRef.current.run(async () => {
        if (isStale()) {
          log.info(`save skipped (stale before start) [${adapter.id}]`);
          return;
        }
        // Status may have flipped into a bail state (conflict,
        // throttle, …) while we were queued behind another save.
        // Pushing through would clobber the resolution UI the user is
        // about to act on. `resolveKeepLocal` is the one caller that
        // sets `ignoreBailStatus`: the user IS acting on the conflict
        // modal, and skipping the save here would leave the modal
        // stuck open with no further effect from clicking the button.
        if (!ignoreBailStatus && isBailStatus(statusRef.current)) {
          log.info(
            `save skipped — status=${statusRef.current.kind} (flipped while queued) [${adapter.id}]`,
          );
          return;
        }
        // Block catastrophic size collapses unless the user has
        // explicitly confirmed them via `confirmShrinkSave`. The
        // baseline is the last bytes we successfully read or wrote;
        // if the new payload is < (1 - SHRINK_WARN_THRESHOLD) of that
        // and the previous size was non-trivial, pause and surface
        // the numbers to the user. A fresh-budget fallback writing
        // 3 KB over a 1 MB cloud file (the original incident) trips
        // this trivially.
        const prevBytes = lastSnapshotRef.current?.text.length ?? null;
        if (
          !skipShrinkCheck &&
          prevBytes !== null &&
          prevBytes >= SHRINK_WARN_MIN_PREV_BYTES &&
          text.length < prevBytes * (1 - SHRINK_WARN_THRESHOLD)
        ) {
          const pct = ((1 - text.length / prevBytes) * 100).toFixed(1);
          log.warn(
            `save paused: shrink ${prevBytes}→${text.length} bytes (-${pct}%) > ${
              SHRINK_WARN_THRESHOLD * 100
            }% [${adapter.id}]`,
          );
          dispatchStatus({
            kind: "shrink-warning",
            pendingText: text,
            prevBytes,
            newBytes: text.length,
          });
          return;
        }
        dispatchStatus({ kind: "save-start" });
        log.info(
          `save start [${adapter.id}] bytes=${text.length} baseRev=${
            lastSnapshotRef.current?.revision ?? "<none>"
          }`,
        );
        // Retry loop. Status stays `saving` across attempts — a
        // transient failure (a reachable backend returning 5xx, or a
        // bare adapter throwing a raw network error the cloud-mirror
        // didn't already fold into `offline`) reschedules an in-chain
        // retry with exponential backoff rather than immediately
        // surfacing a red error. The save chain stays in-flight during
        // each backoff sleep, so a queued newer save coalesces behind
        // this one and a fresh edit's effect run supersedes the loop
        // (its `cancelled` flag flips `isStale()` after the sleep).
        // Conflict / auth / rate-limit signals each break out to their
        // dedicated handling and never retry here.
        let attempt = 0;
        for (;;) {
          const start = performance.now();
          try {
            const next = await adapter.save(
              text,
              lastSnapshotRef.current?.revision,
            );
            const ms = (performance.now() - start).toFixed(0);
            // Record the new revision before the stale check: the cloud
            // accepted these bytes at this rev, regardless of whether
            // the in-memory data has moved on while the request was in
            // flight. Without this, a stale completion leaves
            // `lastSnapshot.revision` pinned to the OLD rev, the next
            // save sends that stale rev as `baseRev`, and the cloud
            // 409s as soon as the content actually changes — surfacing
            // as a phantom "Sync conflict" popup on a single-device
            // account. Mirrors the same "bookkeeping outlives the
            // effect" rule the ConflictError branch below already
            // follows.
            lastSnapshotRef.current = next;
            setLastSavedData(savedData);
            // A save landed — clear the consecutive-throttle escalation
            // so a future 429 starts its backoff curve from scratch.
            consecutiveThrottlesRef.current = 0;
            if (isStale()) {
              log.info(
                `save ok but stale (${ms}ms) [${adapter.id}] newRev=${next.revision ?? "<none>"}`,
              );
              return;
            }
            if (next.offline) {
              dispatchStatus({ kind: "save-offline" });
              log.info(
                `save offline (${ms}ms) [${adapter.id}] mirroredRev=${next.revision ?? "<none>"}`,
              );
            } else {
              dispatchStatus({ kind: "save-success" });
              // The save-state indicator just flipped to "saved" — the
              // gesture behind the `trustButVerify` achievement. The bus
              // dedupes, so firing on every successful save is harmless.
              unlock("trustButVerify");
              log.info(
                `save ok (${ms}ms) [${adapter.id}] newRev=${next.revision ?? "<none>"}`,
              );
            }
            return;
          } catch (err) {
            const ms = (performance.now() - start).toFixed(0);
            // Conflict bookkeeping must happen even if our caller is
            // now stale (a re-render between `save-start` and the
            // adapter resolving cancelled the effect). Without
            // stashing `err.remote` here, the next save reuses the old
            // baseRev and we loop on the same 409 forever. Setting the
            // conflict status surfaces the resolution modal AND lands
            // us in the save effect's bail list so the autosave loop
            // stops.
            if (err instanceof ConflictError) {
              log.warn(
                `save conflict (${ms}ms) [${adapter.id}] remoteRev=${
                  err.remote.revision ?? "<none>"
                } hasLocal=${Boolean(err.local)} stale=${isStale()}`,
              );
              const remote = readUserDataFromText(
                err.remote.text,
                migrationCtx,
              );
              // The cloud-mirror wrapper attaches `local`; bare cloud
              // adapters don't, in which case the in-memory `data` is
              // the freshest local view we have.
              const local = err.local
                ? readUserDataFromText(err.local.text, migrationCtx)
                : data;
              lastSnapshotRef.current = err.remote;
              dispatchStatus({ kind: "conflict", local, remote });
              return;
            }
            if (err instanceof RateLimitError) {
              // Soft pause: schedule a resume timer for the cooldown,
              // then re-run the save effect via a nonce bump so
              // whatever the user has been editing during the cooldown
              // lands in a single full-blob save. Like the conflict
              // branch, this runs before the stale check — the throttle
              // applies to the whole adapter, not to a single in-flight
              // request, so a stale completion still needs to set up the
              // cooldown bookkeeping. The server's `retryAfterMs` is
              // floored against the backoff curve and escalated per
              // consecutive 429, so a server returning a tiny (or zero)
              // cooldown can't pull us into a tight resend loop. No
              // budget here on purpose: giving up on a rate limit would
              // surface a red error and stop autosave, which is worse
              // than continuing to wait.
              const floorMs = backoffDelayMs(consecutiveThrottlesRef.current);
              consecutiveThrottlesRef.current += 1;
              const waitMs = Math.max(err.retryAfterMs, floorMs);
              const until = Date.now() + waitMs;
              log.warn(
                `save throttled (${ms}ms) [${adapter.id}] retryAfter=${err.retryAfterMs}ms floor=${floorMs}ms wait=${waitMs}ms until=${until}`,
              );
              if (throttleResumeRef.current !== null) {
                window.clearTimeout(throttleResumeRef.current);
              }
              throttleResumeRef.current = window.setTimeout(() => {
                throttleResumeRef.current = null;
                // Only resume if we're still in the throttled state we
                // set ourselves — an intervening adapter swap or other
                // status change shouldn't be clobbered with `idle`.
                if (statusRef.current.kind === "throttled") {
                  log.info(
                    `save throttle cleared [${adapter.id}] — resuming autosave`,
                  );
                  dispatchStatus({ kind: "idle" });
                  setResumeNonce((n) => n + 1);
                }
              }, waitMs);
              dispatchStatus({ kind: "throttled", until });
              return;
            }
            if (isStale()) {
              log.info(`save failed but stale (${ms}ms) [${adapter.id}]`, err);
              return;
            }
            if (err instanceof AuthError) {
              log.warn(`save auth failed (${ms}ms) [${adapter.id}]`, err);
              dispatchStatus({ kind: "auth-error", message: err.message });
              return;
            }
            // Transient backend hiccup: retry in-chain with bounded
            // exponential backoff before giving up. The sleep keeps the
            // save chain busy so queued saves coalesce behind it; after
            // the sleep we re-check `isStale()` so a superseding save or
            // an adapter swap abandons the loop cleanly.
            if (
              isRetryableSaveError(err) &&
              attempt < MAX_TRANSIENT_SAVE_RETRIES
            ) {
              const waitMs = backoffDelayMs(attempt);
              attempt += 1;
              log.warn(
                `save failed (${ms}ms) [${adapter.id}] — retrying in ${waitMs}ms (attempt ${attempt}/${MAX_TRANSIENT_SAVE_RETRIES})`,
                err,
              );
              await delay(waitMs);
              if (isStale()) {
                log.info(
                  `save retry abandoned (stale during backoff) [${adapter.id}]`,
                );
                return;
              }
              continue;
            }
            log.error(
              `save failed (${ms}ms) [${adapter.id}] — giving up after ${attempt} ${
                attempt === 1 ? "retry" : "retries"
              }`,
              err,
            );
            dispatchStatus({
              kind: "error",
              message: err instanceof Error ? err.message : String(err),
            });
            return;
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, data, migrationCtx],
  );

  // Cancel any pending throttle-resume timer when the adapter swaps
  // (or the hook unmounts on sign-out). Without this a scheduled
  // resume could fire into the next adapter and incorrectly flip its
  // status from `loading` / `idle` to `idle` mid-load. Lives here
  // alongside the save state machine so the throttle timer's whole
  // lifecycle is in one file; the previous arrangement piggy-backed
  // on the load effect's cleanup, which was confusing because the
  // timer is a save-path concern.
  useEffect(() => {
    return () => {
      if (throttleResumeRef.current !== null) {
        window.clearTimeout(throttleResumeRef.current);
        throttleResumeRef.current = null;
      }
    };
  }, [adapter]);

  // Debounced save. Each state change schedules a write; subsequent
  // changes inside the debounce window replace the pending write.
  // `status` is intentionally NOT a dep — it is read through
  // `statusRef` so that `save-start` dispatches inside `performSave`
  // don't re-run this effect and turn the save chain into a tight
  // loop.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    // Don't paper over a load failure by writing the empty in-memory
    // state back to storage. The hook initialises with
    // `freshUserData()` until the load resolves; if the load failed
    // (auth expired, decryption error, transient I/O) the user's
    // real data is still on disk/cloud, and pushing the empty
    // starter state through the adapter would silently overwrite it.
    // The "conflict" status has its own resolution UI and explicitly
    // re-enters the save path via `resolveKeepLocal`.
    if (isBailStatus(statusRef.current)) {
      log.info(
        `save skipped — status=${statusRef.current.kind} (refusing to overwrite real data with the post-failure in-memory copy)`,
      );
      return;
    }
    const delay = adapter.saveDebounceMs ?? 0;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      pendingTimerRef.current = null;
      void runSave();
    }, delay);
    pendingTimerRef.current = timer;

    async function runSave() {
      if (cancelled) return;
      // Re-check status at fire time: a save that errored while we
      // were debouncing (conflict, auth-error, …) may have flipped
      // status into a bail state, and without `status` in the deps
      // the timer wouldn't otherwise know.
      if (isBailStatus(statusRef.current)) {
        log.info(
          `save skipped — status=${statusRef.current.kind} (flipped during debounce)`,
        );
        return;
      }
      const transform = beforeSerializeRef.current;
      const text = serializeUserData(transform ? transform(data) : data);
      await performSave(text, data, () => cancelled);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
    // `resumeNonce` is in the dep list so that when the throttle
    // resume timer flips status back to `idle` and bumps the nonce,
    // this effect re-runs against the current `data` and pushes the
    // pending edits in a single full-blob save. Without the nonce a
    // throttle that elapsed with no further edits would never retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, data, performSave, resumeNonce]);

  // Save the current in-memory state verbatim. Used by the explicit
  // "save" button — bypasses `beforeSerialize` so the user can persist
  // half-filled rows when they ask for it. Mirrors the auto-save
  // guards above: refuse to push when the load hasn't completed yet
  // or when the previous load failed, so the user can't accidentally
  // overwrite their real data with the post-failure empty starter
  // state.
  const saveNow = useCallback(() => {
    if (!hasLoadedRef.current) {
      log.warn(
        `saveNow ignored [${adapter.id}] — no successful load yet (status=${status.kind})`,
      );
      return;
    }
    if (
      status.kind === "auth-error" ||
      status.kind === "error" ||
      status.kind === "loading" ||
      status.kind === "parse-error" ||
      status.kind === "shrink-warning" ||
      status.kind === "throttled"
    ) {
      log.warn(
        `saveNow ignored [${adapter.id}] — status=${status.kind}; resolve the failure before saving`,
      );
      return;
    }
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const text = serializeUserData(data);
    void performSave(text, data, () => false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, data, performSave, status]);

  // Conflict resolution. The hook stashed `err.remote` in
  // `lastSnapshot` when the conflict surfaced, so "keep mine" can
  // re-issue the save with the current remote revision as baseRev —
  // the cloud accepts it cleanly because we're explicitly saying
  // "overwrite whatever's there now". "Keep the other" swaps
  // in-memory state for the remote bytes and silences the next
  // auto-save so we don't immediately push it back.
  const resolveKeepLocal = useCallback(() => {
    log.info("conflict resolve: keep local — pushing in-memory data");
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const text = serializeUserData(data);
    // `ignoreBailStatus` because the current status IS "conflict" —
    // the default bail check would skip this save and leave the
    // modal stuck open. The save itself sends the remote revision
    // as baseRev so the cloud accepts the overwrite cleanly, and
    // its `save-start` dispatch flips status out of "conflict" so
    // the modal closes.
    void performSave(text, data, () => false, { ignoreBailStatus: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, performSave]);

  // Resolution for the shrink safeguard. "Confirm" re-enters the
  // save path with the shrink check disabled so the paused payload
  // goes through. "Discard" reverts the in-memory state to the
  // last-saved bytes so the user's cloud copy is preserved and the
  // dirty flag clears.
  const confirmShrinkSave = useCallback(() => {
    if (status.kind !== "shrink-warning") return;
    log.warn(
      `shrink resolve: confirm — pushing ${status.newBytes} bytes over ${status.prevBytes} [${adapter.id}]`,
    );
    const { pendingText } = status;
    // The `pendingText` was serialized from a prior render's `data`; the
    // shrink modal blocks edits, so the current `data` is the same
    // reference. Passing it as the saved-data ref keeps `dirty` accurate
    // after the confirm — the user is opting in to "what's in memory is
    // what's on disk".
    void performSave(pendingText, data, () => false, { skipShrinkCheck: true });
  }, [adapter, data, performSave, status]);

  const discardShrinkSave = useCallback(() => {
    if (status.kind !== "shrink-warning") return;
    log.info(
      `shrink resolve: discard — reverting to last-saved snapshot [${adapter.id}]`,
    );
    const snap = lastSnapshotRef.current;
    if (snap) {
      const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
      skipNextSaveRef.current = true;
      setData(parsed.data);
      resetHistory(parsed.data);
      setLastSavedData(parsed.data);
      if (parsed.status === "parse-failed") {
        dispatchStatus({ kind: "parse-error", message: parsed.error });
      } else {
        dispatchStatus({ kind: "idle" });
      }
    } else {
      dispatchStatus({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter.id, resetHistory, status, migrationCtx]);

  const resolveKeepRemote = useCallback(() => {
    if (status.kind !== "conflict") return;
    log.info("conflict resolve: keep remote — replacing in-memory data");
    const { remote } = status;
    const remoteText = serializeUserData(remote);
    // Mirror what a successful load would have set so the
    // surrounding effects don't double-handle the swap.
    lastSnapshotRef.current = lastSnapshotRef.current
      ? { ...lastSnapshotRef.current, text: remoteText }
      : { text: remoteText };
    skipNextSaveRef.current = true;
    setData(remote);
    resetHistory(remote);
    setLastSavedData(remote);
    dispatchStatus({ kind: "idle" });
    // Tell the adapter chain that the bytes we're now showing are
    // the authoritative ones — without this the cloud-mirror cache
    // would still hold the unsynced local edits and the next reload
    // would re-surface the conflict.
    adapter.markSynced?.(lastSnapshotRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, adapter, resetHistory]);

  return {
    performSave,
    saveNow,
    resolveKeepLocal,
    resolveKeepRemote,
    confirmShrinkSave,
    discardShrinkSave,
  };
}
