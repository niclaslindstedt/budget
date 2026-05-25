import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet, findColumnByType, newId } from "../src/data/sheet";
import type {
  AccountBudget,
  MatchRule,
  Row,
  UserData,
} from "../src/data/types";

function workspace(rows: Row[] = [], matchRules: MatchRule[] = []): UserData {
  const sheet = createDefaultSheet("Budget", "checking-id");
  const item = sheet.items[0] as AccountBudget;
  item.rows = rows;
  return {
    version: 39,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: "checking-id", name: "Checking" }],
    categories: [],
    types: [
      {
        id: "type-grocery",
        name: "Groceries",
        color: "#98c379",
        glyph: "shopping-cart",
        categoryId: "preset-cat-food",
      },
      {
        id: "type-rent",
        name: "Rent",
        color: "#d19a66",
        glyph: "home",
        categoryId: "preset-cat-housing",
      },
    ],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules,
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

function descColumnId(state: UserData): string {
  const item = state.sheets[0].items[0] as AccountBudget;
  return findColumnByType(item.columns, "description")!.id;
}

function typeColumnId(state: UserData): string {
  const item = state.sheets[0].items[0] as AccountBudget;
  return findColumnByType(item.columns, "type")!.id;
}

function firstRow(state: UserData): Row {
  return (state.sheets[0].items[0] as AccountBudget).rows[0];
}

function makeRow(cells: Record<string, unknown>): Row {
  return { id: newId(), cells: cells as Row["cells"] };
}

describe("pattern auto-apply on description commit", () => {
  it("sets typeId from a matching rule when description is edited", () => {
    let state = workspace(
      [makeRow({})],
      [
        {
          id: "rule-grocery",
          pattern: "*ICA*",
          typeId: "type-grocery",
        },
      ],
    );
    const descId = descColumnId(state);
    const rowId = firstRow(state).id;
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: descId,
      value: "ICA KVANTUM",
    });
    expect(firstRow(state).typeId).toBe("type-grocery");
    expect(firstRow(state).typeIdLocked).toBeUndefined();
  });

  it("respects amount-sign filters on rules", () => {
    let state = workspace(
      [makeRow({})],
      [
        {
          id: "rule-income",
          pattern: "*SALARY*",
          typeId: "type-rent",
          amountSign: "positive",
        },
      ],
    );
    const descId = descColumnId(state);
    const amountId = findColumnByType(
      (state.sheets[0].items[0] as AccountBudget).columns,
      "amount",
    )!.id;
    const rowId = firstRow(state).id;
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: amountId,
      value: -100,
    });
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: descId,
      value: "MY SALARY",
    });
    expect(firstRow(state).typeId).toBeUndefined();
  });

  it("does not overwrite a manually-locked typeId on later description edits", () => {
    let state = workspace(
      [makeRow({})],
      [
        {
          id: "rule-grocery",
          pattern: "*ICA*",
          typeId: "type-grocery",
        },
      ],
    );
    const descId = descColumnId(state);
    const typeId = typeColumnId(state);
    const rowId = firstRow(state).id;
    // User picks "Rent" by hand first — should lock the row.
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: typeId,
      value: "type-rent",
    });
    expect(firstRow(state).typeIdLocked).toBe(true);
    // Now typing a description that would otherwise match the
    // grocery rule must not overwrite the rent type.
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: descId,
      value: "ICA KVANTUM",
    });
    expect(firstRow(state).typeId).toBe("type-rent");
  });

  it("clears the lock when the user clears the type", () => {
    let state = workspace(
      [makeRow({})],
      [
        {
          id: "rule-grocery",
          pattern: "*ICA*",
          typeId: "type-grocery",
        },
      ],
    );
    const descId = descColumnId(state);
    const typeId = typeColumnId(state);
    const rowId = firstRow(state).id;
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: typeId,
      value: "type-rent",
    });
    expect(firstRow(state).typeIdLocked).toBe(true);
    // Clear the type → lock should drop so the next description
    // commit re-engages pattern matching.
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: typeId,
      value: "",
    });
    expect(firstRow(state).typeId).toBeUndefined();
    expect(firstRow(state).typeIdLocked).toBeUndefined();
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: descId,
      value: "ICA KVANTUM",
    });
    expect(firstRow(state).typeId).toBe("type-grocery");
  });

  it("falls back to no type when no rule matches", () => {
    let state = workspace(
      [makeRow({})],
      [
        {
          id: "rule-grocery",
          pattern: "*ICA*",
          typeId: "type-grocery",
        },
      ],
    );
    const descId = descColumnId(state);
    const rowId = firstRow(state).id;
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: descId,
      value: "RANDOM MERCHANT",
    });
    expect(firstRow(state).typeId).toBeUndefined();
  });
});
