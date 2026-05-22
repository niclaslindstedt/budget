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
//   bus stores it until the watcher in BudgetView is ready to
//   dispatch it through the reducer.
export type Trigger =
  | { kind: "derived"; predicate: (prev: UserData, next: UserData) => boolean }
  | { kind: "manual" };

export type Achievement = {
  // Stable string id — once shipped, never renamed. Used as the
  // key inside `Settings.achievements` and the bus's pending queue,
  // and as the React key in catalog renders.
  id: string;
  tier: AchievementTier;
  glyph: LucideIcon;
  // Playful, game-style name. Bolded on the achievements page and
  // shown verbatim in the unlock modal.
  name: string;
  // Descriptive condition, in the user's voice. Reads as the answer
  // to "how do I unlock this?".
  condition: string;
  // Optional expanded body shown inside the per-achievement
  // `<details>` on the achievements page — same shape as the
  // SystemPage's Learn-more pattern, but optional here because not
  // every achievement needs depth beyond the condition.
  learnMore?: string;
  trigger: Trigger;
};
