import type { Action } from "../reducer";
import type { UserData } from "../types";

export function reduceAchievements(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "recordAchievementUnlock") {
    // Idempotent: once an id is in `achievements`, a second call is a
    // no-op so timestamps don't drift. New ids land in both the
    // unlocked map (with the timestamp) and the unseen queue (so the
    // HeaderStar lights up).
    const existing = state.settings.achievements;
    if (existing[action.id] !== undefined) return state;
    const unseen = state.settings.unseenAchievements.includes(action.id)
      ? state.settings.unseenAchievements
      : [...state.settings.unseenAchievements, action.id];
    return {
      ...state,
      settings: {
        ...state.settings,
        achievements: { ...existing, [action.id]: action.timestamp },
        unseenAchievements: unseen,
      },
    };
  }
  if (action.type === "clearUnseenAchievements") {
    if (state.settings.unseenAchievements.length === 0) return state;
    return {
      ...state,
      settings: { ...state.settings, unseenAchievements: [] },
    };
  }
  return null;
}
