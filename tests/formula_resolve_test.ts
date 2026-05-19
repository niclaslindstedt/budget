import { describe, expect, it } from "vitest";

import { resolveEffectiveAmounts } from "../src/data/formula-resolve";
import type {
  AccountBudget,
  Column,
  EntryType,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";

const dateCol: Column = { id: "d", type: "date", label: "Date" };
const descCol: Column = { id: "x", type: "description", label: "Desc" };
const amtCol: Column = { id: "a", type: "amount", label: "Amount" };
const columns: Column[] = [dateCol, descCol, amtCol];

function row(opts: {
  id: string;
  date: string;
  amount?: number;
  formula?: string;
  typeId?: string;
}): Row {
  const r: Row = {
    id: opts.id,
    cells: {
      [dateCol.id]: opts.date,
      [descCol.id]: "x",
      [amtCol.id]: opts.amount ?? 0,
    },
  };
  if (opts.formula) r.amountFormula = opts.formula;
  if (opts.typeId) r.typeId = opts.typeId;
  return r;
}

function budget(rows: Row[]): AccountBudget {
  return {
    id: "bud_a",
    type: "accountBudget",
    accountId: null,
    columns,
    rows,
  };
}

function workspace(
  item: AccountBudget,
  extra: Sheet[] = [],
  types: EntryType[] = [],
): UserData {
  const main: Sheet = {
    id: "sht_main",
    name: "Main",
    type: "budget",
    glyph: "wallet",
    color: "#000",
    description: "",
    items: [item],
  };
  return {
    version: 26,
    sheets: [main, ...extra],
    activeSheetId: "sht_main",
    accounts: [],
    categories: [],
    types,
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
    matchRules: [],
    seriesMatchRules: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    settings: {} as never,
  } as unknown as UserData;
}

describe("resolveEffectiveAmounts", () => {
  it("leaves literal rows untouched and resolves formula rows", () => {
    const rows = [
      row({ id: "r1", date: "2026-05-01", amount: 10000 }),
      row({ id: "r2", date: "2026-05-15", amount: -3000 }),
      row({
        id: "r3",
        date: "2026-05-31",
        formula: "endOfMonthBalance - 5000",
      }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item));
    // endOfMonthBalance excludes r3 itself = 0 + 10000 - 3000 = 7000.
    // r3 = 7000 - 5000 = 2000.
    expect(r.amounts.get("r1")).toBe(10000);
    expect(r.amounts.get("r2")).toBe(-3000);
    expect(r.amounts.get("r3")).toBe(2000);
    expect(r.errors.size).toBe(0);
  });

  it("balanceBefore reflects opening + earlier literal rows", () => {
    const rows = [
      row({ id: "r1", date: "2026-05-01", amount: 200 }),
      row({ id: "r2", date: "2026-05-10", formula: "balanceBefore" }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 100, workspace(item));
    expect(r.amounts.get("r2")).toBe(300);
  });

  it("aggregates per-category and per-type sums for the row's month", () => {
    // A row's category is derived through `row.typeId → EntryType.categoryId`.
    // We seed a type whose category is "groc" so categoryTotal("groc")
    // returns the sum of rows pointing at it.
    const grocType: EntryType = {
      id: "type-groc",
      name: "Groceries",
      color: "#e06c75",
      glyph: "utensils",
      categoryId: "groc",
    };
    const rows = [
      row({
        id: "r1",
        date: "2026-05-05",
        amount: -200,
        typeId: grocType.id,
      }),
      row({
        id: "r2",
        date: "2026-05-06",
        amount: -300,
        typeId: grocType.id,
      }),
      row({
        id: "r3",
        date: "2026-05-31",
        formula: 'categoryTotal("groc") + 1000',
      }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item, [], [grocType]));
    // categoryTotal("groc") = -500; formula = -500 + 1000 = 500.
    expect(r.amounts.get("r3")).toBe(500);
  });

  it("multiple formula rows resolve in source order; later formulas see earlier results", () => {
    const rows = [
      row({ id: "r1", date: "2026-05-01", amount: 1000 }),
      // First formula: endOfMonth excluding self = 1000 → result = 200.
      row({ id: "r2", date: "2026-05-20", formula: "endOfMonthBalance - 800" }),
      // Second formula evaluates *after* r2 is resolved.
      // endOfMonth excluding r3 = 1000 + 200 = 1200; formula = 1200 - 100 = 1100.
      row({ id: "r3", date: "2026-05-21", formula: "endOfMonthBalance - 100" }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item));
    expect(r.amounts.get("r2")).toBe(200);
    expect(r.amounts.get("r3")).toBe(1100);
  });

  it("cross-sheet sheet().endOfMonthBalance reads the referenced sheet's literal rows", () => {
    const wife: Sheet = {
      id: "sht_wife",
      name: "Wife",
      type: "budget",
      glyph: "wallet",
      color: "#000",
      description: "",
      items: [
        {
          id: "wife_bud",
          type: "accountBudget",
          accountId: null,
          columns,
          rows: [
            row({ id: "w1", date: "2026-05-10", amount: 3000 }),
            row({ id: "w2", date: "2026-05-25", amount: -1000 }),
          ],
        },
      ],
    };
    const rows = [
      row({
        id: "r1",
        date: "2026-05-30",
        formula: '5000 - sheet("sht_wife").endOfMonthBalance',
      }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item, [wife]));
    // Wife eom for May: 0 + 3000 - 1000 = 2000. Formula = 5000 - 2000 = 3000.
    expect(r.amounts.get("r1")).toBe(3000);
  });

  it("formulas referencing a sheet's formula rows see them as zero (v1 cycle avoidance)", () => {
    const wife: Sheet = {
      id: "sht_wife",
      name: "Wife",
      type: "budget",
      glyph: "wallet",
      color: "#000",
      description: "",
      items: [
        {
          id: "wife_bud",
          type: "accountBudget",
          accountId: null,
          columns,
          rows: [
            row({ id: "w1", date: "2026-05-10", amount: 3000 }),
            row({
              id: "w2",
              date: "2026-05-30",
              formula: "endOfMonthBalance",
            }),
          ],
        },
      ],
    };
    const rows = [
      row({
        id: "r1",
        date: "2026-05-30",
        formula: 'sheet("sht_wife").endOfMonthBalance',
      }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item, [wife]));
    // Only literal rows on wife sheet count for cross-sheet lookup:
    // eom = 3000 (w2 is skipped as a formula row).
    expect(r.amounts.get("r1")).toBe(3000);
  });

  it("records errors for bad formulas without breaking sibling rows", () => {
    const rows = [
      row({ id: "r1", date: "2026-05-01", amount: 1000 }),
      row({ id: "r2", date: "2026-05-15", formula: "this is garbage" }),
      row({
        id: "r3",
        date: "2026-05-20",
        formula: "endOfMonthBalance + 100",
      }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item));
    expect(r.errors.has("r2")).toBe(true);
    // Broken row contributes 0; r3 still resolves: eom excluding r3 = 1000 + 0.
    expect(r.amounts.get("r3")).toBe(1100);
  });
});
