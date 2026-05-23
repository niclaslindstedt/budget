// In-memory pub/sub for manual achievement unlocks.
//
// Most achievements derive from a reducer state transition and never
// touch this file. The remainder — cloud connect, encryption toggle,
// JSON export, account create, etc. — fire from outside the reducer.
// Those callers invoke `unlock(id)`, which queues the id here; the
// watcher mounted in BudgetView subscribes, drains the queue on each
// notification, and dispatches `recordAchievementUnlock` so the
// usual reducer path persists them. The queue survives
// across-component-tree dispatches but does NOT persist across page
// reloads — manual unlocks must be fired by a still-mounted React
// surface that observes the user's action.
//
// Why an in-memory bus instead of a context? Because callers like
// `useStorageBackend` and `App.tsx` run before — and outside the
// subtree of — BudgetView, where the dispatch lives. A bus
// decouples timing: anyone can unlock at any moment; the watcher
// catches up when it's ready.

const pending = new Set<string>();
const listeners = new Set<() => void>();

export function unlock(id: string): void {
  if (id === "") return;
  if (pending.has(id)) return;
  pending.add(id);
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Called by the watcher to consume queued ids in one shot. Returns
// the snapshot and empties the queue. Avoids the listener-during-
// dispatch race by handing back a stable array.
export function drain(): string[] {
  if (pending.size === 0) return [];
  const ids = [...pending];
  pending.clear();
  return ids;
}

// Test-only escape hatch. The achievement watcher is a singleton in
// the running app; tests instantiate fresh `useUserDataStorage`s and
// would otherwise see leftover ids from prior cases.
export function resetBus(): void {
  pending.clear();
  listeners.clear();
}
