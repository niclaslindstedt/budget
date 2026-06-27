import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type {
  AccountBudget,
  HistoryEntry,
  Row,
  UserData,
} from "../src/data/types";

function workspace(rows: Row[], entry?: HistoryEntry): UserData {
  const sheet = createDefaultSheet("Budget", "acct1");
  const item = sheet.items[0] as AccountBudget;
  item.rows = rows;
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
    history: entry ? { acct1: [entry] } : {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    seriesMetadata: {},
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
  };
}

describe("toggleRowIgnored", () => {
  it("sets and clears the ignored flag on a user row", () => {
    const row: Row = { kind: "user", id: "r1", cells: {} };
    const state = workspace([row]);
    const sheetId = state.sheets[0].id;
    const itemId = (state.sheets[0].items[0] as AccountBudget).id;

    const on = reducer(state, {
      type: "toggleRowIgnored",
      sheetId,
      itemId,
      rowId: "r1",
    });
    expect((on.sheets[0].items[0] as AccountBudget).rows[0].ignored).toBe(true);

    const off = reducer(on, {
      type: "toggleRowIgnored",
      sheetId,
      itemId,
      rowId: "r1",
    });
    // Cleared, not stored as false.
    expect(
      (off.sheets[0].items[0] as AccountBudget).rows[0].ignored,
    ).toBeUndefined();
  });

  it("flips the flag on the backing HistoryEntry via updateHistoryEntry", () => {
    const entry: HistoryEntry = {
      id: "ent1",
      date: "2026-05-25",
      description: "Spotify",
      amount: -119,
      importedAt: 0,
    };
    const state = workspace([], entry);

    const on = reducer(state, {
      type: "updateHistoryEntry",
      accountId: "acct1",
      entryId: "ent1",
      patch: { ignored: true },
    });
    expect(on.history.acct1[0].ignored).toBe(true);

    const off = reducer(on, {
      type: "updateHistoryEntry",
      accountId: "acct1",
      entryId: "ent1",
      patch: { ignored: false },
    });
    expect(off.history.acct1[0].ignored).toBeUndefined();
  });
});
