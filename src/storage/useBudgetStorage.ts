import {
  type Dispatch,
  type Reducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Budget } from "../data/types";
import { ConflictError, type Snapshot, type StorageAdapter } from "./adapter";
import { serializeBudget } from "./file";
import { freshBudget, readBudgetFromText } from "./local";

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
  | { kind: "conflict"; remote: Budget }
  | { kind: "error"; message: string };

export type BudgetStorageOptions = {
  // Pre-serialize transform applied to the in-memory budget before
  // the auto-save effect writes it. Used to strip transient state
  // (e.g. half-filled rows) so storage always reflects a clean
  // snapshot. `saveNow` deliberately bypasses this — a user clicking
  // the save button is asking for the in-memory state as-is.
  beforeSerialize?: (budget: Budget) => Budget;
};

export type BudgetStorage<Action> = {
  budget: Budget;
  dispatch: Dispatch<Action>;
  status: SaveStatus;
  // True when the in-memory budget differs from the last bytes
  // written to storage. With a `beforeSerialize` filter active, this
  // also captures rows the auto-save deliberately omits (e.g.
  // half-filled rows), so callers can prompt before unload and light
  // up an explicit-save affordance.
  dirty: boolean;
  // Save the current in-memory budget as-is — skipping any
  // `beforeSerialize` filter and the debounce timer.
  saveNow: () => void;
};

export function useBudgetStorage<Action>(
  adapter: StorageAdapter,
  reducer: Reducer<Budget, Action>,
  { beforeSerialize }: BudgetStorageOptions = {},
): BudgetStorage<Action> {
  // Synchronous fast path: if the adapter can hand back data before
  // the first paint (localStorage can; cloud cannot), seed the
  // reducer with the real budget right away. Otherwise we start
  // empty and the async load below replaces it.
  const initial = useState<{ budget: Budget; status: SaveStatus }>(() => {
    const snap = adapter.loadSync?.() ?? null;
    if (snap) {
      return {
        budget: readBudgetFromText(snap.text),
        status: { kind: "idle" },
      };
    }
    return {
      budget: freshBudget(),
      status: adapter.loadSync ? { kind: "idle" } : { kind: "loading" },
    };
  });

  const [budget, setBudget] = useState<Budget>(initial[0].budget);
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

  // Stash `beforeSerialize` in a ref so the save effect closes over
  // the latest transform without re-running every time the caller
  // passes an inline function.
  const beforeSerializeRef = useRef(beforeSerialize);
  beforeSerializeRef.current = beforeSerialize;

  // Handle to the pending debounced save, so `saveNow` can cancel
  // it before issuing its own immediate write.
  const pendingTimerRef = useRef<number | null>(null);

  const dispatch: Dispatch<Action> = useCallback(
    (action) => {
      setBudget((prev) => reducer(prev, action));
    },
    [reducer],
  );

  // Shared write path used by both the debounced auto-save and the
  // explicit `saveNow`. Owns status reporting, conflict surfacing,
  // and the lastSnapshot bookkeeping in one place. The
  // `isStale` predicate lets a debounced caller bail out if the
  // effect was cleaned up while the request was in flight.
  const performSave = useCallback(
    async (text: string, isStale: () => boolean): Promise<void> => {
      if (isStale()) return;
      setStatus({ kind: "saving" });
      try {
        const next = await adapter.save(text, lastSnapshot.current?.revision);
        if (isStale()) return;
        lastSnapshot.current = next;
        setLastSavedText(next.text);
        setStatus({ kind: "saved", at: Date.now() });
      } catch (err) {
        if (isStale()) return;
        if (err instanceof ConflictError) {
          const remote = readBudgetFromText(err.remote.text);
          lastSnapshot.current = err.remote;
          setStatus({ kind: "conflict", remote });
          return;
        }
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [adapter],
  );

  // Async load. Skipped when `loadSync` already handed us data.
  useEffect(() => {
    if (adapter.loadSync) return;
    let cancelled = false;
    setStatus({ kind: "loading" });
    adapter
      .load()
      .then((snap) => {
        if (cancelled) return;
        lastSnapshot.current = snap;
        skipNextSave.current = true;
        setBudget(snap ? readBudgetFromText(snap.text) : freshBudget());
        setLastSavedText(snap?.text ?? null);
        setStatus({ kind: "idle" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // Debounced save. Each budget change schedules a write; subsequent
  // changes inside the debounce window replace the pending write.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
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
      const text = serializeBudget(transform ? transform(budget) : budget);
      await performSave(text, () => cancelled);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (pendingTimerRef.current === timer) pendingTimerRef.current = null;
    };
  }, [adapter, budget, performSave]);

  // Save the current in-memory budget verbatim. Used by the explicit
  // "save" button — bypasses `beforeSerialize` so the user can persist
  // half-filled rows when they ask for it.
  const saveNow = useCallback(() => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    const text = serializeBudget(budget);
    void performSave(text, () => false);
  }, [budget, performSave]);

  // Remote-change subscription. Cloud adapters call this when
  // another device pushes; local adapters typically don't supply it.
  useEffect(() => {
    if (!adapter.watch) return;
    return adapter.watch((snap) => {
      lastSnapshot.current = snap;
      skipNextSave.current = true;
      setBudget(readBudgetFromText(snap.text));
      setLastSavedText(snap.text);
      setStatus({ kind: "idle" });
    });
  }, [adapter]);

  const currentText = useMemo(() => serializeBudget(budget), [budget]);
  const dirty = lastSavedText !== null && currentText !== lastSavedText;

  return { budget, dispatch, status, dirty, saveNow };
}
