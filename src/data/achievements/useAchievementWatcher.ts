import { useEffect, useRef } from "react";

import type { Action } from "../reducer";
import type { UserData } from "../types";
import { drain, subscribe } from "./bus";
import { ACHIEVEMENT_BY_ID } from "./catalog";
import { deriveUnlocks } from "./derive";

// Mounted once inside AppShell. Two responsibilities:
//
// 1. After every state transition, run `deriveUnlocks(prev, next, …)`
//    and dispatch `recordAchievementUnlock` for each id the predicate
//    just flipped on. The first render is skipped (prev is null) so
//    loading a saved budget never fires backfill unlocks — only
//    deltas the user actively produces after the watcher is mounted
//    count. Matches the project's "forward-going only" policy.
//
// 2. Subscribe to the manual-unlock bus and drain queued ids on each
//    notification, dispatching them the same way. Lets callers
//    outside the AppShell subtree (App.tsx auth handlers,
//    useStorageBackend cloud connectors, anywhere) record an unlock
//    by invoking `unlock(id)` — no prop drilling, no context.
//
// Both passes are gated on `loaded`. Until the adapter swaps the
// `freshUserData()` placeholder for the persisted bucket, every
// derived predicate would compare against an empty baseline (firing
// any "did the user just acquire X" trigger for X the user already
// has) and every bus drain would check against an empty achievements
// map (treating every id as a fresh unlock). The dispatched unlocks
// then land in `unseenAchievements`, briefly lighting up the header
// star — until the load replaces state with the persisted snapshot
// and the star flips empty again. Holding both passes off until
// `loaded` flips true avoids the flicker entirely.
export function useAchievementWatcher(
  state: UserData,
  dispatch: React.Dispatch<Action>,
  loaded: boolean,
): void {
  const prevRef = useRef<UserData | null>(null);

  // Drain the manual-unlock bus. Re-runs whenever a manual `unlock()`
  // call arrives OR when the state changes (so the dispatched id
  // takes effect against the latest unlock map). Skipped until the
  // adapter has hydrated state from storage — see the header comment.
  useEffect(() => {
    if (!loaded) return;
    const consume = () => {
      const ids = drain();
      if (ids.length === 0) return;
      const ts = Date.now();
      for (const id of ids) {
        if (!ACHIEVEMENT_BY_ID.has(id)) continue;
        if (state.settings.achievements[id] !== undefined) continue;
        dispatch({ type: "recordAchievementUnlock", id, timestamp: ts });
      }
    };
    // Drain anything queued before the listener attached (e.g. an
    // unlock fired during an auth handler that ran before the
    // watcher mounted, or the InstallPrompt's standalone-mode unlock
    // that fires on every mount while the data is still loading).
    consume();
    const unsubscribe = subscribe(consume);
    return unsubscribe;
  }, [state.settings.achievements, dispatch, loaded]);

  // Run the derived-trigger pass on every state delta. Skipped until
  // the adapter has hydrated state from storage — see the header
  // comment. While loading, keep `prevRef` aligned with the current
  // (placeholder) state so the first post-load comparison treats the
  // hydrated snapshot as the baseline rather than the placeholder.
  useEffect(() => {
    if (!loaded) {
      prevRef.current = state;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = state;
    if (prev === null) return; // skip first render — see above
    if (prev === state) return; // identity unchanged → nothing happened
    const fresh = deriveUnlocks(prev, state, state.settings.achievements);
    if (fresh.length === 0) return;
    const ts = Date.now();
    for (const id of fresh) {
      dispatch({ type: "recordAchievementUnlock", id, timestamp: ts });
    }
  }, [state, dispatch, loaded]);
}
