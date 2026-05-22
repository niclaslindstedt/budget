import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import { reducer } from "../src/data/reducer";
import type { UserData } from "../src/data/types";

function baseState(): UserData {
  return {
    version: 33,
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
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    settings: { ...DEFAULT_SETTINGS },
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
