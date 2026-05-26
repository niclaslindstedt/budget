import { applyDeviceSettingPatch, applySettingsDraft } from "../settings";
import type { Action } from "../reducer";
import type { CommonSettings, UserData } from "../types";

export function reduceSettings(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "updateSettings") {
    // Achievements and the unseen queue have their own dispatch path
    // (`recordAchievementUnlock` / `clearUnseenAchievements`). Preserve
    // them across a settings replacement so a concurrent unlock that
    // landed in the reducer between the caller capturing `settings`
    // and the dispatch firing isn't silently overwritten. This applies
    // to the SettingsModal save (whose draft was seeded from `settings`
    // on open) and to `useChangelogAutoOpen`, which captures
    // `settingsRef.current` on mount before the achievement-watcher
    // gets a chance to drain its bus.
    //
    // `applySettingsDraft` splits the flat editing surface back into
    // the bucketed `PersistedSettings` shape: common keys land at the
    // top level; device-scoped keys land in the scope the user edited
    // from, leaving the opposite scope untouched.
    const split = applySettingsDraft(
      state.settings,
      action.scope,
      action.draft,
    );
    return {
      ...state,
      settings: {
        ...split,
        achievements: state.settings.achievements,
        unseenAchievements: state.settings.unseenAchievements,
      },
    };
  }
  if (action.type === "updateDeviceSettings") {
    return {
      ...state,
      settings: applyDeviceSettingPatch(
        state.settings,
        action.scope,
        action.patch,
      ),
    };
  }
  if (action.type === "updateCommonSettings") {
    // Defensive: never let a common-scope patch clobber the
    // achievement state (which has its own dispatch path) or the
    // device bucket. Stripping the keys here is cheaper than relying
    // on every caller to remember the contract.
    const patch = action.patch as Partial<CommonSettings> & {
      achievements?: unknown;
      unseenAchievements?: unknown;
    };
    const allowed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === "achievements" || key === "unseenAchievements") continue;
      allowed[key] = value;
    }
    return {
      ...state,
      settings: { ...state.settings, ...allowed },
    };
  }
  return null;
}
