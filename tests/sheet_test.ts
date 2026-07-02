import { describe, expect, it } from "vitest";

import {
  computeBalances,
  defaultCompletedForDate,
  isRowFinished,
  isRowHalfDone,
  isRowSavable,
  mapSeriesFrom,
  mintBudgetRow,
  reverseRowsForNewestFirst,
  rowsInSeriesFrom,
  sortRowsByDate,
  userDataHasHalfDoneRows,
  userDataWithSavableRows,
} from "../src/data/budget/rows";
import { synthesizeHistoryRow } from "../src/data/synthesis";
import {
  applyMonthShift,
  computePrimaryIncomeShift,
  currentFiscalMonthKey,
  fiscalMonthSeedIso,
  getMonthKey,
  groupRowsByMonth,
  previousMonthKey,
  shiftIsoToMonth,
  sortMonthKeys,
} from "../src/data/fiscal-month";
import {
  createDefaultSheet,
  findColumnByType,
  getStandardColumns,
  mapRowsByIds,
  moveColumn,
  updateAccountBudget,
  updateHistoryEntry,
} from "../src/data/sheet";
import { createDefaultAccountBudget } from "../src/data/sheet-types";
import type {
  AccountBudget,
  AccountsView,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";

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

describe("previousMonthKey", () => {
  it("steps back one calendar month", () => {
    expect(previousMonthKey("2026-05")).toBe("2026-04");
    expect(previousMonthKey("2026-12")).toBe("2026-11");
  });
  it("rolls year backward when crossing January", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
  });
  it("passes non-month keys through unchanged", () => {
    expect(previousMonthKey("undated")).toBe("undated");
    expect(previousMonthKey("")).toBe("");
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
      "type",
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

  it("honours per-row fiscalMonthShift (+1) and cascades to same-day rows", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    // Default startOfMonth=1: Apr 28 is "2026-04". One row carries
    // fiscalMonthShift=+1, two other rows share its date and ride
    // along; a separate row on Apr 27 stays put.
    const rows = [
      {
        ...seedRow(dateCol.id, amountCol.id, "2026-04-28", 30000),
        fiscalMonthShift: 1 as const,
      },
      seedRow(dateCol.id, amountCol.id, "2026-04-28", -500),
      seedRow(dateCol.id, amountCol.id, "2026-04-28", -200),
      seedRow(dateCol.id, amountCol.id, "2026-04-27", -100),
    ];
    const groups = groupRowsByMonth(rows, dateCol.id);
    expect(groups.get("2026-05")).toHaveLength(3);
    expect(groups.get("2026-04")).toHaveLength(1);
  });

  it("rolls the year when shifting December → next January", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const rows = [
      {
        ...seedRow(dateCol.id, amountCol.id, "2026-12-28", 30000),
        fiscalMonthShift: 1 as const,
      },
    ];
    const groups = groupRowsByMonth(rows, dateCol.id);
    expect(groups.has("2027-01")).toBe(true);
    expect(groups.has("2026-12")).toBe(false);
  });

  it("honours -1 shift", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const rows = [
      {
        ...seedRow(dateCol.id, amountCol.id, "2026-01-03", 100),
        fiscalMonthShift: -1 as const,
      },
    ];
    const groups = groupRowsByMonth(rows, dateCol.id);
    expect(groups.has("2025-12")).toBe(true);
  });

  it("first-wins when two rows on the same day disagree", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const rows = [
      {
        ...seedRow(dateCol.id, amountCol.id, "2026-04-28", 30000),
        fiscalMonthShift: 1 as const,
      },
      {
        ...seedRow(dateCol.id, amountCol.id, "2026-04-28", -50),
        fiscalMonthShift: -1 as const,
      },
    ];
    const groups = groupRowsByMonth(rows, dateCol.id);
    // Both lifted to 2026-05 by the first-wins cascade.
    expect(groups.get("2026-05")).toHaveLength(2);
  });
});

describe("applyMonthShift", () => {
  it("steps forward by one", () => {
    expect(applyMonthShift("2026-04", 1)).toBe("2026-05");
  });
  it("steps backward by one", () => {
    expect(applyMonthShift("2026-05", -1)).toBe("2026-04");
  });
  it("rolls year forward over December", () => {
    expect(applyMonthShift("2026-12", 1)).toBe("2027-01");
  });
  it("rolls year backward over January", () => {
    expect(applyMonthShift("2026-01", -1)).toBe("2025-12");
  });
  it("returns input unchanged for non-month keys", () => {
    expect(applyMonthShift("undated", 1)).toBe("undated");
    expect(applyMonthShift("", -1)).toBe("");
  });
  it("returns input unchanged for delta 0", () => {
    expect(applyMonthShift("2026-04", 0)).toBe("2026-04");
  });
});

