import { type MutableRefObject, useCallback, useEffect } from "react";

import type { MigrationContext } from "../data/migrations";
import type { UserData } from "../data/types";
import { createLogger } from "../utils/logger";
import {
  AuthError,
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "./adapter";
import { serializeUserData } from "./file";
import {
  freshUserData,
  readUserDataFromText,
  tryReadUserDataFromText,
} from "./local";
import {
  isBailStatus,
  type SaveStatus,
  type StatusAction,
} from "./useUserDataStorage";

const log = createLogger("storage-load");

// Inputs the load path shares with the rest of the storage hook. The
// hook drives in-flight async loads, the manual `reload()` flow, and
// the remote-watch subscription — three places that all need the same
// set of refs / setters to keep `data` / `lastSavedData` /
// `lastSnapshot.current` / `skipNextSave.current` / `status` in
// agreement after a load replaces in-memory state.
//
// The refs the hook mutates (lastSnapshotRef, skipNextSaveRef,
// hasLoadedRef, pendingTimerRef) are owned by the outer hook
// because the save path reads them too — they're the straddle
// points where load and save coordinate. Passing them in rather
// than minting fresh refs inside the hook keeps both halves
// looking at the same instance.
type Params = {
  adapter: StorageAdapter;
  // Latest in-memory data. Used by `reload` for the dirty pre-flush
  // path and by the conflict handler to seed the "local" snapshot
  // when the adapter doesn't return a `local` payload of its own.
  data: UserData;
  migrationCtx: MigrationContext;
  // Stable ref to the consumer-supplied `beforeSerialize` transform —
  // used by `reload` to compute the byte-equivalent of in-memory
  // state without round-tripping a fresh closure on every render.
  beforeSerializeRef: MutableRefObject<((d: UserData) => UserData) | undefined>;
  // Drive a save against the storage adapter. The reload pre-flush
  // calls this when in-memory state is dirty so the upcoming `load()`
  // doesn't quietly drop unsynced local edits.
  performSave: (
    text: string,
    savedData: UserData,
    isStale: () => boolean,
  ) => Promise<void>;
  // Latest status, ref-mirrored by the outer hook so reads here don't
  // have to add `status` to the load-effect dep list (which would
  // re-fire the effect on every transient transition and cancel any
  // in-flight load).
  statusRef: MutableRefObject<SaveStatus>;
  lastSnapshotRef: MutableRefObject<Snapshot | null>;
  skipNextSaveRef: MutableRefObject<boolean>;
  hasLoadedRef: MutableRefObject<boolean>;
  pendingTimerRef: MutableRefObject<number | null>;
  setData: (next: UserData | ((prev: UserData) => UserData)) => void;
  setLastSavedData: (next: UserData | null) => void;
  dispatchStatus: (action: StatusAction) => void;
  // Clear the in-memory undo timeline when a load replaces state from
  // outside the dispatch path — otherwise "undo" past the load would
  // jump to a snapshot taken against the pre-load base.
  resetHistory: (seed: UserData) => void;
};

export type LoadState = {
  // Manual refresh from the adapter — pull-to-refresh, "reload" button.
  // Flushes any pending debounced save before pulling so the reload
  // doesn't quietly drop unsynced local edits; conflict / auth errors
  // surfaced by that save halt the reload and let the existing
  // resolution UI take over.
  reload: () => Promise<void>;
};

// Owns the async-load effect, the watch subscription, and the manual
// `reload` callback. Each path parses adapter bytes into a fresh
// `UserData`, replaces in-memory state via `setData`, marks the parsed
// data as the saved baseline, clears the undo history, and dispatches
// the matching status transition. The shared bookkeeping (lastSnapshot,
// skipNextSave, hasLoaded) is updated through refs the outer hook also
// reads so the save path doesn't immediately push the freshly-loaded
// bytes back out.
export function useLoadState(params: Params): LoadState {
  const {
    adapter,
    data,
    migrationCtx,
    beforeSerializeRef,
    performSave,
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

  // Async load. Skipped when `loadSync` already handed us data.
  useEffect(() => {
    if (adapter.loadSync) {
      // When the previous adapter was async (no `loadSync`) and its
      // in-flight load got cancelled by this adapter swap, `hasLoadedRef`
      // is still false and state is the empty `freshUserData()` seeded
      // by the `useState` initializer with status:"loading". Run the
      // sync load now so the swap actually populates state — otherwise
      // the spinner never clears.
      if (!hasLoadedRef.current) {
        const snap = adapter.loadSync();
        log.info(
          `adapter mount [${adapter.id}] sync — recovering from cancelled async load ${
            snap
              ? `bytes=${snap.text.length} rev=${snap.revision ?? "<none>"}`
              : "<empty>"
          }`,
        );
        lastSnapshotRef.current = snap;
        skipNextSaveRef.current = true;
        hasLoadedRef.current = true;
        const parsed = snap
          ? tryReadUserDataFromText(snap.text, migrationCtx)
          : ({ data: freshUserData(), status: "fresh" } as const);
        setData(parsed.data);
        resetHistory(parsed.data);
        setLastSavedData(snap ? parsed.data : null);
        if (parsed.status === "parse-failed") {
          dispatchStatus({ kind: "parse-error", message: parsed.error });
        } else {
          dispatchStatus({ kind: "idle" });
        }
        return;
      }
      log.info(`adapter mount [${adapter.id}] sync — load skipped`);
      return;
    }
    let cancelled = false;
    dispatchStatus({ kind: "load-start" });
    log.info(`adapter mount [${adapter.id}] async — load start`);
    const start = performance.now();
    adapter
      .load()
      .then((snap) => {
        const ms = (performance.now() - start).toFixed(0);
        if (cancelled) {
          log.info(`load ok (${ms}ms) [${adapter.id}] but cancelled`);
          return;
        }
        log.info(
          `load ok (${ms}ms) [${adapter.id}] ${
            snap
              ? `bytes=${snap.text.length} rev=${snap.revision ?? "<none>"} offline=${Boolean(snap.offline)}`
              : "<empty>"
          }`,
        );
        // Whether this is the first load for this hook instance.
        // Adapter swaps (browser → folder, dropbox → gdrive) re-run
        // the effect with `hasLoadedRef` already true; the very
        // first call after mount finds it false.
        const wasInitialLoad = !hasLoadedRef.current;
        lastSnapshotRef.current = snap;
        hasLoadedRef.current = true;
        if (snap) {
          // Loaded the user's bytes — these are the canonical state,
          // so suppress the immediate save the upcoming setData would
          // otherwise trigger (no point round-tripping what we just
          // read).
          skipNextSaveRef.current = true;
          const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
          setData(parsed.data);
          resetHistory(parsed.data);
          setLastSavedData(parsed.data);
          if (parsed.status === "parse-failed") {
            // Real bytes came back from the adapter but this build
            // can't parse them. The autosave guard refuses to write
            // the fresh fallback over the user's real data on disk —
            // the user reconnects via the sync details panel.
            dispatchStatus({ kind: "parse-error", message: parsed.error });
          } else if (snap.offline) {
            dispatchStatus({ kind: "save-offline" });
          } else {
            dispatchStatus({ kind: "idle" });
          }
        } else if (wasInitialLoad) {
          // No bytes on disk for a brand-new user. The `useState`
          // initializer already seeded `data` with `freshUserData()`,
          // so re-setting here would only blow away any dispatches
          // that landed during the async load — most importantly,
          // `recordAchievementUnlock("localHero")` fired by the
          // App.tsx auth handler before the watcher subscribed to
          // the bus. Leaving state alone lets the unlock survive
          // long enough to reach the next save.
          //
          // Each of those dispatches re-ran the save effect while
          // `hasLoadedRef.current` was still false, so every save
          // bailed at the gate. We deliberately leave
          // `skipNextSaveRef.current` at false and re-publish `data`
          // with a fresh top-level reference so the save effect runs
          // one more time with the gate finally open — that pass
          // picks up every change since mount and writes them out as
          // the user's first persisted snapshot.
          setLastSavedData(null);
          dispatchStatus({ kind: "idle" });
          setData((prev) => ({ ...prev }));
        } else {
          // Adapter swap to a backend that has no data yet — the
          // previous adapter's bytes are stale, so wipe to a fresh
          // baseline (parity with the snap-bearing branch's
          // `setData(parsed.data)`).
          skipNextSaveRef.current = true;
          const fresh = freshUserData();
          setData(fresh);
          resetHistory(fresh);
          setLastSavedData(null);
          dispatchStatus({ kind: "idle" });
        }
      })
      .catch((err: unknown) => {
        const ms = (performance.now() - start).toFixed(0);
        if (cancelled) {
          log.info(`load failed (${ms}ms) [${adapter.id}] but cancelled`, err);
          return;
        }
        if (err instanceof ConflictError) {
          log.warn(
            `load conflict (${ms}ms) [${adapter.id}] remoteRev=${
              err.remote.revision ?? "<none>"
            } hasLocal=${Boolean(err.local)}`,
          );
          const remote = readUserDataFromText(err.remote.text, migrationCtx);
          const localText = err.local?.text;
          const local = localText
            ? readUserDataFromText(localText, migrationCtx)
            : freshUserData();
          lastSnapshotRef.current = err.remote;
          // Seed in-memory state with the local copy so the user
          // sees what they were editing while the modal asks them
          // to pick a side; the alternative (seeding remote) would
          // make "keep mine" look like it discarded their work.
          hasLoadedRef.current = true;
          skipNextSaveRef.current = true;
          setData(local);
          resetHistory(local);
          setLastSavedData(localText ? local : null);
          dispatchStatus({ kind: "conflict", local, remote });
          return;
        }
        if (err instanceof AuthError) {
          log.warn(`load auth failed (${ms}ms) [${adapter.id}]`, err);
          dispatchStatus({ kind: "auth-error", message: err.message });
          return;
        }
        log.error(`load failed (${ms}ms) [${adapter.id}]`, err);
        dispatchStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
      log.info(`adapter unmount [${adapter.id}] (in-flight load cancelled)`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, migrationCtx]);

  // Manual refresh from the adapter — pull-to-refresh, "reload" button.
  // Two phases: (1) flush any pending debounced save so the reload
  // doesn't quietly drop unsynced local edits; (2) re-issue
  // `adapter.load()` and replace in-memory state. Mirrors the initial-
  // load body and the watch callback — same lastSnapshot / skipNextSave
  // / hasLoaded bookkeeping so the autosave effect doesn't immediately
  // push the freshly-loaded bytes back out. Skips the `load-start`
  // flip the initial load does — that triggers the full-screen
  // `AppLoading` splash, which is wrong for a manual refresh on top
  // of an already-populated app. The pull-to-refresh indicator owns
  // its own "refreshing…" pip instead.
  const reload = useCallback(async (): Promise<void> => {
    log.info(
      `reload requested [${adapter.id}] status=${statusRef.current.kind}`,
    );
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    // If the in-memory state differs from the last bytes we read or
    // wrote, push them through the adapter first so a fresh remote
    // read doesn't clobber them. The save can surface a conflict /
    // auth error / parse error; in those cases the existing
    // resolution UI owns the flow and we bail before reloading.
    const transform = beforeSerializeRef.current;
    const currentText = serializeUserData(transform ? transform(data) : data);
    const lastText = lastSnapshotRef.current?.text ?? null;
    const isDirty = lastText !== null && currentText !== lastText;
    if (
      isDirty &&
      hasLoadedRef.current &&
      !isBailStatus(statusRef.current) &&
      statusRef.current.kind !== "saving"
    ) {
      log.info(`reload: flushing dirty state before pull [${adapter.id}]`);
      await performSave(currentText, data, () => false);
      if (isBailStatus(statusRef.current)) {
        log.info(
          `reload aborted — status=${statusRef.current.kind} after pre-flush save`,
        );
        return;
      }
    }
    log.info(`reload start [${adapter.id}]`);
    const start = performance.now();
    try {
      const snap = await adapter.load();
      const ms = (performance.now() - start).toFixed(0);
      log.info(
        `reload ok (${ms}ms) [${adapter.id}] ${
          snap
            ? `bytes=${snap.text.length} rev=${snap.revision ?? "<none>"} offline=${Boolean(snap.offline)}`
            : "<empty>"
        }`,
      );
      lastSnapshotRef.current = snap;
      skipNextSaveRef.current = true;
      hasLoadedRef.current = true;
      const parsed = snap
        ? tryReadUserDataFromText(snap.text, migrationCtx)
        : ({ data: freshUserData(), status: "fresh" } as const);
      setData(parsed.data);
      resetHistory(parsed.data);
      setLastSavedData(snap ? parsed.data : null);
      if (parsed.status === "parse-failed") {
        dispatchStatus({ kind: "parse-error", message: parsed.error });
      } else if (snap?.offline) {
        dispatchStatus({ kind: "save-offline" });
      } else {
        dispatchStatus({ kind: "idle" });
      }
    } catch (err) {
      const ms = (performance.now() - start).toFixed(0);
      if (err instanceof ConflictError) {
        log.warn(
          `reload conflict (${ms}ms) [${adapter.id}] remoteRev=${
            err.remote.revision ?? "<none>"
          } hasLocal=${Boolean(err.local)}`,
        );
        const remote = readUserDataFromText(err.remote.text, migrationCtx);
        const local = err.local
          ? readUserDataFromText(err.local.text, migrationCtx)
          : data;
        lastSnapshotRef.current = err.remote;
        dispatchStatus({ kind: "conflict", local, remote });
        return;
      }
      if (err instanceof AuthError) {
        log.warn(`reload auth failed (${ms}ms) [${adapter.id}]`, err);
        dispatchStatus({ kind: "auth-error", message: err.message });
        return;
      }
      log.error(`reload failed (${ms}ms) [${adapter.id}]`, err);
      dispatchStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, data, performSave, resetHistory, migrationCtx]);

  // Remote-change subscription. Cloud adapters call this when
  // another device pushes; local adapters typically don't supply it.
  useEffect(() => {
    if (!adapter.watch) return;
    log.info(`watch subscribe [${adapter.id}]`);
    const unsubscribe = adapter.watch((snap) => {
      log.info(
        `watch fired [${adapter.id}] bytes=${snap.text.length} rev=${
          snap.revision ?? "<none>"
        } offline=${Boolean(snap.offline)}`,
      );
      lastSnapshotRef.current = snap;
      skipNextSaveRef.current = true;
      hasLoadedRef.current = true;
      const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
      setData(parsed.data);
      resetHistory(parsed.data);
      setLastSavedData(parsed.data);
      if (parsed.status === "parse-failed") {
        dispatchStatus({ kind: "parse-error", message: parsed.error });
      } else if (snap.offline) {
        dispatchStatus({ kind: "save-offline" });
      } else {
        dispatchStatus({ kind: "idle" });
      }
    });
    return () => {
      log.info(`watch unsubscribe [${adapter.id}]`);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, migrationCtx]);

  return { reload };
}
