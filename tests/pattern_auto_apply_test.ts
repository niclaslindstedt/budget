import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { countRuleHitsOnSheets } from "../src/data/budget/pattern-apply";
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
    version: 45,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: "checking-id", name: "Checking" }],
    companies: [],
    tags: [],
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
    transfers: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules,
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

  it("retroactively types existing rows when a new rule is created", () => {
    // Row exists FIRST with a description, then the user creates a
    // matching rule. The row should pick up the rule's type without
    // requiring a second cell edit.
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      makeRow({ [descId]: "ICA KVANTUM" }),
      makeRow({ [descId]: "RANDOM MERCHANT" }),
    ];
    state = reducer(state, {
      type: "createMatchRule",
      rule: {
        id: "rule-grocery",
        pattern: "*ICA*",
        typeId: "type-grocery",
      },
    });
    const rows = (state.sheets[0].items[0] as AccountBudget).rows;
    expect(rows[0].typeId).toBe("type-grocery");
    expect(rows[0].typeIdLocked).toBeUndefined();
    expect(rows[1].typeId).toBeUndefined();
  });

  it("retroactively re-types existing rows when a rule is updated", () => {
    // Row exists with description, rule already typed it grocery;
    // editing the rule's typeId should immediately re-label the row.
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      { ...makeRow({ [descId]: "ICA KVANTUM" }), typeId: "type-grocery" },
    ];
    state.matchRules = [
      { id: "rule-grocery", pattern: "*ICA*", typeId: "type-grocery" },
    ];
    // Re-point the rule at a different type.
    state = reducer(state, {
      type: "updateMatchRule",
      rule: { id: "rule-grocery", pattern: "*ICA*", typeId: "type-rent" },
    });
    expect(firstRow(state).typeId).toBe("type-rent");
  });

  it("does not overwrite locked rows when a rule is created", () => {
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      {
        ...makeRow({ [descId]: "ICA KVANTUM" }),
        typeId: "type-rent",
        typeIdLocked: true,
      },
    ];
    state = reducer(state, {
      type: "createMatchRule",
      rule: {
        id: "rule-grocery",
        pattern: "*ICA*",
        typeId: "type-grocery",
      },
    });
    expect(firstRow(state).typeId).toBe("type-rent");
    expect(firstRow(state).typeIdLocked).toBe(true);
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

  it("preserves an existing typeId when an edited description matches no rule", () => {
    // Row pre-dates the patterns feature: it has a hand-set typeId
    // but no `typeIdLocked` (migrated rows are unlocked). Editing
    // its description to something no rule matches must NOT strip
    // the type — patterns are additive only.
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      { ...makeRow({ [descId]: "OLD LABEL" }), typeId: "type-rent" },
    ];
    state.matchRules = [
      { id: "rule-grocery", pattern: "*ICA*", typeId: "type-grocery" },
    ];
    const rowId = firstRow(state).id;
    state = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: state.sheets[0].items[0].id,
      rowId,
      columnId: descId,
      value: "RANDOM MERCHANT",
    });
    expect(firstRow(state).typeId).toBe("type-rent");
  });
});

