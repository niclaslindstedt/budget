import type { UserData } from "../types";
import { ACHIEVEMENTS } from "./catalog";

// Pure: returns the IDs of derived-trigger achievements whose
// predicate flipped from false to true on this (prev → next)
// transition AND that aren't already in `alreadyUnlocked`. Manual
// triggers are skipped — they fire through the bus, not the
// state-watcher path.
export function deriveUnlocks(
  prev: UserData,
  next: UserData,
  alreadyUnlocked: Record<string, number>,
): string[] {
  const fresh: string[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (ach.trigger.kind !== "derived") continue;
    if (alreadyUnlocked[ach.id] !== undefined) continue;
    if (ach.trigger.predicate(prev, next)) fresh.push(ach.id);
  }
  return fresh;
}
