import { describe, expect, it } from "vitest";

import {
  computeBalances,
  createDefaultAccountBudget,
  createDefaultSheet,
  currentFiscalMonthKey,
  findColumnByType,
  fiscalMonthSeedIso,
  getMonthKey,
  groupRowsByMonth,
  isRowHalfDone,
  isRowSavable,
  moveColumn,
  rowsInSeriesFrom,
  shiftIsoToMonth,
  sortMonthKeys,
  sortRowsByDate,
  userDataHasHalfDoneRows,
  userDataWithSavableRows,
} from "../src/data/sheet";
import type { AccountBudget, Row, UserData } from "../src/data/types";

const TEST_ACCOUNT_ID = "acct-1";

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
  it("shifts to the previous calendar month when day < startOfMonth", () => {
    expect(getMonthKey("2026-05-24", 25)).toBe("2026-04");
    expect(getMonthKey("2026-05-25", 25)).toBe("2026-05");
    expect(getMonthKey("2026-06-24", 25)).toBe("2026-05");
    expect(getMonthKey("2026-06-25", 25)).toBe("2026-06");
  });
  it("rolls year backward when shifting January days into December", () => {
    expect(getMonthKey("2026-01-10", 25)).toBe("2025-12");
    expect(getMonthKey("2026-01-25", 25)).toBe("2026-01");
  });
  it("collapses to calendar month when startOfMonth is 1", () => {
    expect(getMonthKey("2026-05-01", 1)).toBe("2026-05");
    expect(getMonthKey("2026-05-31", 1)).toBe("2026-05");
  });
});

describe("fiscalMonthSeedIso", () => {
  it("round-trips through getMonthKey for the same fiscal month", () => {
    for (const startOfMonth of [1, 15, 25, 28]) {
      for (const monthKey of ["2026-01", "2026-05", "2026-12"]) {
        const iso = fiscalMonthSeedIso(monthKey, startOfMonth);
        expect(getMonthKey(iso, startOfMonth)).toBe(monthKey);
      }
    }
  });
  it("uses the start-of-month day so the seed lands in this month's bucket", () => {
    // Without this, `${monthKey}-01` would fall into fiscal "2026-04"
    // because day 1 < 25 shifts the fiscal month back.
    expect(fiscalMonthSeedIso("2026-05", 25)).toBe("2026-05-25");
    expect(fiscalMonthSeedIso("2026-05", 1)).toBe("2026-05-01");
  });
  it("returns empty for non-monthKey input", () => {
    expect(fiscalMonthSeedIso("undated", 25)).toBe("");
    expect(fiscalMonthSeedIso("", 25)).toBe("");
  });
});

describe("currentFiscalMonthKey", () => {
  it("returns the calendar month when day >= startOfMonth", () => {
    expect(currentFiscalMonthKey(25, new Date(2026, 4, 25))).toBe("2026-05");
    expect(currentFiscalMonthKey(25, new Date(2026, 4, 31))).toBe("2026-05");
  });
  it("returns the previous month when day < startOfMonth", () => {
    expect(currentFiscalMonthKey(25, new Date(2026, 4, 24))).toBe("2026-04");
    expect(currentFiscalMonthKey(25, new Date(2026, 0, 1))).toBe("2025-12");
  });
});

describe("createDefaultAccountBudget / createDefaultSheet", () => {
  it("defaults accountId to null when omitted", () => {
    const item = createDefaultAccountBudget();
    expect(item.accountId).toBeNull();
  });

  it("threads a provided accountId through", () => {
    const item = createDefaultAccountBudget("acct-9");
    expect(item.accountId).toBe("acct-9");
  });

  it("creates a sheet with an unassigned AccountBudget by default", () => {
    const sheet = createDefaultSheet("Foo");
    const item = sheet.items[0] as AccountBudget;
    expect(sheet.name).toBe("Foo");
    expect(item.accountId).toBeNull();
  });
});

describe("moveColumn", () => {
  it("reorders by id", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
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
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const sameRef = sheet.columns;
    expect(moveColumn(sameRef, sameRef[0].id, sameRef[0].id)).toBe(sameRef);
    expect(moveColumn(sameRef, "x", sameRef[0].id)).toBe(sameRef);
  });
});

describe("groupRowsByMonth + sortMonthKeys", () => {
  it("groups by YYYY-MM and sorts undated last", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
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
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
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
  it("running total in date order, starting from zero and carrying across months", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const r1 = seedRow(dateCol.id, amountCol.id, "2026-04-15", 50);
    const r2 = seedRow(dateCol.id, amountCol.id, "2026-05-01", -20);
    const r3 = seedRow(dateCol.id, amountCol.id, "2026-05-20", 10);
    sheet.rows = [r3, r1, r2]; // out of order on purpose

    const balances = computeBalances(sheet);
    expect(balances.get(r1.id)).toBe(50);
    expect(balances.get(r2.id)).toBe(30);
    expect(balances.get(r3.id)).toBe(40);
  });

  it("returns empty map when amount or date column is missing", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    sheet.columns = sheet.columns.filter((c) => c.type !== "amount");
    expect(computeBalances(sheet).size).toBe(0);
  });
});

