import { describe, expect, it } from "vitest";

import {
  buildHistoryExportRows,
  historyRowsToTable,
  HISTORY_EXPORT_HEADERS,
  writeHistoryCsv,
} from "../src/data/history-export";
import type { Category, EntryType, HistoryEntry } from "../src/data/types";

const TYPES: readonly EntryType[] = [
  {
    id: "type-groceries",
    name: "Groceries",
    color: "#abcdef",
    glyph: "shopping-cart",
    categoryId: "cat-food",
    kind: "expense",
  },
];

const CATEGORIES: readonly Category[] = [
  { id: "cat-food", name: "Food", color: "#fedcba" },
];

function entry(over: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: over.id ?? "abc12345",
    date: over.date ?? "2026-05-01",
    description: over.description ?? "ICA Maxi",
    amount: over.amount ?? -100,
    importedAt: over.importedAt ?? 0,
    balance: over.balance,
    hidden: over.hidden,
    userTypeId: over.userTypeId,
    userDescription: over.userDescription,
    splits: over.splits,
  };
}

describe("buildHistoryExportRows", () => {
  it("excludes hidden entries by default", () => {
    const rows = buildHistoryExportRows({
      entries: [
        entry({ id: "a", date: "2026-05-01", hidden: true }),
        entry({ id: "b", date: "2026-05-02" }),
      ],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-05-02");
  });

  it("includes hidden entries when explicitly requested", () => {
    const rows = buildHistoryExportRows({
      entries: [entry({ id: "a", hidden: true })],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
      includeHidden: true,
    });
    expect(rows).toHaveLength(1);
  });

  it("resolves user-assigned type to its category name", () => {
    const rows = buildHistoryExportRows({
      entries: [entry({ userTypeId: "type-groceries" })],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    expect(rows[0].type).toBe("Groceries");
    expect(rows[0].category).toBe("Food");
  });

  it("emits balance:null for credit-card entries (no balance field)", () => {
    const rows = buildHistoryExportRows({
      entries: [entry({ balance: undefined })],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    expect(rows[0].balance).toBeNull();
  });

  it("sorts entries chronologically", () => {
    const rows = buildHistoryExportRows({
      entries: [
        entry({ id: "a", date: "2026-05-02" }),
        entry({ id: "b", date: "2026-05-01" }),
        entry({ id: "c", date: "2026-05-03" }),
      ],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    expect(rows.map((r) => r.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
  });

  it("expands splits with the balance pinned to the last row", () => {
    const rows = buildHistoryExportRows({
      entries: [
        entry({
          amount: -100,
          balance: 500,
          splits: [
            { description: "Apples", amount: -40 },
            { description: "Bread", amount: -60, typeId: "type-groceries" },
          ],
        }),
      ],
      types: TYPES,
      categories: CATEGORIES,
      merchantHints: {},
      matchRules: [],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].description).toBe("Apples");
    expect(rows[0].balance).toBeNull();
    expect(rows[1].description).toBe("Bread");
    expect(rows[1].balance).toBe(500);
    expect(rows[1].type).toBe("Groceries");
  });
});

describe("HISTORY_EXPORT_HEADERS", () => {
  it("matches the documented schema", () => {
    expect(HISTORY_EXPORT_HEADERS).toEqual([
      "Date",
      "Description",
      "Amount",
      "Balance",
      "Type",
      "Category",
    ]);
  });

  it("historyRowsToTable emits headers in the documented order", () => {
    const table = historyRowsToTable([]);
    expect(table[0]).toEqual([
      "Date",
      "Description",
      "Amount",
      "Balance",
      "Type",
      "Category",
    ]);
  });

  it("appends currency suffix to Amount/Balance when given", () => {
    const table = historyRowsToTable([], "SEK");
    expect(table[0]).toEqual([
      "Date",
      "Description",
      "Amount (SEK)",
      "Balance (SEK)",
      "Type",
      "Category",
    ]);
  });
});

describe("writeHistoryCsv", () => {
  it("produces a single-line header when given no rows", () => {
    const csv = writeHistoryCsv([]);
    expect(csv).toBe(
      '"Date","Description","Amount","Balance","Type","Category"',
    );
  });

  it("quotes every string field and leaves numbers bare", () => {
    const csv = writeHistoryCsv([
      {
        date: "2026-05-01",
        description: "ICA Maxi",
        amount: -100,
        balance: 500,
        type: "",
        category: "",
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe('"2026-05-01","ICA Maxi",-100,500,"",""');
  });
});
