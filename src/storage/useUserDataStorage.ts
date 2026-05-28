import {
  type Dispatch,
  type Reducer,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type { MigrationContext } from "../data/migrations";
import type { UserData } from "../data/types";
import { type Snapshot, type StorageAdapter } from "./adapter";
import { freshUserData, tryReadUserDataFromText } from "./local";
import { useLoadState } from "./useLoadState";
import { useSaveStateMachine } from "./useSaveStateMachine";
import { type ActionHistoryEntry, useUndoRedo } from "./useUndoRedo";

// Re-exported so existing consumers that import the type from this
// module (the orchestrating storage hook) don't have to chase the
// type's new home. The canonical declaration lives in `./useUndoRedo`.
export type { ActionHistoryEntry };

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
  // The cloud backend asked us to slow down (HTTP 429). Soft signal —
  // autosave pauses until `until` (wall-clock ms), then a resume timer
  // re-runs the save effect against the latest `data` so pending edits
  // ride along on a single full-blob write. The cloud-icon UI paints
  // the orange `flag` tone instead of the red `err` tone.
  | { kind: "throttled"; until: number }
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

// Reducer actions that are pure UI navigation — they change the
// active tab/sheet but no user data. Excluded from the undo stack so
// ⌘Z reverts the last edit, not a tab switch.
const UI_ONLY_ACTION_TYPES = new Set<string>(["selectSheet"]);

export type UserDataStorageOptions = {
  // Pre-serialize transform applied to the in-memory state before the
  // auto-save effect writes it. Used to strip transient state (e.g.
  // half-filled rows) so storage always reflects a clean snapshot.
  // `saveNow` deliberately bypasses this — a user clicking the save
  // button is asking for the in-memory state as-is.
  beforeSerialize?: (data: UserData) => UserData;
  // True iff `beforeSerialize` would strip content (so the on-disk
  // snapshot ends up shorter than `data`). Drives the post-save tail
  // of the `dirty` flag — without it, dirty falls back to plain
  // reference equality, which would read "clean" right after a save
  // even when transient rows still sit in memory waiting to be filled.
  // Hooked up in AppShell to a O(N) sheet walk (one boolean per row);
  // cheaper than the alternative of re-serializing the full UserData
  // tree on every render to spot stripped rows by comparing bytes.
  hasUnsavableContent?: (data: UserData) => boolean;
  // Active user id. Forwarded into the migration chain so the v34 →
  // v35 step can absorb that user's per-user device-local
  // localStorage values (`budget.download.budget.<userId>`,
  // `budget.download.accounts.<userId>`). Optional so test callers
  // can omit it; the migration treats absent userId as "no
  // per-user localStorage to read".
  userId?: string;
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
  // Step forward through the history of dispatched actions. No-op
  // when `canRedo` is false. Entries past the cursor stay around (so
  // the action history modal can show them greyed) until a new
  // mutating action overwrites them.
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  // Read-only metadata snapshot of every state the hook knows about
  // — the initial seed plus every mutating action dispatched since.
  // Indexed oldest-first. Capped so the past portion never exceeds
  // `UNDO_HISTORY_LIMIT` entries.
  historyEntries: ActionHistoryEntry[];
  // Index of the currently-active state in `historyEntries`. Entries
  // before this index can be returned to via `undo` / `jumpToHistory`;
  // entries after it are the "future" — restorable until a new action
  // overwrites them.
  historyIndex: number;
  // Jump the timeline cursor to the given index, replacing the
  // in-memory state with that entry's snapshot. The "future" entries
  // past the new cursor are preserved (greyed in the UI) until the
  // user dispatches a new action, which truncates them.
  jumpToHistory: (index: number) => void;
  // Pull a fresh snapshot from the adapter and replace in-memory
  // state with it. Used by pull-to-refresh so the user can pick up
  // edits another device pushed to the cloud (or another tab wrote
  // to localStorage). If the in-memory state is dirty, flushes the
  // pending save first so local edits aren't dropped — a conflict
  // surfaced by that save halts the reload and lets the existing
  // resolution UI take over. Resolves when state has been replaced
  // (or the path bailed); rejections are caught internally and
  // surfaced via `status`.
  reload: () => Promise<void>;
};

// Named transitions for the SaveStatus state machine. The reducer is
// pure — the side effects that pair with each transition (logging,
// `setResumeNonce` bumps, in-flight throttle-resume timers) stay in
// the calling code. Replacing the previous ~30 inline
// `setStatus(...)` call sites with a single action union keeps every
// reachable state explicit in one place and makes the load / save /
// reload / watch / conflict / shrink-warning paths share the same
// vocabulary.
export type StatusAction =
  | { kind: "load-start" }
  | { kind: "save-start" }
  // Save completed against the remote; the timestamp is read off the
  // reducer's own clock so call sites don't repeat `Date.now()`.
  | { kind: "save-success" }
  // Save landed in the local mirror because the cloud was unreachable.
  // Same Date.now()-in-reducer pattern as `save-success`.
  | { kind: "save-offline" }
  | { kind: "idle" }
  | { kind: "conflict"; local: UserData; remote: UserData }
  | { kind: "auth-error"; message: string }
  | { kind: "throttled"; until: number }
  | { kind: "parse-error"; message: string }
  | {
      kind: "shrink-warning";
      pendingText: string;
      prevBytes: number;
      newBytes: number;
    }
  | { kind: "error"; message: string };

function statusReducer(_state: SaveStatus, action: StatusAction): SaveStatus {
  switch (action.kind) {
    case "load-start":
      return { kind: "loading" };
    case "save-start":
      return { kind: "saving" };
    case "save-success":
      return { kind: "saved", at: Date.now() };
    case "save-offline":
      return { kind: "offline", since: Date.now() };
    case "idle":
      return { kind: "idle" };
    case "conflict":
      return { kind: "conflict", local: action.local, remote: action.remote };
    case "auth-error":
      return { kind: "auth-error", message: action.message };
    case "throttled":
      return { kind: "throttled", until: action.until };
    case "parse-error":
      return { kind: "parse-error", message: action.message };
    case "shrink-warning":
      return {
        kind: "shrink-warning",
        pendingText: action.pendingText,
        prevBytes: action.prevBytes,
        newBytes: action.newBytes,
      };
    case "error":
      return { kind: "error", message: action.message };
  }
}

// SaveStatus kinds the autosave path refuses to write through. The
// app entered one because something already went wrong (a parse
// failure, an auth error, an in-progress load) or because the user
// is mid-resolution (a conflict / shrink-warning modal is up), and
// pushing the current in-memory state would either clobber real
// data on disk or race with the resolution flow.
export function isBailStatus(status: SaveStatus): boolean {
  return (
    status.kind === "auth-error" ||
    status.kind === "error" ||
    status.kind === "conflict" ||
    status.kind === "loading" ||
    status.kind === "parse-error" ||
    status.kind === "shrink-warning" ||
    status.kind === "throttled"
  );
}

export function useUserDataStorage<Action extends { type: string }>(
  adapter: StorageAdapter,
  reducer: Reducer<UserData, Action>,
  { beforeSerialize, hasUnsavableContent, userId }: UserDataStorageOptions = {},
): UserDataStorage<Action> {
  // Stable migration context for every `readUserDataFromText` /
  // `tryReadUserDataFromText` call this hook makes. Pinned to the
  // active userId so the v34 → v35 step can find the right
  // per-user localStorage keys to absorb.
  const migrationCtx: MigrationContext = useMemo(() => ({ userId }), [userId]);
  // Synchronous fast path: if the adapter can hand back data before
  // the first paint (localStorage can; cloud cannot), seed the
  // reducer with the real state right away. Otherwise we start
  // empty and the async load below replaces it.
  const initial = useState<{ data: UserData; status: SaveStatus }>(() => {
    const snap = adapter.loadSync?.() ?? null;
    if (snap) {
      const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
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
  // Status flows through `statusReducer` so every transition is a
  // named action — the load / save / reload / watch paths all dispatch
  // into the same vocabulary instead of constructing `SaveStatus`
  // objects inline at ~30 different sites.
  const [status, dispatchStatus] = useReducer(statusReducer, initial[0].status);
  // The in-memory `UserData` reference that corresponds to the last
  // bytes successfully written to (or loaded from) storage. Drives the
  // `dirty` flag below via reference equality — every reducer action
  // produces a fresh top-level reference, so `data !== lastSavedData`
  // catches edits in O(1) without re-serializing the whole tree.
  const [lastSavedData, setLastSavedData] = useState<UserData | null>(() => {
    const snap = adapter.loadSync?.() ?? null;
    if (!snap) return null;
    const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
    return parsed.status === "parse-failed" ? null : parsed.data;
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
  // it before issuing its own immediate write. Owned here because the
  // load path's `reload` clears it during the dirty pre-flush, and the
  // save path's debounce / `saveNow` write it — the ref is the
  // straddle point so both halves see the same timer.
  const pendingTimerRef = useRef<number | null>(null);

  // Latest status, exposed via a ref so the save effect can bail when
  // the app is in a bad state without keeping `status` in its dep
  // list. With `status` in the deps, every `save-start` dispatch
  // inside `performSave` re-ran the effect, the cleanup cancelled
  // the in-flight save as "stale", and the body immediately scheduled
  // another save — an autosave loop that produced endless saves on
  // any data change and pinned status to "saving" forever (each stale
  // completion skipped the success branch that would have flipped
  // status back to "saved"). Most visible after a `selectSheet`
  // dispatch, which mutates `data.activeSheetId` and is a real data
  // change even though the user only switched tabs.
  const statusRef = useRef(status);
  statusRef.current = status;

  // Unified action history. `entries[cursor]` always matches the
  // current `data`. Entries before the cursor are reachable via undo /
  // jumpToHistory; entries after the cursor are "future" — kept around
  // so the action history modal can render them greyed, and dropped
  // only when the user dispatches a new mutating action while the
  // cursor is somewhere in the middle.
  //
  // Cap: the past portion never grows past UNDO_HISTORY_LIMIT entries
  // (i.e. cursor + 1 ≤ UNDO_HISTORY_LIMIT + 1). When the user is at
  // the latest position and dispatches past the cap, the oldest entry
  // falls off the bottom — the same behaviour the old two-stack
  // implementation had.
  const {
    appendEntry,
    resetHistory,
    undo,
    redo,
    jumpToHistory,
    historyEntries,
    historyIndex,
    canUndo,
    canRedo,
  } = useUndoRedo({ initialSeed: initial[0].data, setData });

  const dispatch: Dispatch<Action> = useCallback(
    (action) => {
      const recordHistory = !UI_ONLY_ACTION_TYPES.has(action.type);
      setData((prev: UserData) => {
        const next = reducer(prev, action);
        if (recordHistory && next !== prev) {
          appendEntry({
            state: next,
            actionType: action.type,
            timestamp: Date.now(),
          });
        }
        return next;
      });
    },
    [reducer, appendEntry],
  );

  // Shared write path used by both the debounced auto-save and the
  // explicit `saveNow`. Owns status reporting, conflict surfacing,
  // and the lastSnapshot bookkeeping in one place. The
  // `isStale` predicate lets a debounced caller bail out if the
  // effect was cleaned up while the request was in flight.
  // `savedData` is the in-memory `UserData` reference that produced
  // `text` — passed through so the success branch can stamp it as
  // `lastSavedData` for the ref-equality `dirty` check. The two
  // arguments stay paired at every call site (always
  // `serializeUserData(D) + D`), so threading them together is the
  // simplest way to keep the dirty-tracking in sync without bolting
  // a parallel "what data did we just save" channel onto the adapter
  // contract.
  const {
    performSave,
    saveNow,
    resolveKeepLocal,
    resolveKeepRemote,
    confirmShrinkSave,
    discardShrinkSave,
  } = useSaveStateMachine({
    adapter,
    data,
    status,
    migrationCtx,
    beforeSerializeRef,
    statusRef,
    lastSnapshotRef: lastSnapshot,
    skipNextSaveRef: skipNextSave,
    hasLoadedRef,
    pendingTimerRef,
    setData,
    setLastSavedData,
    dispatchStatus,
    resetHistory,
  });

  const { reload } = useLoadState({
    adapter,
    data,
    migrationCtx,
    beforeSerializeRef,
    performSave,
    statusRef,
    lastSnapshotRef: lastSnapshot,
    skipNextSaveRef: skipNextSave,
    hasLoadedRef,
    pendingTimerRef,
    setData,
    setLastSavedData,
    dispatchStatus,
    resetHistory,
  });

  // Ref-equality dirty check. Every reducer action produces a new
  // top-level `UserData` reference, so `data !== lastSavedData` is the
  // O(1) flag that "edits happened since the last load or save".
  // Previously this re-serialized the whole tree on every render via a
  // string-equality compare — for a budget with a few MB of JSON and
  // the sorted-keys replacer in `serializeUserData`, that was the
  // dominant cost of every keystroke. With the ref check the only
  // O(N) work left is the optional `hasUnsavableContent` walk, which
  // a `beforeSerialize` caller passes in to capture the "in-memory
  // has rows the autosave would strip" case the prior implementation
  // got for free via the byte comparison.
  const dirty = useMemo(() => {
    if (lastSavedData === null) return false;
    if (data === lastSavedData) {
      return hasUnsavableContent ? hasUnsavableContent(data) : false;
    }
    return true;
  }, [data, lastSavedData, hasUnsavableContent]);

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
    canUndo,
    canRedo,
    historyEntries,
    historyIndex,
    jumpToHistory,
    reload,
  };
}
