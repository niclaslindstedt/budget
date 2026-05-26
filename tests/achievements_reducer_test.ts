import { describe, expect, it } from "vitest";

import {
  DEFAULT_PERSISTED_SETTINGS,
  DEFAULT_SETTINGS,
} from "../src/data/constants";
import { reducer } from "../src/data/reducer";
import type { UserData } from "../src/data/types";

function baseState(): UserData {
  return {
    version: 44,
    sheets: [
      {
        id: "s",
        name: "S",
        type: "budget",
        glyph: "wallet",
        color: "var(--color-blue)",
        description: "",
        items: [
          {
            id: "ab",
            type: "accountBudget",
            accountId: null,
            columns: [],
            rows: [],
          },
        ],
      },
    ],
    activeSheetId: "s",
    accounts: [],
    companies: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
  };
}

describe("recordAchievementUnlock", () => {
  it("adds id to achievements and unseenAchievements", () => {
    const next = reducer(baseState(), {
      type: "recordAchievementUnlock",
      id: "firstSteps",
      timestamp: 12345,
    });
    expect(next.settings.achievements).toEqual({ firstSteps: 12345 });
    expect(next.settings.unseenAchievements).toEqual(["firstSteps"]);
  });

  it("is idempotent for already-unlocked ids", () => {
    const a = reducer(baseState(), {
      type: "recordAchievementUnlock",
      id: "firstSteps",
      timestamp: 100,
    });
    const b = reducer(a, {
      type: "recordAchievementUnlock",
      id: "firstSteps",
      timestamp: 200,
    });
    expect(b).toBe(a);
    expect(b.settings.achievements.firstSteps).toBe(100);
  });

  it("queues multiple unlocks in order", () => {
    const a = reducer(baseState(), {
      type: "recordAchievementUnlock",
      id: "firstSteps",
      timestamp: 1,
    });
    const b = reducer(a, {
      type: "recordAchievementUnlock",
      id: "label",
      timestamp: 2,
    });
    expect(b.settings.unseenAchievements).toEqual(["firstSteps", "label"]);
  });
});

describe("updateSettings preserves achievement fields", () => {
  // Regression: `updateSettings` used to do a full settings replacement,
  // so a caller dispatching with a stale `settings` blob (e.g.
  // `useChangelogAutoOpen`'s settingsRef captured on mount) wiped any
  // achievement unlocks that landed in the reducer between the capture
  // and the dispatch.
  it("does not overwrite achievements with a stale settings payload", () => {
    const unlocked = reducer(baseState(), {
      type: "recordAchievementUnlock",
      id: "localHero",
      timestamp: 42,
    });
    expect(unlocked.settings.achievements).toEqual({ localHero: 42 });

    const stale = reducer(unlocked, {
      type: "updateSettings",
      // Caller captured `draft` before the unlock landed — uses
      // the default (empty) achievement maps as its payload.
      draft: { ...DEFAULT_SETTINGS, lastSeenChangelogVersion: "0.1.0" },
      scope: "desktop",
    });
    expect(stale.settings.achievements).toEqual({ localHero: 42 });
    expect(stale.settings.unseenAchievements).toEqual(["localHero"]);
    // The non-achievement fields still flow through.
    expect(stale.settings.lastSeenChangelogVersion).toBe("0.1.0");
  });
});

describe("clearUnseenAchievements", () => {
  it("empties the queue but keeps the unlocked map", () => {
    const a = reducer(baseState(), {
      type: "recordAchievementUnlock",
      id: "firstSteps",
      timestamp: 1,
    });
    const b = reducer(a, { type: "clearUnseenAchievements" });
    expect(b.settings.unseenAchievements).toEqual([]);
    expect(b.settings.achievements).toEqual({ firstSteps: 1 });
  });

  it("is a no-op when the queue is already empty", () => {
    const s = baseState();
    const next = reducer(s, { type: "clearUnseenAchievements" });
    expect(next).toBe(s);
  });
});
