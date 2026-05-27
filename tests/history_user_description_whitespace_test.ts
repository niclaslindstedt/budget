import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, HistoryEntry, UserData } from "../src/data/types";

function workspaceWithHistoryEntry(entry: HistoryEntry): UserData {
  const sheet = createDefaultSheet("Budget", "acct1");
  const item = sheet.items[0] as AccountBudget;
  item.rows = [];
  return {
    version: 40,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: "acct1", name: "Checking" }],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: { acct1: [entry] },
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
  };
}

describe("updateHistoryEntry preserves typed whitespace", () => {
  const baseEntry: HistoryEntry = {
    id: "ent1",
    date: "2026-05-25",
    description: "StockholmGas",
    amount: -442,
    importedAt: 0,
  };

  it("keeps a trailing space the user typed in userDescription", () => {
    const state = workspaceWithHistoryEntry(baseEntry);
    const next = reducer(state, {
      type: "updateHistoryEntry",
      accountId: "acct1",
      entryId: "ent1",
      patch: { userDescription: "StockholmGas " },
    });
    expect(next.history.acct1[0].userDescription).toBe("StockholmGas ");
  });

  it("still clears userDescription when the patch is whitespace-only", () => {
    const state = workspaceWithHistoryEntry({
      ...baseEntry,
      userDescription: "Stockholm Gas",
    });
    const next = reducer(state, {
      type: "updateHistoryEntry",
      accountId: "acct1",
      entryId: "ent1",
      patch: { userDescription: "   " },
    });
    expect(next.history.acct1[0].userDescription).toBeUndefined();
  });
});