describe("reapplyMatchRules action", () => {
  it("re-evaluates every budget row against the current ruleset", () => {
    // Mid-state: rule exists and a matching row sits with a stale
    // (cleared) typeId. The reapply dispatch should re-label it.
    let state = workspace(
      [],
      [{ id: "rule-grocery", pattern: "*ICA*", typeId: "type-grocery" }],
    );
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      makeRow({ [descId]: "ICA KVANTUM" }),
    ];
    expect(firstRow(state).typeId).toBeUndefined();
    state = reducer(state, { type: "reapplyMatchRules" });
    expect(firstRow(state).typeId).toBe("type-grocery");
  });

  it("returns the same state when no row would change", () => {
    let state = workspace(
      [],
      [{ id: "rule-grocery", pattern: "*ICA*", typeId: "type-grocery" }],
    );
    const before = state;
    state = reducer(state, { type: "reapplyMatchRules" });
    expect(state).toBe(before);
  });

  it("preserves an unlocked row's typeId when no rule matches it", () => {
    // The smoking-gun case from the user's logs: a recurring entry
    // created before the patterns feature existed carries an
    // unlocked typeId; the user's ruleset (shaped for long
    // bank-export descriptions) wins on no recurring row. Reapply
    // must leave the existing types intact.
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      { ...makeRow({ [descId]: "Lön" }), typeId: "type-rent" },
      { ...makeRow({ [descId]: "Agilator" }), typeId: "type-grocery" },
    ];
    state.matchRules = [
      {
        id: "rule-apple",
        pattern: "*APPLE.COM/BILL*",
        typeId: "type-grocery",
      },
    ];
    state = reducer(state, { type: "reapplyMatchRules" });
    const rows = (state.sheets[0].items[0] as AccountBudget).rows;
    expect(rows[0].typeId).toBe("type-rent");
    expect(rows[1].typeId).toBe("type-grocery");
  });

  it("preserves an unlocked typeId when its rule's pattern is narrowed away", () => {
    // Row was previously labeled by rule-grocery; the user narrows
    // the rule's pattern so it no longer matches "ICA KVANTUM".
    // Pre-fix, updateMatchRule's re-evaluation would strip the
    // typeId. Post-fix, the row keeps its rule-assigned type until
    // the user clears it by hand.
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      { ...makeRow({ [descId]: "ICA KVANTUM" }), typeId: "type-grocery" },
    ];
    state.matchRules = [
      { id: "rule-grocery", pattern: "*ICA*", typeId: "type-grocery" },
    ];
    state = reducer(state, {
      type: "updateMatchRule",
      rule: {
        id: "rule-grocery",
        pattern: "*COOP*",
        typeId: "type-grocery",
      },
    });
    expect(firstRow(state).typeId).toBe("type-grocery");
  });

  it("preserves an unlocked typeId when a brand-new rule doesn't catch it", () => {
    // Creating a fresh rule must not strip types off rows the new
    // rule doesn't happen to match — that's the regression that
    // surfaced when the user added a *LOOPIA AB, VÄSTERÅS* rule.
    let state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      { ...makeRow({ [descId]: "Fortum" }), typeId: "type-rent" },
    ];
    state = reducer(state, {
      type: "createMatchRule",
      rule: {
        id: "rule-loopia",
        pattern: "*LOOPIA AB, VÄSTERÅS*",
        typeId: "type-grocery",
      },
    });
    expect(firstRow(state).typeId).toBe("type-rent");
  });
});

describe("countRuleHitsOnSheets", () => {
  it("attributes each row to its first-matching rule and skips locked rows", () => {
    const state = workspace();
    const descId = descColumnId(state);
    (state.sheets[0].items[0] as AccountBudget).rows = [
      makeRow({ [descId]: "ICA KVANTUM" }),
      makeRow({ [descId]: "ICA NORDSTAN" }),
      // Locked: should NOT count toward any rule's hit total even
      // though its description matches the grocery pattern.
      {
        ...makeRow({ [descId]: "ICA MAXI" }),
        typeId: "type-rent",
        typeIdLocked: true,
      },
      makeRow({ [descId]: "RANDOM MERCHANT" }),
    ];
    state.matchRules = [
      { id: "rule-grocery", pattern: "*ICA*", typeId: "type-grocery" },
      { id: "rule-other", pattern: "*COFFEE*", typeId: "type-rent" },
    ];
    const counts = countRuleHitsOnSheets(state.sheets, state.matchRules);
    expect(counts.get("rule-grocery")).toBe(2);
    expect(counts.get("rule-other")).toBe(0);
  });

  it("returns an empty map when there are no rules", () => {
    const state = workspace();
    const counts = countRuleHitsOnSheets(state.sheets, []);
    expect(counts.size).toBe(0);
  });

  it("counts synthesized history rows alongside explicit budget rows", () => {
    const state = workspace();
    state.matchRules = [
      { id: "rule-apple", pattern: "*APPLE.COM/BILL*", typeId: "type-rent" },
    ];
    state.history = {
      "checking-id": [
        {
          id: "h1",
          date: "2024-07-16",
          description: "APPLE.COM/BILL 020100",
          amount: -39,
        },
        {
          id: "h2",
          date: "2024-08-15",
          description: "APPLE.COM/BILL ITUNES",
          amount: -39,
        },
        // Hidden: should not count.
        {
          id: "h3",
          date: "2024-09-15",
          description: "APPLE.COM/BILL 020100",
          amount: -39,
          hidden: true,
        },
        // Split: rule labels don't apply to splits.
        {
          id: "h4",
          date: "2024-10-15",
          description: "APPLE.COM/BILL 020100",
          amount: -39,
          splits: [
            { description: "iCloud", amount: -19 },
            { description: "Apple Music", amount: -20 },
          ],
        },
        // Non-matching: should not count.
        {
          id: "h5",
          date: "2024-11-15",
          description: "RANDOM MERCHANT",
          amount: -39,
        },
      ],
    };
    const counts = countRuleHitsOnSheets(
      state.sheets,
      state.matchRules,
      state.history,
    );
    expect(counts.get("rule-apple")).toBe(2);
  });
});
