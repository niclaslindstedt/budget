import {
  type Dispatch,
  type Reducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

const log = createLogger("storage-hook");

// Orchestrates a `StorageAdapter` against a React reducer. The
// reducer keeps its existing shape — pure `(state, action) => state`
// — and this hook owns the side-effects: initial load, debounced
// save, conflict surfacing, and (when the adapter supports it)
// reaction to remote changes pushed by other devices.

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  // Editing a local mirror because the cloud was unreachable. The
  // hook keeps trying on every save so the moment the network
  // returns we push automatically. `since` is the wall-clock ms of
  // the load (or save) that flipped us into this state.
  | { kind: "offline"; since: number }
  // Local mirror and remote diverged. `local` is what this device
  // has been editing; `remote` is the bytes currently on the cloud.
  // The UI offers a resolution modal whose buttons call
  // `resolveKeepLocal` / `resolveKeepRemote`.
  | { kind: "conflict"; local: UserData; remote: UserData }
  | { kind: "error"; message: string }
  // The cloud backend rejected the request with a 401 after any silent
  // refresh has already been tried. The UI shows a Reconnect button
  // instead of a Try-again that would fail the same way.
  | { kind: "auth-error"; message: string }
  // The adapter returned bytes but the validator rejected them (a
  // schema drift in this build vs the data on disk). In-memory state
  // is the fresh-budget fallback, but the real bytes are still on
  // disk/cloud — refusing to autosave preserves them until the user
  // resolves the situation (newer build, manual export, etc.).
  | { kind: "parse-error"; message: string }
  // The next autosave would shrink the file by more than
  // SHRINK_WARN_THRESHOLD vs the last-saved bytes. We pause and
  // surface the previous / new size so the user can confirm or
  // discard the pending write. A real-world shrink that's not
  // catastrophic (a category deletion, big bulk delete) is still
  // legitimate; the safeguard exists for "fresh-budget fallback
  // about to overwrite 1MB" data-loss shapes.
  | {
      kind: "shrink-warning";
      pendingText: string;
      prevBytes: number;
      newBytes: number;
    };

// Fraction of the previous saved size below which a save is paused
// for confirmation. 0.05 = "shrunk by more than 5%". A 1 MB → 3 KB
// fresh-budget overwrite (the original incident) is a 99.7% shrink
// and trips this trivially; routine edits never do.
const SHRINK_WARN_THRESHOLD = 0.05;
// Maximum number of past states retained in the undo stack. Each
// entry is a `UserData` reference; structural sharing in the reducer
// means unchanged sub-trees are not duplicated across snapshots.
const UNDO_HISTORY_LIMIT = 50;
// Reducer actions that are pure UI navigation — they change the
// active tab/sheet but no user data. Excluded from the undo stack so
// ⌘Z reverts the last edit, not a tab switch.
const UI_ONLY_ACTION_TYPES = new Set<string>(["selectSheet"]);
// Minimum previous size for the shrink check to engage. A new user
// going from 0 → small budget should never be challenged, and edits
// that toggle a 200-byte settings blob shouldn't be either.
const SHRINK_WARN_MIN_PREV_BYTES = 4096;

export type UserDataStorageOptions = {
  // Pre-serialize transform applied to the in-memory state before the
  // auto-save effect writes it. Used to strip transient state (e.g.
  // half-filled rows) so storage always reflects a clean snapshot.
  // `saveNow` deliberately bypasses this — a user clicking the save
  // button is asking for the in-memory state as-is.
  beforeSerialize?: (data: UserData) => UserData;
};

export type UserDataStorage<Action> = {
  data: UserData;
  dispatch: Dispatch<Action>;
  status: SaveStatus;
  // True when the in-memory state differs from the last bytes written
  // to storage. With a `beforeSerialize` filter active, this also
  // captures rows the auto-save deliberately omits (e.g. half-filled
  // rows), so callers can prompt before unload and light up an
  // explicit-save affordance.
  dirty: boolean;
  // Save the current in-memory state as-is — skipping any
  // `beforeSerialize` filter and the debounce timer.
  saveNow: () => void;
  // Discard the remote and push the local copy in its place. Only
  // meaningful while `status.kind === "conflict"` — a no-op
  // otherwise.
  resolveKeepLocal: () => void;
  // Discard the local edits and adopt the remote copy. Only
  // meaningful while `status.kind === "conflict"`.
  resolveKeepRemote: () => void;
  // Confirm the paused save that tripped the shrink safeguard. Only
  // meaningful while `status.kind === "shrink-warning"`.
  confirmShrinkSave: () => void;
  // Abandon the paused save and revert the in-memory state to the
  // last successfully saved snapshot. Only meaningful while
  // `status.kind === "shrink-warning"`.
  discardShrinkSave: () => void;
  // Step backward through the history of dispatched actions. No-op
  // when `canUndo` is false. The reverted state still flows through
  // the normal save path, so persistence stays consistent.
  undo: () => void;
  // Step forward through the redo stack. No-op when `canRedo` is
  // false. The redo stack is cleared whenever a new mutating action
  // is dispatched.
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function useUserDataStorage<Action extends { type: string }>(
  adapter: StorageAdapter,
  reducer: Reducer<UserData, Action>,
  { beforeSerialize }: UserDataStorageOptions = {},
): UserDataStorage<Action> {
  // Synchronous fast path: if the adapter can hand back data before
  // the first paint (localStorage can; cloud cannot), seed the
  // reducer with the real state right away. Otherwise we start
  // empty and the async load below replaces it.
  const initial = useState<{ data: UserData; status: SaveStatus }>(() => {
    const snap = adapter.loadSync?.() ?? null;
    if (snap) {
      const parsed = tryReadUserDataFromText(snap.text);
      if (parsed.status === "parse-failed") {
        return {
          data: parsed.data,
          status: { kind: "parse-error", message: parsed.error },
        };
      }
      return { data: parsed.data, status: { kind: "idle" } };
    }
    return {
      data: freshUserData(),
      status: adapter.loadSync ? { kind: "idle" } : { kind: "loading" },
    };
  });

  const [data, setData] = useState<UserData>(initial[0].data);
  const [status, setStatus] = useState<SaveStatus>(initial[0].status);
  // Last bytes successfully written to (or loaded from) storage.
  // Drives the `dirty` flag below.
  const [lastSavedText, setLastSavedText] = useState<string | null>(() => {
    const snap = adapter.loadSync?.() ?? null;
    return snap?.text ?? null;
  });

  // Track the last snapshot we either loaded or successfully saved.
  // The revision flows back into the next save so a remote that
  // moved underneath us is detected as a conflict instead of being
  // silently overwritten.
  const lastSnapshot = useRef<Snapshot | null>(adapter.loadSync?.() ?? null);

  // The save effect should not fire when state changes are caused
  // by loads (initial fetch or remote watch) — those already match
  // the stored bytes and a save round-trip would just churn the
  // revision token. We guard with a ref that the loader flips.
  const skipNextSave = useRef<boolean>(false);

  // Async adapters (e.g. the encrypting wrapper) can't hand back
  // data before the first paint, so the reducer is briefly seeded
  // with `freshUserData()`. Without this gate, the auto-save effect
  // races the in-flight `adapter.load()` — a `setTimeout(0)` fires
  // well before PBKDF2 + AES-GCM decryption completes, and writes
  // the empty starter state over the user's real bytes. The flag
  // stays false until the load resolves (or the synchronous fast
  // path filled state from `loadSync`).
  const hasLoadedRef = useRef<boolean>(adapter.loadSync !== undefined);

  // Stash `beforeSerialize` in a ref so the save effect closes over
  // the latest transform without re-running every time the caller
  // passes an inline function.
  const beforeSerializeRef = useRef(beforeSerialize);
  beforeSerializeRef.current = beforeSerialize;

  // Handle to the pending debounced save, so `saveNow` can cancel
  // it before issuing its own immediate write.
  const pendingTimerRef = useRef<number | null>(null);

  // Undo / redo stacks. Each entry is the `UserData` snapshot that
  // was current *before* the action ran, so undo can restore it
  // verbatim. Capped at UNDO_HISTORY_LIMIT — older entries fall off
  // the bottom when the stack grows past the cap. Redo is cleared on
  // any new mutating dispatch.
  const [undoStack, setUndoStack] = useState<UserData[]>([]);
  const [redoStack, setRedoStack] = useState<UserData[]>([]);

  const dispatch: Dispatch<Action> = useCallback(
    (action) => {
      const recordHistory = !UI_ONLY_ACTION_TYPES.has(action.type);
      setData((prev: UserData) => {
        const next = reducer(prev, action);
        if (recordHistory && next !== prev) {
          setUndoStack((stack: UserData[]) => {
            const appended = [...stack, prev];
            return appended.length > UNDO_HISTORY_LIMIT
              ? appended.slice(appended.length - UNDO_HISTORY_LIMIT)
              : appended;
          });
          setRedoStack((stack: UserData[]) =>
            stack.length === 0 ? stack : [],
          );
        }
        return next;
      });
    },
    [reducer],
  );

  const undo = useCallback(() => {
    setUndoStack((stack: UserData[]) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1];
      setData((current: UserData) => {
        setRedoStack((redo: UserData[]) => [...redo, current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((stack: UserData[]) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1];
      setData((current: UserData) => {
        setUndoStack((undoStackInner: UserData[]) => {
          const appended = [...undoStackInner, current];
          return appended.length > UNDO_HISTORY_LIMIT
            ? appended.slice(appended.length - UNDO_HISTORY_LIMIT)
            : appended;
        });
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  // Shared write path used by both the debounced auto-save and the
  // explicit `saveNow`. Owns status reporting, conflict surfacing,
  // and the lastSnapshot bookkeeping in one place. The
  // `isStale` predicate lets a debounced caller bail out if the
  // effect was cleaned up while the request was in flight.
  const performSave = useCallback(
    async (
      text: string,
      isStale: () => boolean,
      { skipShrinkCheck = false }: { skipShrinkCheck?: boolean } = {},
    ): Promise<void> => {
      if (isStale()) {
        log.info(`save skipped (stale before start) [${adapter.id}]`);
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
      const prevBytes = lastSnapshot.current?.text.length ?? null;
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
        setStatus({
          kind: "shrink-warning",
          pendingText: text,
          prevBytes,
          newBytes: text.length,
        });
        return;
      }
      setStatus({ kind: "saving" });
      log.info(
        `save start [${adapter.id}] bytes=${text.length} baseRev=${
          lastSnapshot.current?.revision ?? "<none>"
        }`,
      );
      const start = performance.now();
      try {
        const next = await adapter.save(text, lastSnapshot.current?.revision);
        const ms = (performance.now() - start).toFixed(0);
        if (isStale()) {
          log.info(`save ok but stale (${ms}ms) [${adapter.id}]`);
          return;
        }
        lastSnapshot.current = next;
        setLastSavedText(next.text);
        if (next.offline) {
          setStatus({ kind: "offline", since: Date.now() });
          log.info(
            `save offline (${ms}ms) [${adapter.id}] mirroredRev=${next.revision ?? "<none>"}`,
          );
        } else {
          setStatus({ kind: "saved", at: Date.now() });
          log.info(
            `save ok (${ms}ms) [${adapter.id}] newRev=${next.revision ?? "<none>"}`,
          );
        }
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        // Conflict bookkeeping must happen even if our caller is now
        // stale (a re-render between `setStatus("saving")` and the
        // adapter resolving cancelled the effect). Without stashing
        // `err.remote` here, the next save reuses the old baseRev
        // and we loop on the same 409 forever. Setting the conflict
        // status surfaces the resolution modal AND lands us in the
        // save effect's bail list so the autosave loop stops.
        if (err instanceof ConflictError) {
          log.warn(
            `save conflict (${ms}ms) [${adapter.id}] remoteRev=${
              err.remote.revision ?? "<none>"
            } hasLocal=${Boolean(err.local)} stale=${isStale()}`,
          );
          const remote = readUserDataFromText(err.remote.text);
          // The cloud-mirror wrapper attaches `local`; bare cloud
          // adapters don't, in which case the in-memory `data` is
          // the freshest local view we have.
          const local = err.local ? readUserDataFromText(err.local.text) : data;
          lastSnapshot.current = err.remote;
          setStatus({ kind: "conflict", local, remote });
          return;
        }
        if (isStale()) {
          log.info(`save failed but stale (${ms}ms) [${adapter.id}]`, err);
          return;
        }
        if (err instanceof AuthError) {
          log.warn(`save auth failed (${ms}ms) [${adapter.id}]`, err);
          setStatus({ kind: "auth-error", message: err.message });
          return;
        }
        log.error(`save failed (${ms}ms) [${adapter.id}]`, err);
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [adapter, data],
  );

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
        lastSnapshot.current = snap;
        skipNextSave.current = true;
        hasLoadedRef.current = true;
        const parsed = snap
          ? tryReadUserDataFromText(snap.text)
          : ({ data: freshUserData(), status: "fresh" } as const);
        setData(parsed.data);
        setLastSavedText(snap?.text ?? null);
        if (parsed.status === "parse-failed") {
          setStatus({ kind: "parse-error", message: parsed.error });
        } else {
          setStatus({ kind: "idle" });
        }
        return;
      }
      log.info(`adapter mount [${adapter.id}] sync — load skipped`);
      return;
    }
    let cancelled = false;
    setStatus({ kind: "loading" });
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
        lastSnapshot.current = snap;
        skipNextSave.current = true;
        hasLoadedRef.current = true;
        const parsed = snap
          ? tryReadUserDataFromText(snap.text)
          : ({ data: freshUserData(), status: "fresh" } as const);
        setData(parsed.data);
        setLastSavedText(snap?.text ?? null);
        if (parsed.status === "parse-failed") {
          // Real bytes came back from the adapter but this build
          // can't parse them. The autosave guard refuses to write
          // the fresh fallback over the user's real data on disk —
          // the user reconnects via the sync details panel.
          setStatus({ kind: "parse-error", message: parsed.error });
        } else if (snap?.offline) {
          setStatus({ kind: "offline", since: Date.now() });
        } else {
          setStatus({ kind: "idle" });
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
          const remote = readUserDataFromText(err.remote.text);
          const localText = err.local?.text;
          const local = localText
            ? readUserDataFromText(localText)
            : freshUserData();
          lastSnapshot.current = err.remote;
          // Seed in-memory state with the local copy so the user
          // sees what they were editing while the modal asks them
          // to pick a side; the alternative (seeding remote) would
          // make "keep mine" look like it discarded their work.
          hasLoadedRef.current = true;
          skipNextSave.current = true;
          setData(local);
          setLastSavedText(localText ?? null);
          setStatus({ kind: "conflict", local, remote });
          return;
        }
        if (err instanceof AuthError) {
          log.warn(`load auth failed (${ms}ms) [${adapter.id}]`, err);
          setStatus({ kind: "auth-error", message: err.message });
          return;
        }
        log.error(`load failed (${ms}ms) [${adapter.id}]`, err);
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
      log.info(`adapter unmount [${adapter.id}] (in-flight load cancelled)`);
    };
  }, [adapter]);

  // Debounced save. Each state change schedules a write; subsequent
  // changes inside the debounce window replace the pending write.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
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
    if (
      status.kind === "auth-error" ||
      status.kind === "error" ||
      status.kind === "conflict" ||
      status.kind === "loading" ||
      status.kind === "parse-error" ||
      status.kind === "shrink-warning"
    ) {
      log.info(
        `save skipped — status=${status.kind} (refusing to overwrite real data with the post-failure in-memory copy)`,
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
      const transform = beforeSerializeRef.current;
      const text = serializeUserData(transform ? transform(data) : data);
      await performSave(text, () => cancelled);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
  }, [adapter, data, performSave, status]);

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
      status.kind === "shrink-warning"
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
    void performSave(text, () => false);
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
    void performSave(text, () => false);
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
    void performSave(pendingText, () => false, { skipShrinkCheck: true });
  }, [adapter, performSave, status]);

  const discardShrinkSave = useCallback(() => {
    if (status.kind !== "shrink-warning") return;
    log.info(
      `shrink resolve: discard — reverting to last-saved snapshot [${adapter.id}]`,
    );
    const snap = lastSnapshot.current;
    if (snap) {
      const parsed = tryReadUserDataFromText(snap.text);
      skipNextSave.current = true;
      setData(parsed.data);
      setLastSavedText(snap.text);
      setStatus(
        parsed.status === "parse-failed"
          ? { kind: "parse-error", message: parsed.error }
          : { kind: "idle" },
      );
    } else {
      setStatus({ kind: "idle" });
    }
  }, [adapter.id, status]);

  const resolveKeepRemote = useCallback(() => {
    if (status.kind !== "conflict") return;
    log.info("conflict resolve: keep remote — replacing in-memory data");
    const { remote } = status;
    const remoteText = serializeUserData(remote);
    // Mirror what a successful load would have set so the
    // surrounding effects don't double-handle the swap.
    lastSnapshot.current = lastSnapshot.current
      ? { ...lastSnapshot.current, text: remoteText }
      : { text: remoteText };
    skipNextSave.current = true;
    setData(remote);
    setLastSavedText(remoteText);
    setStatus({ kind: "idle" });
    // Tell the adapter chain that the bytes we're now showing are
    // the authoritative ones — without this the cloud-mirror cache
    // would still hold the unsynced local edits and the next reload
    // would re-surface the conflict.
    adapter.markSynced?.(lastSnapshot.current);
  }, [status, adapter]);

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
      lastSnapshot.current = snap;
      skipNextSave.current = true;
      hasLoadedRef.current = true;
      const parsed = tryReadUserDataFromText(snap.text);
      setData(parsed.data);
      setLastSavedText(snap.text);
      if (parsed.status === "parse-failed") {
        setStatus({ kind: "parse-error", message: parsed.error });
      } else if (snap.offline) {
        setStatus({ kind: "offline", since: Date.now() });
      } else {
        setStatus({ kind: "idle" });
      }
    });
    return () => {
      log.info(`watch unsubscribe [${adapter.id}]`);
      unsubscribe();
    };
  }, [adapter]);

  const currentText = useMemo(() => serializeUserData(data), [data]);
  const dirty = lastSavedText !== null && currentText !== lastSavedText;

  return {
    data,
    dispatch,
    status,
    dirty,
    saveNow,
    resolveKeepLocal,
    resolveKeepRemote,
    confirmShrinkSave,
    discardShrinkSave,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
