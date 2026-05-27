import {
  type Dispatch,
  type Reducer,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

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
import {
  freshUserData,
  readUserDataFromText,
  tryReadUserDataFromText,
} from "./local";
import { createSaveChain } from "./save-chain";

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

// Fraction of the previous saved size below which a save is paused
// for confirmation. 0.05 = "shrunk by more than 5%". A 1 MB → 3 KB
// fresh-budget overwrite (the original incident) is a 99.7% shrink
// and trips this trivially; routine edits never do.
const SHRINK_WARN_THRESHOLD = 0.05;
// Maximum number of past states retained in the undo stack. Each
// entry is a `UserData` reference; structural sharing in the reducer
// means unchanged sub-trees are not duplicated across snapshots.
const UNDO_HISTORY_LIMIT = 50;
// Action type stamped on the seed entry created from a fresh load or
// a remote replacement — there's no user action to label it with, so
// the UI renders it as the timeline's start anchor.
const INITIAL_ACTION_TYPE = "initial";
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
  // Active user id. Forwarded into the migration chain so the v34 →
  // v35 step can absorb that user's per-user device-local
  // localStorage values (`budget.download.budget.<userId>`,
  // `budget.download.accounts.<userId>`). Optional so test callers
  // can omit it; the migration treats absent userId as "no
  // per-user localStorage to read".
  userId?: string;
};

// Metadata view of one history entry surfaced to the UI. The full
// `UserData` snapshot is kept inside the hook; consumers identify an
// entry by its position in `historyEntries`.
export type ActionHistoryEntry = {
  // Reducer action type that produced the state at this position, or
  // `"initial"` for the seed entry that anchors the timeline. The UI
  // resolves this to a translated label.
  actionType: string;
  // Wall-clock milliseconds when the action was dispatched (or when
  // the initial state was loaded). Used by the action history modal to
  // tell the user when each action was taken.
  timestamp: number;
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

// Combined entry + cursor state held inside the hook. The whole slice
// runs through `historyReducer` below so dispatch / undo / redo /
// jumpToHistory each correspond to a single named action — instead of
// the previous setHistoryState-with-functional-updater braid that
// scattered the same invariants across four call sites.
type HistoryState = {
  entries: HistoryEntryInternal[];
  cursor: number;
};

type HistoryEntryInternal = {
  state: UserData;
  actionType: string;
  timestamp: number;
};

// Named transitions for the action timeline + undo cursor. The reducer
// stays pure — the side-effect of swapping `data` to the target
// snapshot lives in the calling code, which reads the current entry
// off `historyStateRef` and pairs each cursor move with a setData.
type HistoryAction =
  | { kind: "reset"; seed: UserData }
  | { kind: "append"; entry: HistoryEntryInternal }
  // Move the cursor by ±1, clamped at the timeline edges. Undo / redo
  // dispatch this; the bounds check below is what makes the operation
  // a no-op at the ends instead of producing a bogus cursor.
  | { kind: "step-cursor"; delta: -1 | 1 }
  // Jump the cursor to an arbitrary index, with the same bounds
  // semantics — out-of-range values and self-jumps return the prior
  // state unchanged so the side-effect cleanup in the caller doesn't
  // have to special-case them.
  | { kind: "set-cursor"; cursor: number };

function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.kind) {
    case "reset":
      return initialHistoryState(action.seed);
    case "append": {
      // Drop any "future" entries beyond the cursor — a fresh mutating
      // action overwrites the redo timeline. Then append the new
      // entry and trim from the front if the past portion would
      // exceed UNDO_HISTORY_LIMIT.
      const truncated = state.entries.slice(0, state.cursor + 1);
      const appended = [...truncated, action.entry];
      const cap = UNDO_HISTORY_LIMIT + 1;
      const dropped = Math.max(0, appended.length - cap);
      return {
        entries: dropped > 0 ? appended.slice(dropped) : appended,
        cursor: appended.length - 1 - dropped,
      };
    }
    case "step-cursor": {
      const next = state.cursor + action.delta;
      if (next < 0 || next >= state.entries.length) return state;
      return { entries: state.entries, cursor: next };
    }
    case "set-cursor": {
      if (
        action.cursor < 0 ||
        action.cursor >= state.entries.length ||
        action.cursor === state.cursor
      ) {
        return state;
      }
      return { entries: state.entries, cursor: action.cursor };
    }
  }
}

