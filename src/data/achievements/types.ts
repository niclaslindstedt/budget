import type { LucideIcon } from "lucide-react";

import type { UserData } from "../types";

// Four tiers that mirror the four stages of using Budget — from
// "just opened the app" to "bending it to your situation". Point
// values are uniform per tier so the catalog stays easy to balance
// as it grows.
export type AchievementTier = "beginner" | "intermediate" | "pro" | "expert";

export const TIER_POINTS: Record<AchievementTier, number> = {
  beginner: 10,
  intermediate: 25,
  pro: 50,
  expert: 100,
};

// Two kinds of unlock trigger:
//
// - `derived` — the achievement watcher receives every (prev, next)
//   state transition out of the reducer and runs each `predicate`.
//   When the predicate flips from false to true on this transition,
//   the unlock fires. The predicate sees the full pre- and post-
//   transition UserData, so it can spot "this user just got their
//   first row", "this user just made an entry recurring", etc.
//
// - `manual` — the trigger lives outside the reducer (cloud connect,
//   encryption toggle, language change, etc.). Callers fire the
//   unlock by calling `unlock(id)` from `src/data/achievements`; the
//   bus stores it until the watcher in AppShell is ready to
//   dispatch it through the reducer.
export type Trigger =
  | {
      kind: "derived";
      predicate: (prev: UserData, next: UserData) => boolean;
      // Optional slice extractor. When provided, `deriveUnlocks`
      // invokes the predicate only when at least one returned
      // reference differs between prev and next. Reducers preserve
      // referential identity on slices they didn't touch, so a cell-
      // edit dispatch (only `sheets` moves) skips every history /
      // transfer / settings predicate without running it. Each slice
      // listed must be one the predicate actually reads — otherwise
      // a relevant change would be silently filtered out.
      slices?: (state: UserData) => readonly unknown[];
    }
  | { kind: "manual" };

export type Achievement = {
  // Stable string id — once shipped, never renamed. Used as the
  // key inside `Settings.achievements` and the bus's pending queue,
  // as the React key in catalog renders, and as the path segment in
  // the i18n catalog (`achievements.catalog.<id>.{name,condition,
  // learnMore}`).
  id: string;
  tier: AchievementTier;
  glyph: LucideIcon;
  // Whether the i18n catalog carries a `learnMore` key for this id.
  // The expanded body is shown inside a per-achievement `<details>`;
  // not every achievement needs depth beyond the condition, so each
  // entry declares the presence here and the renderer reads through
  // it instead of probing the catalog at runtime.
  hasLearnMore?: boolean;
  trigger: Trigger;
};
