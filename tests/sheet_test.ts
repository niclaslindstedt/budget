import { describe, expect, it } from "vitest";

import {
  computeBalances,
  createDefaultSheet,
  findColumnByType,
  getMonthKey,
  groupRowsByMonth,
  moveColumn,
  rowsInSeriesFrom,
  sortMonthKeys,
  sortRowsByDate,
} from "../src/data/sheet";
import type { Row } from "../src/data/types";

function seedRow(
  dateColId: string,
  amountColId: string,
  date: string | null,
  amount: number,
): Row {
  return {
    id: `${date ?? "null"}-${amount}`,
    cells: {
      [dateColId]: date,
      [amountColId]: amount,
    },
  };
}

describe("getMonthKey", () => {
  it("returns YYYY-MM for ISO dates", () => {
    expect(getMonthKey("2026-05-16")).toBe("2026-05");
  });
  it("returns 'undated' for missing or short values", () => {
    expect(getMonthKey(null)).toBe("undated");
    expect(getMonthKey("")).toBe("undated");
    expect(getMonthKey("abc")).toBe("undated");
  });
});

describe("moveColumn", () => {
  it("reorders by id", () => {
    const sheet = createDefaultSheet();
    const ids = sheet.columns.map((c) => c.id);
    const next = moveColumn(sheet.columns, ids[0], ids[3]);
    const order = next.map((c) => c.type);
    // date moves from index 0 to index 3
    expect(order).toEqual([
      "description",
      "category",
      "amount",
      "date",
      "balance",
      "completed",
    ]);
  });

  it("no-ops when ids are equal or missing", () => {
    const sheet = createDefaultSheet();
    const sameRef = sheet.columns;
    expect(moveColumn(sameRef, sameRef[0].id, sameRef[0].id)).toBe(sameRef);
    expect(moveColumn(sameRef, "x", sameRef[0].id)).toBe(sameRef);
  });
});

describe("groupRowsByMonth + sortMonthKeys", () => {
  it("groups by YYYY-MM and sorts undated last", () => {
    const sheet = createDefaultSheet();
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const rows = [
      seedRow(dateCol.id, amountCol.id, "2026-05-10", 1),
      seedRow(dateCol.id, amountCol.id, "2026-04-02", 1),
      seedRow(dateCol.id, amountCol.id, "2026-05-01", 1),
      seedRow(dateCol.id, amountCol.id, null, 1),
    ];
    const groups = groupRowsByMonth(rows, dateCol.id);
    expect(sortMonthKeys(groups.keys())).toEqual([
      "2026-04",
      "2026-05",
      "undated",
    ]);
    expect(groups.get("2026-05")).toHaveLength(2);
  });
});

describe("sortRowsByDate", () => {
  it("sorts ascending, empty dates last", () => {
    const sheet = createDefaultSheet();
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const rows = [
      seedRow(dateCol.id, amountCol.id, "2026-05-10", 1),
      seedRow(dateCol.id, amountCol.id, null, 1),
      seedRow(dateCol.id, amountCol.id, "2026-05-01", 1),
    ];
    const sorted = sortRowsByDate(rows, dateCol.id);
    expect(sorted.map((r) => r.cells[dateCol.id])).toEqual([
      null,
      "2026-05-01",
      "2026-05-10",
    ]);
  });
});

describe("computeBalances", () => {
  it("running total in date order, including opening balance and across months", () => {
    const sheet = createDefaultSheet();
    sheet.openingBalance = 100;
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const r1 = seedRow(dateCol.id, amountCol.id, "2026-04-15", 50);
    const r2 = seedRow(dateCol.id, amountCol.id, "2026-05-01", -20);
    const r3 = seedRow(dateCol.id, amountCol.id, "2026-05-20", 10);
    sheet.rows = [r3, r1, r2]; // out of order on purpose

    const balances = computeBalances(sheet);
    expect(balances.get(r1.id)).toBe(150);
    expect(balances.get(r2.id)).toBe(130);
    expect(balances.get(r3.id)).toBe(140);
  });

  it("returns empty map when amount or date column is missing", () => {
    const sheet = createDefaultSheet();
    sheet.columns = sheet.columns.filter((c) => c.type !== "amount");
    expect(computeBalances(sheet).size).toBe(0);
  });
});

describe("rowsInSeriesFrom", () => {
  const sheet = createDefaultSheet();
  const dateCol = findColumnByType(sheet.columns, "date")!;
  const amountCol = findColumnByType(sheet.columns, "amount")!;

  function s(id: string, date: string, amount = 1, seriesId?: string): Row {
    const row: Row = {
      id,
      cells: { [dateCol.id]: date, [amountCol.id]: amount },
    };
    if (seriesId) row.seriesId = seriesId;
    return row;
  }

  const rows: Row[] = [
    s("a", "2026-01-15", 1, "rent"),
    s("b", "2026-02-15", 1, "rent"),
    s("c", "2026-03-15", 1, "rent"),
    s("d", "2026-04-15", 1, "rent"),
    s("e", "2026-02-20", 1, "spotify"),
    s("f", "2026-03-20", 1),
  ];

  it("returns anchor + matching siblings with date >= anchor date", () => {
    const anchor = rows.find((r) => r.id === "b")!;
    const result = rowsInSeriesFrom(rows, anchor, dateCol.id);
    expect(result.map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  it("clamps with untilIso (inclusive)", () => {
    const anchor = rows.find((r) => r.id === "b")!;
    const result = rowsInSeriesFrom(rows, anchor, dateCol.id, "2026-03-31");
    expect(result.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("excludes other series and one-off rows", () => {
    const anchor = rows.find((r) => r.id === "a")!;
    const result = rowsInSeriesFrom(rows, anchor, dateCol.id);
    expect(result.every((r) => r.seriesId === "rent")).toBe(true);
  });

  it("returns just the anchor for non-series rows", () => {
    const anchor = rows.find((r) => r.id === "f")!;
    const result = rowsInSeriesFrom(rows, anchor, dateCol.id);
    expect(result).toEqual([anchor]);
  });
});