describe("shiftIsoToMonth", () => {
  it("preserves day-of-month within the target month", () => {
    expect(shiftIsoToMonth("2026-05-16", "2026-07")).toBe("2026-07-16");
  });
  it("clamps to the last day when the target month is shorter", () => {
    expect(shiftIsoToMonth("2026-01-31", "2026-02")).toBe("2026-02-28");
    expect(shiftIsoToMonth("2024-01-31", "2024-02")).toBe("2024-02-29");
    expect(shiftIsoToMonth("2026-05-31", "2026-04")).toBe("2026-04-30");
  });
  it("returns input unchanged for malformed values", () => {
    expect(shiftIsoToMonth("not-a-date", "2026-07")).toBe("not-a-date");
    expect(shiftIsoToMonth("2026-05-16", "2026/07")).toBe("2026-05-16");
  });
});

describe("rowsInSeriesFrom", () => {
  const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
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

describe("isRowSavable / isRowHalfDone", () => {
  const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
  const descCol = findColumnByType(sheet.columns, "description")!;
  const amountCol = findColumnByType(sheet.columns, "amount")!;
  const dateCol = findColumnByType(sheet.columns, "date")!;

  function row(cells: Record<string, string | number | boolean | null>): Row {
    return { id: "r", cells };
  }

  it("savable requires both description and amount", () => {
    expect(
      isRowSavable(
        row({ [descCol.id]: "Rent", [amountCol.id]: 100 }),
        sheet.columns,
      ),
    ).toBe(true);
  });

  it("amount of zero counts as filled", () => {
    expect(
      isRowSavable(
        row({ [descCol.id]: "Refund", [amountCol.id]: 0 }),
        sheet.columns,
      ),
    ).toBe(true);
  });

  it("whitespace-only description doesn't count as filled", () => {
    expect(
      isRowSavable(
        row({ [descCol.id]: "   ", [amountCol.id]: 5 }),
        sheet.columns,
      ),
    ).toBe(false);
  });

  it("a fully empty row is neither savable nor half-done", () => {
    const r = row({ [dateCol.id]: "2026-05-16" });
    expect(isRowSavable(r, sheet.columns)).toBe(false);
    expect(isRowHalfDone(r, sheet.columns)).toBe(false);
  });

  it("description-only is half-done", () => {
    const r = row({ [descCol.id]: "Coffee" });
    expect(isRowSavable(r, sheet.columns)).toBe(false);
    expect(isRowHalfDone(r, sheet.columns)).toBe(true);
  });

  it("amount-only is half-done", () => {
    const r = row({ [amountCol.id]: -12 });
    expect(isRowSavable(r, sheet.columns)).toBe(false);
    expect(isRowHalfDone(r, sheet.columns)).toBe(true);
  });

  it("a complete row is not half-done", () => {
    const r = row({ [descCol.id]: "Coffee", [amountCol.id]: -12 });
    expect(isRowHalfDone(r, sheet.columns)).toBe(false);
  });
});

describe("userDataWithSavableRows / userDataHasHalfDoneRows", () => {
  function firstAB(data: UserData): AccountBudget {
    return data.sheets[0].items[0] as AccountBudget;
  }

  function build(): { data: UserData; descId: string; amountId: string } {
    const item = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const descId = findColumnByType(item.columns, "description")!.id;
    const amountId = findColumnByType(item.columns, "amount")!.id;
    item.rows = [
      { id: "complete", cells: { [descId]: "Rent", [amountId]: -1000 } },
      { id: "half", cells: { [descId]: "Coffee" } },
      { id: "empty", cells: {} },
    ];
    const sheetId = "sheet-1";
    return {
      data: {
        version: 6,
        sheets: [{ id: sheetId, name: "Test", items: [item] }],
        activeSheetId: sheetId,
        accounts: [{ id: TEST_ACCOUNT_ID, name: "Default" }],
        categories: [],
      } as unknown as UserData,
      descId,
      amountId,
    };
  }

  it("filters out half-done and empty rows from the snapshot", () => {
    const { data } = build();
    const filtered = userDataWithSavableRows(data);
    expect(firstAB(filtered).rows.map((r) => r.id)).toEqual(["complete"]);
  });

  it("does not mutate the input data", () => {
    const { data } = build();
    const before = firstAB(data).rows.length;
    userDataWithSavableRows(data);
    expect(firstAB(data).rows.length).toBe(before);
  });

  it("reports half-done rows so callers can prompt or light up the save button", () => {
    const { data } = build();
    expect(userDataHasHalfDoneRows(data)).toBe(true);
  });

  it("returns false when every row is either complete or fully blank", () => {
    const { data, descId, amountId } = build();
    firstAB(data).rows = [
      { id: "complete", cells: { [descId]: "Rent", [amountId]: -1000 } },
      { id: "empty", cells: {} },
    ];
    expect(userDataHasHalfDoneRows(data)).toBe(false);
  });
});
