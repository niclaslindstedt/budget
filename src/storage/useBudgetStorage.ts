import {
  type Dispatch,
  type Reducer,
  useCallback,
  useEffect,
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

export type BudgetStorage<Action> = {
  budget: Budget;
  dispatch: Dispatch<Action>;
  status: SaveStatus;
};

export function useBudgetStorage<Action>(
  adapter: StorageAdapter,
  reducer: Reducer<Budget, Action>,
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

  const dispatch: Dispatch<Action> = useCallback(
    (action) => {
      setBudget((prev) => reducer(prev, action));
    },
    [reducer],
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
      void runSave();
    }, delay);

    async function runSave() {
      if (cancelled) return;
      setStatus({ kind: "saving" });
      const text = serializeBudget(budget);
      try {
        const next = await adapter.save(text, lastSnapshot.current?.revision);
        if (cancelled) return;
        lastSnapshot.current = next;
        setStatus({ kind: "saved", at: Date.now() });
      } catch (err) {
        if (cancelled) return;
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
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [adapter, budget]);

  // Remote-change subscription. Cloud adapters call this when
  // another device pushes; local adapters typically don't supply it.
  useEffect(() => {
    if (!adapter.watch) return;
    return adapter.watch((snap) => {
      lastSnapshot.current = snap;
      skipNextSave.current = true;
      setBudget(readBudgetFromText(snap.text));
      setStatus({ kind: "idle" });
    });
  }, [adapter]);

  return { budget, dispatch, status };
}
