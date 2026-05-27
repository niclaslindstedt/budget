import type { UserData } from "../types";
import { ACHIEVEMENTS } from "./catalog";

// Pure: returns the IDs of derived-trigger achievements whose
// predicate flipped from false to true on this (prev → next)
// transition AND that aren't already in `alreadyUnlocked`. Manual
// triggers are skipped — they fire through the bus, not the
// state-watcher path.
//
// Predicates that declare a `slices` extractor (most do) are skipped
// when every listed slice is referentially unchanged — reducers keep
// identity on slices they didn't touch, so a sheet-only edit can't
// flip a history-only predicate. Cheap pre-check that avoids the
// full-data walks several predicates do.
export function deriveUnlocks(
  prev: UserData,
  next: UserData,
  alreadyUnlocked: Record<string, number>,
): string[] {
  const fresh: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (ach.trigger.kind !== "derived") continue;
    if (alreadyUnlocked[ach.id] !== undefined) continue;
    const trigger = ach.trigger;
    if (trigger.slices) {
      const prevSlices = trigger.slices(prev);
      const nextSlices = trigger.slices(next);
      let changed = false;
      for (let i = 0; i < prevSlices.length; i += 1) {
        if (prevSlices[i] !== nextSlices[i]) {
          changed = true;
          break;
        }
      }
      if (!changed) continue;
    }
    if (trigger.predicate(prev, next)) fresh.push(ach.id);
  }
  return fresh;
}