// SaveStatus kinds the autosave path refuses to write through. The
// app entered one because something already went wrong (a parse
// failure, an auth error, an in-progress load) or because the user
// is mid-resolution (a conflict / shrink-warning modal is up), and
// pushing the current in-memory state would either clobber real
// data on disk or race with the resolution flow.
function isBailStatus(status: SaveStatus): boolean {
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

function initialHistoryState(seed: UserData): HistoryState {
  return {
    entries: [
      {
        state: seed,
        actionType: INITIAL_ACTION_TYPE,
        timestamp: Date.now(),
      },
    ],
    cursor: 0,
  };
}

export function useUserDataStorage<Action extends { type: string }>(
  adapter: StorageAdapter,
  reducer: Reducer<UserData, Action>,
  { beforeSerialize, userId }: UserDataStorageOptions = {},
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

  // Serialises every `performSave` call: a new save can't start
  // until the prior one has settled. Without this, a save that fires
  // while another is still awaiting the network reads the same
  // `lastSnapshot.current.revision` as the in-flight one, both calls
  // send the same baseRev, the cloud accepts the first and 409s the
  // second — surfacing as a phantom "Sync conflict" popup on a
  // single-device account. Most reproducible from Metadata mode and
  // any other workflow where rapid Save clicks queue dispatches
  // inside a single network round-trip. Complements the "record new
  // rev before the stale check" fix inside `performSave` below —
  // that one protects the rev after a save returns; this one
  // protects it during the in-flight window. The chain also
  // coalesces: a second queued body replaces the first, so a burst
  // of edits over a slow network catches up with one trailing save
  // instead of a deep backlog.
  const saveChainRef = useRef(createSaveChain());

  // Timer that flips status back to `idle` after a cloud-side rate
  // limit (HTTP 429) cooldown expires. Cleared on adapter unmount so a
  // backend swap doesn't leave a dangling resume firing into the new
  // adapter. The `resumeNonce` bump alongside the flip re-runs the save
  // effect against the latest `data` even when nothing else changed in
  // the meantime — pending edits coalesce into the next single save.
  const throttleResumeRef = useRef<number | null>(null);
  const [resumeNonce, setResumeNonce] = useState(0);

  // Latest status, exposed via a ref so the save effect can bail when
  // the app is in a bad state without keeping `status` in its dep
  // list. With `status` in the deps, every `setStatus({kind:"saving"})`
  // call inside `performSave` re-ran the effect, the cleanup cancelled
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
  const [historyState, historyDispatch] = useReducer(
    historyReducer,
    initial[0].data,
    initialHistoryState,
  );

  // Ref mirror so the cursor-move callbacks below can look up the
  // target entry synchronously before dispatching — the reducer can't
  // do the `setData(target.state)` side effect itself, and reading the
  // closed-over `historyState` would lag a render behind a freshly
  // dispatched append.
  const historyStateRef = useRef(historyState);
  historyStateRef.current = historyState;

  // Replace the timeline with a fresh seed anchored at `seed`. Called
  // whenever data arrives from outside the dispatch path — initial /
  // async load, remote watch, conflict resolution choosing remote,
  // discardShrinkSave reverting to last-saved bytes. In each of those
  // cases the previous in-memory data is no longer the user's working
  // state, so the old history would describe edits against a vanished
  // base and "undo" past the load would jump to something stale.
  const resetHistory = useCallback((seed: UserData) => {
    historyDispatch({ kind: "reset", seed });
  }, []);

  const dispatch: Dispatch<Action> = useCallback(
    (action) => {
      const recordHistory = !UI_ONLY_ACTION_TYPES.has(action.type);
      setData((prev: UserData) => {
        const next = reducer(prev, action);
        if (recordHistory && next !== prev) {
          historyDispatch({
            kind: "append",
            entry: {
              state: next,
              actionType: action.type,
              timestamp: Date.now(),
            },
          });
        }
        return next;
      });
    },
    [reducer],
  );

  const undo = useCallback(() => {
    const cur = historyStateRef.current;
    if (cur.cursor === 0) return;
    setData(cur.entries[cur.cursor - 1].state);
    historyDispatch({ kind: "step-cursor", delta: -1 });
  }, []);

  const redo = useCallback(() => {
    const cur = historyStateRef.current;
    if (cur.cursor >= cur.entries.length - 1) return;
    setData(cur.entries[cur.cursor + 1].state);
    historyDispatch({ kind: "step-cursor", delta: 1 });
  }, []);

  const jumpToHistory = useCallback((index: number) => {
    const cur = historyStateRef.current;
    if (index < 0 || index >= cur.entries.length || index === cur.cursor) {
      return;
    }
    setData(cur.entries[index].state);
    historyDispatch({ kind: "set-cursor", cursor: index });
  }, []);

  // Shared write path used by both the debounced auto-save and the
  // explicit `saveNow`. Owns status reporting, conflict surfacing,
  // and the lastSnapshot bookkeeping in one place. The
  // `isStale` predicate lets a debounced caller bail out if the
  // effect was cleaned up while the request was in flight.
  const performSave = useCallback(
    (
      text: string,
      isStale: () => boolean,
      { skipShrinkCheck = false }: { skipShrinkCheck?: boolean } = {},
    ): Promise<void> =>
      // Chain onto any prior in-flight save so we don't race for the
      // baseRev. The isStale and bail-status re-checks at the top of
      // the body let a queued save bail when the data has moved on or
      // the app entered a resolution flow while we were waiting.
      saveChainRef.current.run(async () => {
        if (isStale()) {
          log.info(`save skipped (stale before start) [${adapter.id}]`);
          return;
        }
        // Status may have flipped into a bail state (conflict,
        // throttle, …) while we were queued behind another save.
        // Pushing through would clobber the resolution UI the user is
        // about to act on.
        if (isBailStatus(statusRef.current)) {
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
          lastSnapshot.current = next;
          setLastSavedText(next.text);
          if (isStale()) {
            log.info(
              `save ok but stale (${ms}ms) [${adapter.id}] newRev=${next.revision ?? "<none>"}`,
            );
            return;
          }
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
          // Conflict bookkeeping must happen even if our caller is
          // now stale (a re-render between `setStatus("saving")` and
          // the adapter resolving cancelled the effect). Without
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
            const remote = readUserDataFromText(err.remote.text, migrationCtx);
            // The cloud-mirror wrapper attaches `local`; bare cloud
            // adapters don't, in which case the in-memory `data` is
            // the freshest local view we have.
            const local = err.local
              ? readUserDataFromText(err.local.text, migrationCtx)
              : data;
            lastSnapshot.current = err.remote;
            setStatus({ kind: "conflict", local, remote });
            return;
          }
          if (err instanceof RateLimitError) {
            // Soft pause: schedule a resume timer for the carried
            // cooldown, then re-run the save effect via a nonce bump
            // so whatever the user has been editing during the
            // cooldown lands in a single full-blob save. Like the
            // conflict branch, this runs before the stale check — the
            // throttle applies to the whole adapter, not to a single
            // in-flight request, so a stale completion still needs to
            // set up the cooldown bookkeeping.
            const until = Date.now() + err.retryAfterMs;
            log.warn(
              `save throttled (${ms}ms) [${adapter.id}] retryAfter=${err.retryAfterMs}ms until=${until}`,
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
                setStatus({ kind: "idle" });
                setResumeNonce((n) => n + 1);
              }
            }, err.retryAfterMs);
            setStatus({ kind: "throttled", until });
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
      }),
    [adapter, data, migrationCtx],
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
          ? tryReadUserDataFromText(snap.text, migrationCtx)
          : ({ data: freshUserData(), status: "fresh" } as const);
        setData(parsed.data);
        resetHistory(parsed.data);
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
        // Whether this is the first load for this hook instance.
        // Adapter swaps (browser → folder, dropbox → gdrive) re-run
        // the effect with `hasLoadedRef` already true; the very
        // first call after mount finds it false.
        const wasInitialLoad = !hasLoadedRef.current;
        lastSnapshot.current = snap;
        hasLoadedRef.current = true;
        if (snap) {
          // Loaded the user's bytes — these are the canonical state,
          // so suppress the immediate save the upcoming setData would
          // otherwise trigger (no point round-tripping what we just
          // read).
          skipNextSave.current = true;
          const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
          setData(parsed.data);
          resetHistory(parsed.data);
          setLastSavedText(snap.text);
          if (parsed.status === "parse-failed") {
            // Real bytes came back from the adapter but this build
            // can't parse them. The autosave guard refuses to write
            // the fresh fallback over the user's real data on disk —
            // the user reconnects via the sync details panel.
            setStatus({ kind: "parse-error", message: parsed.error });
          } else if (snap.offline) {
            setStatus({ kind: "offline", since: Date.now() });
          } else {
            setStatus({ kind: "idle" });
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
          // `skipNextSave.current` at false and re-publish `data` with
          // a fresh top-level reference so the save effect runs one
          // more time with the gate finally open — that pass picks up
          // every change since mount and writes them out as the
          // user's first persisted snapshot.
          setLastSavedText(null);
          setStatus({ kind: "idle" });
          setData((prev) => ({ ...prev }));
        } else {
          // Adapter swap to a backend that has no data yet — the
          // previous adapter's bytes are stale, so wipe to a fresh
          // baseline (parity with the snap-bearing branch's
          // `setData(parsed.data)`).
          skipNextSave.current = true;
          const fresh = freshUserData();
          setData(fresh);
          resetHistory(fresh);
          setLastSavedText(null);
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
          const remote = readUserDataFromText(err.remote.text, migrationCtx);
          const localText = err.local?.text;
          const local = localText
            ? readUserDataFromText(localText, migrationCtx)
            : freshUserData();
          lastSnapshot.current = err.remote;
          // Seed in-memory state with the local copy so the user
          // sees what they were editing while the modal asks them
          // to pick a side; the alternative (seeding remote) would
          // make "keep mine" look like it discarded their work.
          hasLoadedRef.current = true;
          skipNextSave.current = true;
          setData(local);
          resetHistory(local);
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
      // Drop any pending rate-limit resume timer so a backend swap
      // (or sign-out) doesn't leave a setTimeout firing into the new
      // adapter and flipping its status to `idle` mid-load.
      if (throttleResumeRef.current !== null) {
        window.clearTimeout(throttleResumeRef.current);
        throttleResumeRef.current = null;
      }
    };
  }, [adapter, resetHistory, migrationCtx]);

  // Debounced save. Each state change schedules a write; subsequent
  // changes inside the debounce window replace the pending write.
  // `status` is intentionally NOT a dep — it is read through
  // `statusRef` so that `setStatus({kind:"saving"})` calls inside
  // `performSave` don't re-run this effect and turn the save chain
  // into a tight loop (see the statusRef comment above).
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
      await performSave(text, () => cancelled);
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
      const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
      skipNextSave.current = true;
      setData(parsed.data);
      resetHistory(parsed.data);
      setLastSavedText(snap.text);
      setStatus(
        parsed.status === "parse-failed"
          ? { kind: "parse-error", message: parsed.error }
          : { kind: "idle" },
      );
    } else {
      setStatus({ kind: "idle" });
    }
  }, [adapter.id, resetHistory, status, migrationCtx]);

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
    resetHistory(remote);
    setLastSavedText(remoteText);
    setStatus({ kind: "idle" });
    // Tell the adapter chain that the bytes we're now showing are
    // the authoritative ones — without this the cloud-mirror cache
    // would still hold the unsynced local edits and the next reload
    // would re-surface the conflict.
    adapter.markSynced?.(lastSnapshot.current);
  }, [status, adapter, resetHistory]);

  // Manual refresh from the adapter — pull-to-refresh, "reload" button.
  // Two phases: (1) flush any pending debounced save so the reload
  // doesn't quietly drop unsynced local edits; (2) re-issue
  // `adapter.load()` and replace in-memory state. Mirrors the initial-
  // load body (lines 558-639) and the watch callback (lines 813-833)
  // — same lastSnapshot / skipNextSave / hasLoadedRef bookkeeping so
  // the autosave effect doesn't immediately push the freshly-loaded
  // bytes back out. Skips the `setStatus({kind:"loading"})` flip the
  // initial load does — that triggers the full-screen `AppLoading`
  // splash, which is wrong for a manual refresh on top of an already-
  // populated app. The pull-to-refresh indicator owns its own
  // "refreshing…" pip instead.
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
    const lastText = lastSnapshot.current?.text ?? null;
    const isDirty = lastText !== null && currentText !== lastText;
    if (
      isDirty &&
      hasLoadedRef.current &&
      !isBailStatus(statusRef.current) &&
      statusRef.current.kind !== "saving"
    ) {
      log.info(`reload: flushing dirty state before pull [${adapter.id}]`);
      await performSave(currentText, () => false);
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
      lastSnapshot.current = snap;
      skipNextSave.current = true;
      hasLoadedRef.current = true;
      const parsed = snap
        ? tryReadUserDataFromText(snap.text, migrationCtx)
        : ({ data: freshUserData(), status: "fresh" } as const);
      setData(parsed.data);
      resetHistory(parsed.data);
      setLastSavedText(snap?.text ?? null);
      if (parsed.status === "parse-failed") {
        setStatus({ kind: "parse-error", message: parsed.error });
      } else if (snap?.offline) {
        setStatus({ kind: "offline", since: Date.now() });
      } else {
        setStatus({ kind: "idle" });
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
        lastSnapshot.current = err.remote;
        setStatus({ kind: "conflict", local, remote });
        return;
      }
      if (err instanceof AuthError) {
        log.warn(`reload auth failed (${ms}ms) [${adapter.id}]`, err);
        setStatus({ kind: "auth-error", message: err.message });
        return;
      }
      log.error(`reload failed (${ms}ms) [${adapter.id}]`, err);
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
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
      lastSnapshot.current = snap;
      skipNextSave.current = true;
      hasLoadedRef.current = true;
      const parsed = tryReadUserDataFromText(snap.text, migrationCtx);
      setData(parsed.data);
      resetHistory(parsed.data);
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
  }, [adapter, resetHistory, migrationCtx]);

  const currentText = useMemo(() => serializeUserData(data), [data]);
  const dirty = lastSavedText !== null && currentText !== lastSavedText;

  // Surface the timeline as metadata-only so consumers don't hold
  // refs to internal `UserData` snapshots. Re-derived whenever
  // `historyState.entries` changes, which is fine — the array is
  // short (capped at UNDO_HISTORY_LIMIT + 1 entries).
  const historyEntries = useMemo<ActionHistoryEntry[]>(
    () =>
      historyState.entries.map((entry) => ({
        actionType: entry.actionType,
        timestamp: entry.timestamp,
      })),
    [historyState.entries],
  );

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
    canUndo: historyState.cursor > 0,
    canRedo: historyState.cursor < historyState.entries.length - 1,
    historyEntries,
    historyIndex: historyState.cursor,
    jumpToHistory,
    reload,
  };
}
