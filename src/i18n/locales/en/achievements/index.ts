import type { Widen } from "../_widen";
import catalog from "./catalog";
import shell from "./shell";

// Composed achievements namespace. `shell` covers the star button,
// unlock toast, and four-tier guided tour; `catalog` carries the
// per-achievement strings. Splitting reads so an agent adding a new
// achievement opens one ~350-line file instead of scrolling past the
// chrome.

const achievements = {
  ...shell,
  catalog,
} as const;

export type AchievementsCatalog = Widen<typeof achievements>;

export default achievements;
