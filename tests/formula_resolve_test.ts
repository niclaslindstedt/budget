import { describe, expect, it } from "vitest";

import { resolveEffectiveAmounts } from "../src/data/budget/formula-resolve";
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
    kind: "user",
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
    version: 50,
    sheets: [main, ...extra],
    activeSheetId: "sht_main",
    accounts: [],
    companies: [],
    tags: [],
    categories: [],
    types,
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    transfers: [],
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

  // The cached aggregates have to cascade an earlier formula's
  // resolved value forward to every later month's openingBalance —
  // otherwise a formula in May that reads `prevMonth.endingBalance`
  // wouldn't see April's resolved formula.
  it("cross-month cascade: April formula feeds May prevMonth.endingBalance", () => {
    const rows = [
      row({ id: "r1", date: "2026-04-01", amount: 1000 }),
      row({
        id: "r2",
        date: "2026-04-30",
        formula: "endOfMonthBalance - 200",
      }),
      row({
        id: "r3",
        date: "2026-05-15",
        formula: "prevMonth.endingBalance",
      }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 100, workspace(item));
    // April: opening=100, literal=1000 → eom-excluding-r2 = 1100;
    // r2 = 1100 - 200 = 900. April net = 1000 + 900 = 1900.
    // May prevMonth.endingBalance = April opening + net = 100 + 1900 = 2000.
    expect(r.amounts.get("r2")).toBe(900);
    expect(r.amounts.get("r3")).toBe(2000);
  });

  // The precompute path needs the sortContext-aware running balance
  // (income before expense on the same day) to match the legacy walk.
  it("balanceBefore respects same-day income-first ordering", () => {
    const rows = [
      // Same date — sortContext puts income before expense.
      row({ id: "r1", date: "2026-05-10", amount: -300 }),
      row({ id: "r2", date: "2026-05-10", amount: 500 }),
      row({ id: "r3", date: "2026-05-11", formula: "balanceBefore" }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 100, workspace(item));
    // r3 sits after both same-day rows in sorted order, so
    // balanceBefore = 100 + 500 - 300 = 300.
    expect(r.amounts.get("r3")).toBe(300);
  });

  // Multiple formulas in the same month — the cache has to feed each
  // subsequent formula's thisMonth its predecessor's resolved value.
  it("two formulas in the same month: second sees first via thisMonth.net", () => {
    const rows = [
      row({ id: "r1", date: "2026-05-01", amount: 1000 }),
      row({ id: "r2", date: "2026-05-20", formula: "net + 100" }),
      row({ id: "r3", date: "2026-05-25", formula: "net + 50" }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item));
    // r2: net excluding r2 = 1000 → r2 = 1100. After resolve, May
    // net = 1000 + 1100 = 2100. r3: net excluding r3 = 2100 → r3 = 2150.
    expect(r.amounts.get("r2")).toBe(1100);
    expect(r.amounts.get("r3")).toBe(2150);
  });

  // Earlier-in-source / later-in-sort formula: the second formula's
  // balanceBefore prefix must add the first formula's resolved value
  // even though the first formula sorts *after* the second.
  it("balanceBefore correction picks up earlier-source resolutions", () => {
    const grocType: EntryType = {
      id: "type-groc",
      name: "Groceries",
      color: "#e06c75",
      glyph: "utensils",
      categoryId: "groc",
    };
    const rows = [
      // r1 is the first formula in source order but sorts before r2
      // because they share a date and r2 is the absolute-amount tie
      // breaker (r1 has the smaller magnitude).
      row({
        id: "r1",
        date: "2026-05-10",
        amount: 50,
        formula: "100",
        typeId: grocType.id,
      }),
      row({
        id: "r2",
        date: "2026-05-10",
        amount: 200,
        typeId: grocType.id,
      }),
      row({ id: "r3", date: "2026-05-20", formula: "balanceBefore" }),
    ];
    const item = budget(rows);
    const r = resolveEffectiveAmounts(item, 0, workspace(item, [], [grocType]));
    // r1 resolves to 100, r2 literal 200. r3 sits after both in sort
    // order → balanceBefore = 0 + 100 + 200 = 300.
    expect(r.amounts.get("r1")).toBe(100);
    expect(r.amounts.get("r3")).toBe(300);
  });

  // Scale check: 5000 history-like literal rows + 25 formulas resolves
  // well under a second. With the old O(F × N log N) walk this took
  // multiple seconds on the same hardware.
  it("resolves a 5000-row budget with 25 formulas in well under a second", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 5000; i += 1) {
      const month = String((i % 12) + 1).padStart(2, "0");
      const day = String((i % 27) + 1).padStart(2, "0");
      rows.push(
        row({
          id: `lit_${i}`,
          date: `2025-${month}-${day}`,
          amount: i % 2 === 0 ? 100 : -50,
        }),
      );
    }
    for (let i = 0; i < 25; i += 1) {
      const month = String((i % 12) + 1).padStart(2, "0");
      rows.push(
        row({
          id: `f_${i}`,
          date: `2025-${month}-28`,
          formula: "endOfMonthBalance - 10",
        }),
      );
    }
    const item = budget(rows);
    const t0 = performance.now();
    const r = resolveEffectiveAmounts(item, 0, workspace(item));
    const elapsed = performance.now() - t0;
    expect(r.errors.size).toBe(0);
    expect(elapsed).toBeLessThan(250);
  });
});
