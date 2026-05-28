import { useCallback, useMemo, useReducer, useRef } from "react";

import type { UserData } from "../data/types";

// Maximum number of past states retained in the undo stack. Each
// entry is a `UserData` reference; structural sharing in the reducer
// means unchanged sub-trees are not duplicated across snapshots.
const UNDO_HISTORY_LIMIT = 50;
// Action type stamped on the seed entry created from a fresh load or
// a remote replacement — there's no user action to label it with, so
// the UI renders it as the timeline's start anchor.
const INITIAL_ACTION_TYPE = "initial";

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

// Metadata view of one history entry surfaced to the UI. The full
// `UserData` snapshot is kept inside the hook; consumers identify an
// entry by its position in `historyEntries`.
export type ActionHistoryEntry = {
  actionType: string;
  timestamp: number;
};

export type UndoRedo = {
  // Append a new snapshot to the timeline. Called from the outer
  // storage hook's `dispatch` immediately after the reducer applies,
  // gated on the action being a real user edit (UI-only navigation
  // actions are filtered before this is invoked). Discards any
  // "future" entries beyond the cursor — a fresh mutating action
  // overwrites the redo timeline.
  appendEntry: (entry: {
    state: UserData;
    actionType: string;
    timestamp: number;
  }) => void;
  // Replace the timeline with a fresh seed anchored at `seed`. Called
  // whenever data arrives from outside the dispatch path — initial /
  // async load, remote watch, conflict resolution choosing remote,
  // discardShrinkSave reverting to last-saved bytes. In each of those
  // cases the previous in-memory data is no longer the user's working
  // state, so the old history would describe edits against a vanished
  // base and "undo" past the load would jump to something stale.
  resetHistory: (seed: UserData) => void;
  // Cursor moves. Each one calls `setData` with the target snapshot
  // synchronously — the snapshot is read off the internal ref so
  // there's no render lag between the cursor move and the visible
  // state swap.
  undo: () => void;
  redo: () => void;
  jumpToHistory: (index: number) => void;
  // Derived view of the timeline for the action-history modal. Stable
  // identity until the underlying entries array changes.
  historyEntries: ActionHistoryEntry[];
  historyIndex: number;
  canUndo: boolean;
  canRedo: boolean;
};

// Owner of the in-memory undo / redo / jump-to-history timeline.
// Tracks `UserData` snapshots produced by the outer storage hook's
// reducer and lets the UI walk backwards / forwards through them.
// The cursor-move callbacks call `setData` with the target snapshot
// so the outer hook's React state stays in sync with the timeline
// position; pairing the cursor move and the data swap inside this
// hook keeps the two from drifting out of agreement.
export function useUndoRedo(params: {
  initialSeed: UserData;
  setData: (next: UserData) => void;
}): UndoRedo {
  const { initialSeed, setData } = params;

  // Stable ref so the cursor-move callbacks can call into the latest
  // `setData` without retrigging a hook re-subscription on every
  // render — the outer storage hook hands in a useState setter that's
  // identity-stable, but consumers could pass a closure that isn't.
  const setDataRef = useRef(setData);
  setDataRef.current = setData;

  const [historyState, historyDispatch] = useReducer(
    historyReducer,
    initialSeed,
    initialHistoryState,
  );

  // Ref mirror so the cursor-move callbacks below can look up the
  // target entry synchronously before dispatching — the reducer can't
  // do the `setData(target.state)` side effect itself, and reading the
  // closed-over `historyState` would lag a render behind a freshly
  // dispatched append.
  const historyStateRef = useRef(historyState);
  historyStateRef.current = historyState;

  const appendEntry = useCallback(
    (entry: { state: UserData; actionType: string; timestamp: number }) => {
      historyDispatch({ kind: "append", entry });
    },
    [],
  );

  const resetHistory = useCallback((seed: UserData) => {
    historyDispatch({ kind: "reset", seed });
  }, []);

  const undo = useCallback(() => {
    const cur = historyStateRef.current;
    if (cur.cursor === 0) return;
    setDataRef.current(cur.entries[cur.cursor - 1].state);
    historyDispatch({ kind: "step-cursor", delta: -1 });
  }, []);

  const redo = useCallback(() => {
    const cur = historyStateRef.current;
    if (cur.cursor >= cur.entries.length - 1) return;
    setDataRef.current(cur.entries[cur.cursor + 1].state);
    historyDispatch({ kind: "step-cursor", delta: 1 });
  }, []);

  const jumpToHistory = useCallback((index: number) => {
    const cur = historyStateRef.current;
    if (index < 0 || index >= cur.entries.length || index === cur.cursor) {
      return;
    }
    setDataRef.current(cur.entries[index].state);
    historyDispatch({ kind: "set-cursor", cursor: index });
  }, []);

  // The action-history modal renders this list. Re-derives whenever
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
    appendEntry,
    resetHistory,
    undo,
    redo,
    jumpToHistory,
    historyEntries,
    historyIndex: historyState.cursor,
    canUndo: historyState.cursor > 0,
    canRedo: historyState.cursor < historyState.entries.length - 1,
  };
}
