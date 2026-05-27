import { describe, expect, it } from "vitest";

import {
  buildBudgetExportRows,
  exportRowsToTable,
  rowsToCsv,
} from "../src/data/budget/export";
import { computeBalances } from "../src/data/budget/rows";
import {
  createDefaultAccountBudget,
  findColumnByType,
} from "../src/data/sheet";
import type {
  AccountBudget,
  Category,
  EntryType,
  HistoryEntry,
  Row,
  Transfer,
} from "../src/data/types";

const TODAY = "2026-05-20";

function findCol(item: AccountBudget, type: "date" | "description" | "amount") {
  const col = findColumnByType(item.columns, type);
  if (!col) throw new Error(`Column ${type} not found`);
  return col.id;
}

function buildItem(
  accountId: string | null,
  entries: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    typeId?: string;
  }>,
): AccountBudget {
  const item = createDefaultAccountBudget(accountId);
  const dateId = findCol(item, "date");
  const descId = findCol(item, "description");
  const amountId = findCol(item, "amount");
  const rows: Row[] = entries.map((e) => {
    const row: Row = {
      id: e.id,
      cells: {
        [dateId]: e.date,
        [descId]: e.description,
        [amountId]: e.amount,
      },
    };
    if (e.typeId) row.typeId = e.typeId;
    return row;
  });
  return { ...item, rows };
}

const baseArgs = {
  openingBalance: 0,
  history: [] as readonly HistoryEntry[],
  transfers: [] as readonly Transfer[],
  accountsById: new Map<string, string>(),
  types: [] as readonly EntryType[],
  categories: [] as readonly Category[],
  merchantHints: {},
  matchRules: [],
  today: TODAY,
};

describe("buildBudgetExportRows", () => {
  it("emits future-only rows when history is excluded", () => {
    const item = buildItem("acct-1", [
      { id: "past", date: "2026-04-01", description: "Old", amount: -100 },
      { id: "future", date: "2026-06-01", description: "New", amount: 200 },
    ]);
    const rows = buildBudgetExportRows({
      ...baseArgs,
      item,
      includeHistory: false,
      includeFuture: true,
    });
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe("New");
    expect(rows[0].amount).toBe(200);
  });

  it("emits history-only rows when future is excluded", () => {
    const item = buildItem("acct-1", [
      { id: "past", date: "2026-04-01", description: "Old", amount: -100 },
      { id: "future", date: "2026-06-01", description: "New", amount: 200 },
    ]);
    const rows = buildBudgetExportRows({
      ...baseArgs,
      item,
      includeHistory: true,
      includeFuture: false,
    });
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe("Old");
  });

  it("replaces history-row descriptions with type names when a type is resolved", () => {
    const item = buildItem("acct-1", []);
    const history: HistoryEntry[] = [
      {
        id: "h1",
        date: "2026-04-15",
        description: "ICA SUPERMARKET 12345",
        amount: -250,
        importedAt: 1700000000000,
      },
    ];
    const types: EntryType[] = [
      {
        id: "type-groceries",
        name: "Groceries",
        color: "#fff",
        glyph: "shopping-cart",
        categoryId: "cat-food",
      },
    ];
    const categories: Category[] = [
      { id: "cat-food", name: "Food", color: "#0f0", icon: "utensils" },
    ];
    const rows = buildBudgetExportRows({
      ...baseArgs,
      item,
      history,
      // A merchant hint maps the raw description to the type so the
      // synthesized history row picks up the type without a match rule.
      merchantHints: {
        "ica supermarket": {
          typeId: "type-groceries",
          hitCount: 1,
          lastUsedAt: 1700000000000,
        },
      },
      types,
      categories,
      includeHistory: true,
      includeFuture: true,
    });
    expect(rows.length).toBe(1);
    // Description is replaced by the type name on history rows.
    expect(rows[0].description).toBe("Groceries");
    expect(rows[0].type).toBe("Groceries");
    expect(rows[0].category).toBe("Food");
    expect(rows[0].amount).toBe(-250);
  });

  it("includes the running balance starting from the opening balance", () => {
    const item = buildItem("acct-1", [
      { id: "a", date: "2026-06-01", description: "first", amount: 100 },
      { id: "b", date: "2026-06-02", description: "second", amount: 50 },
    ]);
    const rows = buildBudgetExportRows({
      ...baseArgs,
      item,
      openingBalance: 1000,
      includeHistory: true,
      includeFuture: true,
    });
    expect(rows.map((r) => r.balance)).toEqual([1100, 1150]);
  });
});

describe("rowsToCsv", () => {
  it("quotes string fields, leaves numbers bare, and uses CRLF", () => {
    const item = buildItem("acct-1", [
      { id: "x", date: "2026-06-01", description: "Café", amount: 25.5 },
    ]);
    const rows = buildBudgetExportRows({
      ...baseArgs,
      item,
      includeHistory: true,
      includeFuture: true,
    });
    const table = exportRowsToTable(rows, {
      date: "Date",
      type: "Type",
      category: "Category",
      description: "Description",
      amount: "Amount",
      balance: "Balance",
    });
    const csv = rowsToCsv(table);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      '"Date","Description","Type","Category","Amount","Balance"',
    );
    // Numeric cells are bare; strings are quoted. Description sits in
    // position 2 so the eye finds it next to the date.
    expect(lines[1]).toBe('"2026-06-01","Café","","",25.5,25.5');
  });

  it("escapes embedded quotes inside string cells", () => {
    const csv = rowsToCsv([['He said "hi"', 1]]);
    expect(csv).toBe('"He said ""hi""",1');
  });
});

describe("exportRowsToTable", () => {
  it("emits Date, Description, Type, Category, Amount, Balance in that order", () => {
    const table = exportRowsToTable(
      [
        {
          date: "2026-06-01",
          type: "Salary",
          category: "Income",
          description: "Monthly pay",
          amount: 25000,
          balance: 25000,
        },
      ],
      {
        date: "Date",
        type: "Type",
        category: "Category",
        description: "Description",
        amount: "Amount",
        balance: "Balance",
      },
    );
    expect(table[0]).toEqual([
      "Date",
      "Description",
      "Type",
      "Category",
      "Amount",
      "Balance",
    ]);
    expect(table[1]).toEqual([
      "2026-06-01",
      "Monthly pay",
      "Salary",
      "Income",
      25000,
      25000,
    ]);
  });
});

// Sanity check that the export's running balance matches what
// `computeBalances` produces on the same item — keeps both paths from
// drifting when BudgetPage and the exporter both evolve.
describe("buildBudgetExportRows / computeBalances parity", () => {
  it("matches per-row balance against the canonical balance helper", () => {
    const item = buildItem("acct-1", [
      { id: "a", date: "2026-06-01", description: "first", amount: 100 },
      { id: "b", date: "2026-06-02", description: "second", amount: -25 },
      { id: "c", date: "2026-06-03", description: "third", amount: 12.5 },
    ]);
    const balances = computeBalances(item, 0);
    const rows = buildBudgetExportRows({
      ...baseArgs,
      item,
      openingBalance: 0,
      includeHistory: true,
      includeFuture: true,
    });
    expect(rows.map((r) => r.balance)).toEqual([
      balances.get("a"),
      balances.get("b"),
      balances.get("c"),
    ]);
  });
});