describe("computePrimaryIncomeShift", () => {
  it("returns +1 when row date is earlier than the anchor day", () => {
    expect(
      computePrimaryIncomeShift("2026-04-22", {
        isPrimaryIncome: true,
        anchorDayOfMonth: 25,
      }),
    ).toBe(1);
  });

  it("returns undefined when row date is on the anchor day", () => {
    expect(
      computePrimaryIncomeShift("2026-04-25", {
        isPrimaryIncome: true,
        anchorDayOfMonth: 25,
      }),
    ).toBeUndefined();
  });

  it("returns undefined when row date is after the anchor day", () => {
    expect(
      computePrimaryIncomeShift("2026-04-28", {
        isPrimaryIncome: true,
        anchorDayOfMonth: 25,
      }),
    ).toBeUndefined();
  });

  it("returns undefined when the series isn't flagged primary income", () => {
    expect(
      computePrimaryIncomeShift("2026-04-22", { anchorDayOfMonth: 25 }),
    ).toBeUndefined();
  });

  it("returns undefined when no anchor day is set", () => {
    expect(
      computePrimaryIncomeShift("2026-04-22", { isPrimaryIncome: true }),
    ).toBeUndefined();
  });

  it("returns undefined for a missing or short ISO date", () => {
    expect(
      computePrimaryIncomeShift("", {
        isPrimaryIncome: true,
        anchorDayOfMonth: 25,
      }),
    ).toBeUndefined();
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

  it("within a date, incomes come before expenses, then by largest category sum, then |amount| desc, then alphabetical", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const descCol = findColumnByType(sheet.columns, "description")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;

    // Two categories on the same date: "food" rows sum to |200|+|100|
    // = 300, "housing" rows sum to |500|. Housing wins the category
    // bucket. Income row (+1000) of type "salary" / category "pay"
    // must come before every expense regardless of category sum.
    function r(
      id: string,
      date: string,
      desc: string,
      amount: number,
      typeId?: string,
    ): Row {
      return {
        id,
        cells: {
          [dateCol.id]: date,
          [descCol.id]: desc,
          [amountCol.id]: amount,
        },
        ...(typeId ? { typeId } : {}),
      };
    }

    const rows: Row[] = [
      r("food-small", "2026-05-10", "Snack", -100, "food-type"),
      r("food-big", "2026-05-10", "Groceries", -200, "food-type"),
      r("housing", "2026-05-10", "Rent", -500, "housing-type"),
      r("salary", "2026-05-10", "Paycheck", 1000, "salary-type"),
      r("next-day", "2026-05-11", "Coffee", -30, "food-type"),
    ];

    const typesById = new Map([
      [
        "food-type",
        {
          id: "food-type",
          name: "Food",
          color: "#fff",
          glyph: "utensils" as const,
          categoryId: "cat-food",
        },
      ],
      [
        "housing-type",
        {
          id: "housing-type",
          name: "Housing",
          color: "#fff",
          glyph: "home" as const,
          categoryId: "cat-housing",
        },
      ],
      [
        "salary-type",
        {
          id: "salary-type",
          name: "Salary",
          color: "#fff",
          glyph: "banknote" as const,
          categoryId: "cat-income",
          kind: "income" as const,
        },
      ],
    ]);

    const sorted = sortRowsByDate(rows, dateCol.id, {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById,
    });

    expect(sorted.map((r) => r.id)).toEqual([
      "salary",
      "housing",
      "food-big",
      "food-small",
      "next-day",
    ]);
  });

  it("breaks ties alphabetically by description when amounts also match", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const descCol = findColumnByType(sheet.columns, "description")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const rows: Row[] = [
      {
        id: "b",
        cells: {
          [dateCol.id]: "2026-05-10",
          [descCol.id]: "Bravo",
          [amountCol.id]: -50,
        },
      },
      {
        id: "a",
        cells: {
          [dateCol.id]: "2026-05-10",
          [descCol.id]: "Alpha",
          [amountCol.id]: -50,
        },
      },
    ];
    const sorted = sortRowsByDate(rows, dateCol.id, {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById: new Map(),
    });
    expect(sorted.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("reverseRowsForNewestFirst", () => {
  it("mirrors the ascending order: latest day on top AND income at the bottom of its day", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const descCol = findColumnByType(sheet.columns, "description")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;

    function r(id: string, date: string, desc: string, amount: number): Row {
      return {
        id,
        cells: {
          [dateCol.id]: date,
          [descCol.id]: desc,
          [amountCol.id]: amount,
        },
      };
    }

    // Ascending view: payday (the 10th) first, income at the top of its
    // day; the later day (the 11th) below it.
    const ascending = sortRowsByDate(
      [
        r("salary", "2026-05-10", "Paycheck", 1000),
        r("rent", "2026-05-10", "Rent", -500),
        r("coffee", "2026-05-11", "Coffee", -30),
      ],
      dateCol.id,
      {
        descriptionColumnId: descCol.id,
        amountColumnId: amountCol.id,
        typesById: new Map(),
      },
    );
    expect(ascending.map((row) => row.id)).toEqual([
      "salary",
      "rent",
      "coffee",
    ]);

    // Newest-first view: the later day rises to the top, and within the
    // payday the salary drops to the bottom — the mirror of "income
    // first", so "first" reads as the last row top-to-bottom.
    const reversed = reverseRowsForNewestFirst(ascending);
    expect(reversed.map((row) => row.id)).toEqual(["coffee", "rent", "salary"]);
  });

  it("returns a fresh array, leaving the input untouched", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const input = [
      seedRow(dateCol.id, amountCol.id, "2026-05-01", 1),
      seedRow(dateCol.id, amountCol.id, "2026-05-02", 1),
    ];
    const reversed = reverseRowsForNewestFirst(input);
    expect(reversed).not.toBe(input);
    expect(input.map((r) => r.cells[dateCol.id])).toEqual([
      "2026-05-01",
      "2026-05-02",
    ]);
    expect(reversed.map((r) => r.cells[dateCol.id])).toEqual([
      "2026-05-02",
      "2026-05-01",
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

  it("snaps the running total to balanceOverrides at matching rows", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    const r1 = seedRow(dateCol.id, amountCol.id, "2026-04-15", -100);
    const r2 = seedRow(dateCol.id, amountCol.id, "2026-04-20", -50);
    const r3 = seedRow(dateCol.id, amountCol.id, "2026-05-01", -25);
    sheet.rows = [r1, r2, r3];

    // r1 and r2 anchor to authoritative bank balances; r3 falls
    // through to amount-based accumulation off the latest anchor.
    const overrides = new Map([
      [r1.id, 900],
      [r2.id, 850],
    ]);
    const balances = computeBalances(sheet, 1000, undefined, overrides);
    expect(balances.get(r1.id)).toBe(900);
    expect(balances.get(r2.id)).toBe(850);
    expect(balances.get(r3.id)).toBe(825);
  });

  it("override absorbs earlier authored amounts on the same anchor date", () => {
    const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
    const dateCol = findColumnByType(sheet.columns, "date")!;
    const amountCol = findColumnByType(sheet.columns, "amount")!;
    // A forecast row the user authored before the bank statement
    // arrived, on the same day as the anchored history entry.
    const authored = seedRow(dateCol.id, amountCol.id, "2026-04-15", -500);
    const historyAnchor = seedRow(dateCol.id, amountCol.id, "2026-04-15", -100);
    sheet.rows = [authored, historyAnchor];

    const overrides = new Map([[historyAnchor.id, 900]]);
    const balances = computeBalances(sheet, 1000, undefined, overrides);
    // The authored row computes its own intermediate (1000 - 500 =
    // 500), but the history snap drops it on the floor — future rows
    // resume from 900, not from 500 - 100.
    expect(balances.get(authored.id)).toBe(500);
    expect(balances.get(historyAnchor.id)).toBe(900);
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
      kind: "user",
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

describe("mapSeriesFrom", () => {
  const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
  const dateCol = findColumnByType(sheet.columns, "date")!;
  const amountCol = findColumnByType(sheet.columns, "amount")!;

  function s(id: string, date: string, amount = 1, seriesId?: string): Row {
    const row: Row = {
      kind: "user",
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
    s("e", "2026-02-20", 5, "spotify"),
    s("f", "2026-03-20", 5),
  ];

  const bump = (r: Row): Row => ({
    ...r,
    cells: { ...r.cells, [amountCol.id]: 9 },
  });

  it("applies to the anchor and every later sibling in the same series", () => {
    const anchor = rows.find((r) => r.id === "b")!;
    const result = mapSeriesFrom(rows, anchor, dateCol.id, null, bump);
    expect(result.find((r) => r.id === "a")!.cells[amountCol.id]).toBe(1);
    expect(result.find((r) => r.id === "b")!.cells[amountCol.id]).toBe(9);
    expect(result.find((r) => r.id === "c")!.cells[amountCol.id]).toBe(9);
    expect(result.find((r) => r.id === "d")!.cells[amountCol.id]).toBe(9);
    expect(result.find((r) => r.id === "e")!.cells[amountCol.id]).toBe(5);
    expect(result.find((r) => r.id === "f")!.cells[amountCol.id]).toBe(5);
  });

  it("respects the inclusive untilIso bound", () => {
    const anchor = rows.find((r) => r.id === "b")!;
    const result = mapSeriesFrom(rows, anchor, dateCol.id, "2026-03-31", bump);
    expect(result.find((r) => r.id === "b")!.cells[amountCol.id]).toBe(9);
    expect(result.find((r) => r.id === "c")!.cells[amountCol.id]).toBe(9);
    expect(result.find((r) => r.id === "d")!.cells[amountCol.id]).toBe(1);
  });

  it("returns rows untouched when anchor isn't part of a series", () => {
    const anchor = rows.find((r) => r.id === "f")!;
    const result = mapSeriesFrom(rows, anchor, dateCol.id, null, bump);
    expect(result).toBe(rows);
  });
});

describe("isRowSavable / isRowHalfDone", () => {
  const sheet = createDefaultAccountBudget(TEST_ACCOUNT_ID);
  const descCol = findColumnByType(sheet.columns, "description")!;
  const amountCol = findColumnByType(sheet.columns, "amount")!;
  const dateCol = findColumnByType(sheet.columns, "date")!;

  function row(cells: Record<string, string | number | boolean | null>): Row {
    return { kind: "user", id: "r", cells };
  }

  it("savable when description and amount are both set", () => {
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

  it("whitespace-only description still counts as savable when an amount is present", () => {
    // The amount alone earns a slot in storage — once the user has
    // committed an amount the row's not a transient placeholder, even
    // if the description is empty/whitespace.
    expect(
      isRowSavable(
        row({ [descCol.id]: "   ", [amountCol.id]: 5 }),
        sheet.columns,
      ),
    ).toBe(true);
  });

  it("a fully empty row is neither savable nor half-done", () => {
    const r = row({ [dateCol.id]: "2026-05-16" });
    expect(isRowSavable(r, sheet.columns)).toBe(false);
    expect(isRowHalfDone(r, sheet.columns)).toBe(false);
  });

  it("description-only is savable but still half-done", () => {
    const r = row({ [descCol.id]: "Coffee" });
    expect(isRowSavable(r, sheet.columns)).toBe(true);
    expect(isRowHalfDone(r, sheet.columns)).toBe(true);
  });

  it("amount-only is savable but still half-done", () => {
    const r = row({ [amountCol.id]: -12 });
    expect(isRowSavable(r, sheet.columns)).toBe(true);
    expect(isRowHalfDone(r, sheet.columns)).toBe(true);
  });

  it("a typeId-only row is savable so a tag survives clearing description+amount", () => {
    const r: Row = { kind: "user", id: "r", cells: {}, typeId: "type-1" };
    expect(isRowSavable(r, sheet.columns)).toBe(true);
  });

  it("a complete row is not half-done", () => {
    const r = row({ [descCol.id]: "Coffee", [amountCol.id]: -12 });
    expect(isRowHalfDone(r, sheet.columns)).toBe(false);
  });
});

describe("isRowFinished", () => {
  function hist(extra: Partial<Row> = {}): Row {
    return {
      kind: "historic",
      id: "hist:1",
      cells: {},
      historyEntryId: "1",
      ...extra,
    } as Row;
  }

  it("finished when a history row has both a type and a company", () => {
    expect(isRowFinished(hist({ typeId: "t1", companyId: "c1" }))).toBe(true);
  });

  it("finished when a history row has a type and omit-company", () => {
    expect(isRowFinished(hist({ typeId: "t1", noCompany: true }))).toBe(true);
  });

  it("not finished when the type is missing", () => {
    expect(isRowFinished(hist({ companyId: "c1" }))).toBe(false);
    expect(isRowFinished(hist({ noCompany: true }))).toBe(false);
  });

  it("not finished when neither a company nor omit-company is set", () => {
    expect(isRowFinished(hist({ typeId: "t1" }))).toBe(false);
  });

  it("non-history rows are never finished, even fully categorised", () => {
    const user: Row = {
      kind: "user",
      id: "r",
      cells: {},
      typeId: "t1",
      companyId: "c1",
    };
    expect(isRowFinished(user)).toBe(false);
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
        version: 8,
        sheets: [{ id: sheetId, name: "Test", items: [item] }],
        activeSheetId: sheetId,
        accounts: [{ id: TEST_ACCOUNT_ID, name: "Default" }],
        categories: [],
      } as unknown as UserData,
      descId,
      amountId,
    };
  }

  it("strips only the fully empty placeholder rows from the snapshot", () => {
    // Half-done rows (one of description/amount) carry meaningful user
    // input and are kept — refreshing the page shouldn't silently
    // discard a description the user just typed. Only the row with no
    // user-meaningful field at all gets stripped.
    const { data } = build();
    const filtered = userDataWithSavableRows(data);
    expect(firstAB(filtered).rows.map((r) => r.id)).toEqual([
      "complete",
      "half",
    ]);
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

describe("synthesizeHistoryRow", () => {
  const item = createDefaultAccountBudget(TEST_ACCOUNT_ID);
  const dateId = findColumnByType(item.columns, "date")!.id;
  const descId = findColumnByType(item.columns, "description")!.id;
  const amountId = findColumnByType(item.columns, "amount")!.id;
  const completedId = findColumnByType(item.columns, "completed")!.id;

  const baseEntry: HistoryEntry = {
    id: "h1",
    date: "2026-04-12",
    description: "APP STORE APL*Z123",
    amount: -49,
    balance: 0,
    importedAt: 1,
  };

  it("falls back to the raw bank text when no hint or rule matches", () => {
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, []);
    expect(row.cells[descId]).toBe("APP STORE APL*Z123");
    expect(row.cells[completedId]).toBe(true);
    expect(row.typeId).toBeUndefined();
    expect(row.historyEntryId).toBe("h1");
    expect(row.cells[dateId]).toBe("2026-04-12");
    expect(row.cells[amountId]).toBe(-49);
  });

  it("applies the matching rule's labels", () => {
    const rule: MatchRule = {
      id: "r1",
      pattern: "*App Store*",
      description: "App Store",
      typeId: "type-1",
    };
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, [rule]);
    expect(row.cells[descId]).toBe("App Store");
    expect(row.typeId).toBe("type-1");
  });

  it("stamps the matching rule's tags onto the synthesized row", () => {
    const rule: MatchRule = {
      id: "r1",
      pattern: "*App Store*",
      tagIds: ["tag-a", "tag-b"],
    };
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, [rule]);
    expect(row.tagIds).toEqual(["tag-a", "tag-b"]);
  });

  it("unions per-entry tags with the matching rule's tags, deduped", () => {
    const rule: MatchRule = {
      id: "r1",
      pattern: "*App Store*",
      tagIds: ["tag-a", "tag-b"],
    };
    const tagged: HistoryEntry = {
      ...baseEntry,
      userTagIds: ["tag-a", "tag-c"],
    };
    const [row] = synthesizeHistoryRow(tagged, item.columns, {}, [rule]);
    // Entry tags first, then the rule tags not already present.
    expect(row.tagIds).toEqual(["tag-a", "tag-c", "tag-b"]);
  });

  it("leaves tagIds undefined when neither entry nor rule carries tags", () => {
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, []);
    expect(row.tagIds).toBeUndefined();
  });

  it("rule labels override hint labels when both match", () => {
    const hint: MerchantHint = {
      hitCount: 1,
      lastUsedAt: 1,
      typeId: "hint-type",
      description: "Hint label",
    };
    const rule: MatchRule = {
      id: "r1",
      pattern: "*App Store*",
      description: "Rule label",
      typeId: "rule-type",
    };
    // Hint key normalises the bank text: "APP STORE APL*Z123" →
    // lowercase, `*` stripped → "app store apl z123".
    const [row] = synthesizeHistoryRow(
      baseEntry,
      item.columns,
      { "app store apl z123": hint },
      [rule],
    );
    expect(row.cells[descId]).toBe("Rule label");
    expect(row.typeId).toBe("rule-type");
  });

  it("a rule with only a pattern (no labels) falls through to the hint", () => {
    const hint: MerchantHint = {
      hitCount: 1,
      lastUsedAt: 1,
      typeId: "hint-type",
      description: "Hint label",
    };
    const rule: MatchRule = { id: "r1", pattern: "*App Store*" };
    const [row] = synthesizeHistoryRow(
      baseEntry,
      item.columns,
      { "app store apl z123": hint },
      [rule],
    );
    expect(row.cells[descId]).toBe("Hint label");
    expect(row.typeId).toBe("hint-type");
  });

  it("skips a rule whose amountSign excludes the entry's direction", () => {
    const rule: MatchRule = {
      id: "r1",
      pattern: "*App Store*",
      description: "App Store",
      amountSign: "positive",
    };
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, [rule]);
    // Entry is -49, rule wants positive → no overlay.
    expect(row.cells[descId]).toBe("APP STORE APL*Z123");
  });

  it("skips the merchant hint when the entry is flagged hintIgnored", () => {
    const hint: MerchantHint = {
      hitCount: 1,
      lastUsedAt: 1,
      typeId: "hint-type",
      description: "Hint label",
    };
    const ignored: HistoryEntry = { ...baseEntry, hintIgnored: true };
    const [row] = synthesizeHistoryRow(
      ignored,
      item.columns,
      { "app store apl z123": hint },
      [],
    );
    expect(row.cells[descId]).toBe("APP STORE APL*Z123");
    expect(row.typeId).toBeUndefined();
  });

  it("still honours per-entry user overrides when hintIgnored is set", () => {
    const hint: MerchantHint = {
      hitCount: 1,
      lastUsedAt: 1,
      typeId: "hint-type",
      description: "Hint label",
    };
    const ignored: HistoryEntry = {
      ...baseEntry,
      hintIgnored: true,
      userDescription: "User override",
      userTypeId: "user-type",
    };
    const [row] = synthesizeHistoryRow(
      ignored,
      item.columns,
      { "app store apl z123": hint },
      [],
    );
    expect(row.cells[descId]).toBe("User override");
    expect(row.typeId).toBe("user-type");
  });

  it("flags the bank text as the description placeholder when no user override resolved", () => {
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, []);
    // No userDescription / rule.description / hint.description — the
    // cell value falls back to the raw bank text, and the cell tree
    // reads `descriptionPlaceholder` to render the fallback in italic
    // + glyph color and seed the inline editor empty + with the bank
    // text as the placeholder.
    expect(row.descriptionPlaceholder).toBe("APP STORE APL*Z123");
  });

  it("omits the description placeholder when a user override resolved", () => {
    const entry: HistoryEntry = {
      ...baseEntry,
      userDescription: "User override",
    };
    const [row] = synthesizeHistoryRow(entry, item.columns, {}, []);
    expect(row.descriptionPlaceholder).toBeUndefined();
  });

  it("skips the merchant hint when the user explicitly cleared the description", () => {
    // Regression: a user who had `userDescription: "Matboden"` and
    // then cleared it through the edit modal would still see "Matboden"
    // in the cell because the learned merchant hint refilled the row
    // at synthesis time. The empty-string clear signal now short-circuits
    // the rule / hint description chain so the cell falls back to the
    // raw bank text (or the company / type tag rendered upstream).
    const hint: MerchantHint = {
      hitCount: 1,
      lastUsedAt: 1,
      typeId: "hint-type",
      description: "Matboden",
    };
    const cleared: HistoryEntry = { ...baseEntry, userDescription: "" };
    const [row] = synthesizeHistoryRow(
      cleared,
      item.columns,
      { "app store apl z123": hint },
      [],
    );
    expect(row.cells[descId]).toBe("APP STORE APL*Z123");
    expect(row.descriptionPlaceholder).toBe("APP STORE APL*Z123");
    // The descriptionPlaceholder already shows the bank text in the
    // popover's textarea placeholder; surfacing it again as the
    // "original from bank" line below would just duplicate it.
    expect(row.bankDescription).toBeUndefined();
  });

  it("omits the description placeholder when a rule resolves the description", () => {
    const rule: MatchRule = {
      id: "r1",
      pattern: "*App Store*",
      description: "App Store",
      typeId: "type-1",
    };
    const [row] = synthesizeHistoryRow(baseEntry, item.columns, {}, [rule]);
    expect(row.descriptionPlaceholder).toBeUndefined();
  });
});

describe("defaultCompletedForDate", () => {
  const today = "2026-05-18";

  it("marks past dates as done — those are history items the user is back-filling", () => {
    expect(defaultCompletedForDate("2026-05-17", today)).toBe(true);
    expect(defaultCompletedForDate("2020-01-01", today)).toBe(true);
  });

  it("leaves today and future dates open", () => {
    expect(defaultCompletedForDate(today, today)).toBe(false);
    expect(defaultCompletedForDate("2026-05-19", today)).toBe(false);
    expect(defaultCompletedForDate("2030-12-31", today)).toBe(false);
  });

  it("treats missing or empty dates as not-done", () => {
    expect(defaultCompletedForDate(null, today)).toBe(false);
    expect(defaultCompletedForDate(undefined, today)).toBe(false);
    expect(defaultCompletedForDate("", today)).toBe(false);
  });
});

describe("getStandardColumns", () => {
  it("returns the date / description / amount / completed columns from a default budget", () => {
    const item = createDefaultAccountBudget();
    const { dateCol, descCol, amountCol, completedCol } = getStandardColumns(
      item.columns,
    );
    expect(dateCol?.type).toBe("date");
    expect(descCol?.type).toBe("description");
    expect(amountCol?.type).toBe("amount");
    expect(completedCol?.type).toBe("completed");
  });

  it("returns undefined for any missing column type rather than throwing", () => {
    // A column set with only `date` exercises the partial-presence case
    // that future migrations might create.
    const cols = [{ id: "d", type: "date" as const, label: "Date" }];
    const std = getStandardColumns(cols);
    expect(std.dateCol).toBeDefined();
    expect(std.descCol).toBeUndefined();
    expect(std.amountCol).toBeUndefined();
    expect(std.completedCol).toBeUndefined();
  });
});

describe("updateAccountBudget", () => {
  function makeSheets(accountId: string | null = null): Sheet[] {
    const a = createDefaultSheet("A", accountId);
    const b = createDefaultSheet("B", accountId);
    return [a, b];
  }

  it("rebuilds only the matching sheet + item and leaves siblings referentially identical", () => {
    const sheets = makeSheets();
    const target = sheets[1];
    const item = target.items[0] as AccountBudget;
    const next = updateAccountBudget(sheets, target.id, item.id, (i) => ({
      ...i,
      accountId: "acct-x",
    }));
    expect(next).not.toBe(sheets);
    expect(next[0]).toBe(sheets[0]);
    expect(next[1]).not.toBe(sheets[1]);
    const nextItem = next[1].items[0] as AccountBudget;
    expect(nextItem.accountId).toBe("acct-x");
  });

  it("returns the same sheets reference when no sheet matches `sheetId`", () => {
    const sheets = makeSheets();
    const result = updateAccountBudget(sheets, "nope", "nope", (i) => i);
    expect(result).toBe(sheets);
  });

  it("returns the same sheets reference when no item in the sheet matches `itemId`", () => {
    const sheets = makeSheets();
    const result = updateAccountBudget(sheets, sheets[0].id, "nope", () => {
      throw new Error("fn should not be called");
    });
    expect(result).toBe(sheets);
  });

  it("skips items whose type !== 'accountBudget' even when the id matches", () => {
    // Hand-build a sheet whose single item is an AccountsView with the
    // same id we'll target — the helper must refuse to dispatch `fn`
    // because the type doesn't match.
    const view: AccountsView = { id: "shared-id", type: "accountsView" };
    const sheet: Sheet = {
      id: "sh",
      name: "x",
      type: "accounts",
      glyph: "circle",
      color: "#fff",
      description: "",
      items: [view],
    };
    const result = updateAccountBudget([sheet], "sh", "shared-id", () => {
      throw new Error("fn should not be called");
    });
    expect(result).toEqual([sheet]);
  });

  it("returns the same sheets reference when `fn` returns the same item", () => {
    const sheets = makeSheets();
    const item = sheets[0].items[0] as AccountBudget;
    const result = updateAccountBudget(sheets, sheets[0].id, item.id, (i) => i);
    expect(result).toBe(sheets);
  });
});

describe("mapRowsByIds", () => {
  it("returns the same rows reference when the id set is empty", () => {
    const rows: Row[] = [{ id: "r1", cells: {} }];
    const result = mapRowsByIds(rows, new Set(), () => {
      throw new Error("transform should not run");
    });
    expect(result).toBe(rows);
  });

  it("only calls the transform on matching ids", () => {
    const rows: Row[] = [
      { id: "r1", cells: { x: 1 } },
      { id: "r2", cells: { x: 2 } },
      { id: "r3", cells: { x: 3 } },
    ];
    const called: string[] = [];
    const result = mapRowsByIds(rows, new Set(["r1", "r3"]), (r) => {
      called.push(r.id);
      return { ...r, cells: { x: 99 } };
    });
    expect(called.sort()).toEqual(["r1", "r3"]);
    expect(result[0].cells.x).toBe(99);
    expect(result[1]).toBe(rows[1]);
    expect(result[2].cells.x).toBe(99);
  });
});

describe("updateHistoryEntry", () => {
  function makeEntry(id: string, desc: string): HistoryEntry {
    return {
      id,
      date: "2026-05-01",
      description: desc,
      amount: -10,
      importedAt: 0,
    };
  }

  it("rebuilds only the matching entries array and leaves siblings referentially identical", () => {
    const a = makeEntry("a", "alpha");
    const b = makeEntry("b", "bravo");
    const history = { acct1: [a, b], acct2: [makeEntry("c", "charlie")] };
    const next = updateHistoryEntry(history, "acct1", "b", (e) => ({
      ...e,
      userDescription: "Bravo",
    }));
    expect(next).not.toBe(history);
    expect(next.acct2).toBe(history.acct2);
    expect(next.acct1).not.toBe(history.acct1);
    expect(next.acct1[0]).toBe(a);
    expect(next.acct1[1].userDescription).toBe("Bravo");
  });

  it("returns the same history reference when the account has no entries", () => {
    const history: Record<string, HistoryEntry[]> = {};
    const result = updateHistoryEntry(history, "missing", "x", () => {
      throw new Error("fn should not be called");
    });
    expect(result).toBe(history);
  });

  it("returns the same history reference when the entry id is unknown", () => {
    const history = { acct1: [makeEntry("a", "alpha")] };
    const result = updateHistoryEntry(history, "acct1", "missing", () => {
      throw new Error("fn should not be called");
    });
    expect(result).toBe(history);
  });

  it("returns the same history reference when `fn` returns the same entry", () => {
    const a = makeEntry("a", "alpha");
    const history = { acct1: [a] };
    const result = updateHistoryEntry(history, "acct1", "a", (e) => e);
    expect(result).toBe(history);
  });
});

describe("mintBudgetRow", () => {
  it("populates date / description / amount cells and tags series + type", () => {
    const item = createDefaultAccountBudget();
    const row = mintBudgetRow(item.columns, {
      date: "2026-05-16",
      description: "Spotify",
      amount: -149,
      typeId: "type-x",
      seriesId: "ser-x",
    });
    expect(row).not.toBeNull();
    const dateCol = findColumnByType(item.columns, "date");
    const descCol = findColumnByType(item.columns, "description");
    const amountCol = findColumnByType(item.columns, "amount");
    expect(row!.cells[dateCol!.id]).toBe("2026-05-16");
    expect(row!.cells[descCol!.id]).toBe("Spotify");
    expect(row!.cells[amountCol!.id]).toBe(-149);
    expect(row!.seriesId).toBe("ser-x");
    expect(row!.typeId).toBe("type-x");
  });

  it("omits seriesId and typeId when they're not provided", () => {
    const item = createDefaultAccountBudget();
    const row = mintBudgetRow(item.columns, {
      date: "2026-05-16",
      description: "Spotify",
      amount: -149,
    });
    expect(row!.seriesId).toBeUndefined();
    expect(row!.typeId).toBeUndefined();
  });

  it("returns null when any of date / description / amount is missing", () => {
    // A column set missing `amount` exercises the guard so callers can
    // bail without re-implementing the validation.
    const cols = [
      { id: "d", type: "date" as const, label: "Date" },
      { id: "desc", type: "description" as const, label: "Description" },
    ];
    expect(
      mintBudgetRow(cols, { date: "2026-05-16", description: "x", amount: 1 }),
    ).toBeNull();
  });
});
