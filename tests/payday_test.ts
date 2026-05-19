import { describe, expect, it } from "vitest";

import { detectPaydayDayOfMonth, nextPaydayDate } from "../src/data/payday";
import type {
  Column,
  HistoryEntry,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";

const dateCol: Column = { id: "d", type: "date", label: "Date" };
const amtCol: Column = { id: "a", type: "amount", label: "Amount" };
const columns: Column[] = [dateCol, amtCol];

function row(seriesId: string, date: string, amount: number): Row {
  return {
    id: `${seriesId}-${date}`,
    cells: { [dateCol.id]: date, [amtCol.id]: amount },
    seriesId,
  };
}

function hist(
  id: string,
  date: string,
  amount: number,
  desc = "SALARY",
): HistoryEntry {
  return { id, date, description: desc, amount, importedAt: 1 };
}

function userData(over: Partial<UserData>): UserData {
  const sheet: Sheet = {
    id: "s",
    name: "Sheet",
    type: "budget",
    glyph: "wallet",
    color: "var(--color-blue)",
    description: "",
    items: [
      {
        id: "ab",
        type: "accountBudget",
        accountId: "acc",
        columns,
        rows:
          over.sheets?.[0]?.items?.[0]?.type === "accountBudget"
            ? (over.sheets[0].items[0] as { rows: Row[] }).rows
            : [],
      },
    ],
  };
  return {
    version: 22,
    sheets: over.sheets ?? [sheet],
    activeSheetId: "s",
    accounts: [{ id: "acc", name: "A" }],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: over.history ?? {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: over.seriesMatchRules ?? [],
    settings: {
      startOfMonth: 1,
      dateFormat: "YYYY-MM-DD",
      shortDateFormat: "DD/MM",
      currency: "kr",
      currencyPosition: "after",
      currencySpace: true,
      decimalSeparator: ".",
      thousandsSeparator: " ",
      formatNumbers: true,
      showCurrency: true,
      showDecimals: false,
      abbreviateNumbers: false,
      alwaysAbbreviateBalance: false,
      fontScale: 1,
      sessionTimeoutMinutes: 60,
      lastSeenChangelogVersion: null,
    },
  };
}

describe("detectPaydayDayOfMonth", () => {
  it("returns fallback with no series", () => {
    const data = userData({});
    expect(detectPaydayDayOfMonth(data, 25)).toBe(25);
  });

  it("returns fallback when no positive-amount series", () => {
    const data = userData({
      sheets: [
        {
          id: "s",
          name: "S",
          type: "budget",
          glyph: "wallet",
          color: "var(--color-blue)",
          description: "",
          items: [
            {
              id: "ab",
              type: "accountBudget",
              accountId: "acc",
              columns,
              rows: [row("rent", "2026-03-27", -5252)],
            },
          ],
        },
      ],
    });
    expect(detectPaydayDayOfMonth(data, 25)).toBe(25);
  });

  it("picks the latest day-of-month across recent salary postings", () => {
    // Series exists in the budget; history has recent salary postings
    // with day-of-month 22, 23, 25 (holidays pushed two of them
    // earlier). Detector should report 25.
    const data = userData({
      sheets: [
        {
          id: "s",
          name: "S",
          type: "budget",
          glyph: "wallet",
          color: "var(--color-blue)",
          description: "",
          items: [
            {
              id: "ab",
              type: "accountBudget",
              accountId: "acc",
              columns,
              rows: [
                row("salary", "2026-01-25", 35_000),
                row("salary", "2026-02-25", 35_000),
                row("salary", "2026-03-25", 35_000),
              ],
            },
          ],
        },
      ],
      history: {
        acc: [
          hist("a", "2026-01-25", 35_000),
          hist("b", "2026-02-23", 35_000),
          hist("c", "2026-03-22", 35_000),
        ],
      },
    });
    expect(detectPaydayDayOfMonth(data, 1)).toBe(25);
  });

  it("clamps to [1, 28]", () => {
    const data = userData({
      sheets: [
        {
          id: "s",
          name: "S",
          type: "budget",
          glyph: "wallet",
          color: "var(--color-blue)",
          description: "",
          items: [
            {
              id: "ab",
              type: "accountBudget",
              accountId: "acc",
              columns,
              rows: [row("salary", "2026-01-30", 35_000)],
            },
          ],
        },
      ],
      history: {
        acc: [hist("a", "2026-01-30", 35_000)],
      },
    });
    expect(detectPaydayDayOfMonth(data, 25)).toBe(28);
  });
});

describe("nextPaydayDate", () => {
  it("returns this month's payday when today is before it", () => {
    expect(nextPaydayDate(25, "2026-04-10")).toBe("2026-04-25");
  });

  it("returns this month's payday when today equals payday", () => {
    expect(nextPaydayDate(25, "2026-04-25")).toBe("2026-04-25");
  });

  it("rolls to next month when past the payday", () => {
    expect(nextPaydayDate(25, "2026-04-26")).toBe("2026-05-25");
  });

  it("rolls year boundary", () => {
    expect(nextPaydayDate(25, "2026-12-26")).toBe("2027-01-25");
  });

  it("clamps payday day to [1, 28]", () => {
    expect(nextPaydayDate(31, "2026-04-10")).toBe("2026-04-28");
  });
});
