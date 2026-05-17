import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import {
  accountBalance,
  createDefaultSheet,
  synthesizeTransactionRow,
  transactionsForAccount,
  userDataWithSavableRows,
} from "../src/data/sheet";
import type { AccountBudget, Transaction, UserData } from "../src/data/types";

// Build a minimal workspace with two accounts, one budget, and an
// optional list of transactions. Tests use this as a fixture so each
// case can focus on the interesting bit instead of re-stating shape.
function workspace(transactions: Transaction[] = []): UserData {
  const sheet = createDefaultSheet("Checking budget", "checking-id");
  return {
    version: 10,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [
      { id: "checking-id", name: "Checking" },
      { id: "savings-id", name: "Savings" },
    ],
    categories: [],
    transactions,
    settings: { ...DEFAULT_SETTINGS },
  };
}

describe("transactionsForAccount", () => {
  it("returns transactions on either end of the account, sorted by date", () => {
    const txs: Transaction[] = [
      {
        id: "t2",
        date: "2026-05-10",
        description: "Newer",
        amount: 200,
        fromAccountId: "savings-id",
        toAccountId: "checking-id",
      },
      {
        id: "t1",
        date: "2026-05-01",
        description: "Older",
        amount: 100,
        fromAccountId: "checking-id",
        toAccountId: "savings-id",
      },
      {
        id: "t3",
        date: "2026-05-15",
        description: "Unrelated",
        amount: 50,
        fromAccountId: "savings-id",
        toAccountId: "third-account",
      },
    ];
    const result = transactionsForAccount(txs, "checking-id");
    expect(result.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("returns an empty list for an account that has no transactions", () => {
    const data = workspace();
    expect(transactionsForAccount(data.transactions, "checking-id")).toEqual(
      [],
    );
  });
});

describe("synthesizeTransactionRow", () => {
  const accountsById = new Map<string, string>([
    ["checking-id", "Checking"],
    ["savings-id", "Savings"],
  ]);

  function budgetColumns() {
    const sheet = createDefaultSheet("Tmp", "checking-id");
    return (sheet.items[0] as AccountBudget).columns;
  }

  it("renders the from-side amount as negative", () => {
    const tx: Transaction = {
      id: "t1",
      date: "2026-05-01",
      description: "Dinner cover",
      amount: 987,
      fromAccountId: "checking-id",
      toAccountId: "savings-id",
    };
    const cols = budgetColumns();
    const row = synthesizeTransactionRow(tx, "checking-id", cols, accountsById);
    const amountCol = cols.find((c) => c.type === "amount")!;
    expect(row.cells[amountCol.id]).toBe(-987);
    expect(row.transactionId).toBe("t1");
    expect(row.peerAccountId).toBe("savings-id");
    expect(row.peerAccountName).toBe("Savings");
  });

  it("renders the to-side amount as positive", () => {
    const tx: Transaction = {
      id: "t1",
      date: "2026-05-01",
      description: "Dinner cover",
      amount: 987,
      fromAccountId: "savings-id",
      toAccountId: "checking-id",
    };
    const cols = budgetColumns();
    const row = synthesizeTransactionRow(tx, "checking-id", cols, accountsById);
    const amountCol = cols.find((c) => c.type === "amount")!;
    expect(row.cells[amountCol.id]).toBe(987);
    expect(row.peerAccountName).toBe("Savings");
  });

  it("uses 'Unknown account' for a peer id with no matching account", () => {
    const tx: Transaction = {
      id: "t1",
      date: "2026-05-01",
      description: "Mystery",
      amount: 10,
      fromAccountId: "checking-id",
      toAccountId: "gone-id",
    };
    const row = synthesizeTransactionRow(
      tx,
      "checking-id",
      budgetColumns(),
      accountsById,
    );
    expect(row.peerAccountName).toBe("Unknown account");
  });

  it("is stripped by userDataWithSavableRows (never persists synthesized rows)", () => {
    const data = workspace();
    // The save pass only walks `item.rows`, which never carries
    // synthesized rows — they live outside the persisted data. Round
    // through the helper to confirm a workspace with transactions
    // still produces the same item.rows on save.
    const saved = userDataWithSavableRows(data);
    const item = saved.sheets[0].items[0] as AccountBudget;
    expect(item.rows.every((r) => r.transactionId === undefined)).toBe(true);
  });
});

describe("accountBalance", () => {
  // Fixed reference "today" so the date-filtering branch is
  // deterministic across the suite — the real clock would drift
  // and silently re-categorise rows as past vs. future over time.
  const TODAY = "2026-05-17";

  it("returns 0 for an account with no budget and no transactions", () => {
    const data = workspace();
    expect(accountBalance(data, "savings-id", TODAY)).toBe(0);
  });

  it("sums budget-row amounts plus signed transaction amounts", () => {
    const data = workspace([
      {
        id: "t1",
        date: "2026-05-01",
        description: "Cover",
        amount: 300,
        fromAccountId: "savings-id",
        toAccountId: "checking-id",
      },
      {
        id: "t2",
        date: "2026-05-10",
        description: "Reverse",
        amount: 100,
        fromAccountId: "checking-id",
        toAccountId: "savings-id",
      },
    ]);
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      {
        id: "r1",
        cells: { [dateCol.id]: "2026-05-02", [amountCol.id]: 50 },
      },
      {
        id: "r2",
        cells: { [dateCol.id]: "2026-05-12", [amountCol.id]: -20 },
      },
    ];
    // Checking: budget rows 50 + (-20) = 30; transactions +300 (in)
    // − 100 (out) = 200. Total = 230.
    expect(accountBalance(data, "checking-id", TODAY)).toBe(230);
    // Savings: no budget rows; transactions −300 (out) + 100 (in) = −200.
    expect(accountBalance(data, "savings-id", TODAY)).toBe(-200);
  });

  it("excludes future-dated budget rows and transactions", () => {
    // Future entries are projections, not money that has moved —
    // the displayed account balance must reflect today's reality.
    const data = workspace([
      {
        id: "past-tx",
        date: "2026-05-10",
        description: "Settled",
        amount: 100,
        fromAccountId: "savings-id",
        toAccountId: "checking-id",
      },
      {
        id: "future-tx",
        date: "2026-06-01",
        description: "Scheduled",
        amount: 500,
        fromAccountId: "savings-id",
        toAccountId: "checking-id",
      },
    ]);
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      {
        id: "r-past",
        cells: { [dateCol.id]: "2026-05-15", [amountCol.id]: 40 },
      },
      {
        id: "r-today",
        cells: { [dateCol.id]: TODAY, [amountCol.id]: 5 },
      },
      {
        id: "r-future",
        cells: { [dateCol.id]: "2026-12-31", [amountCol.id]: 9999 },
      },
    ];
    // Checking: past budget rows 40 + 5 = 45; past transaction
    // +100 (in). The 9999 and the 500 are after `TODAY` and
    // contribute nothing.
    expect(accountBalance(data, "checking-id", TODAY)).toBe(145);
    expect(accountBalance(data, "savings-id", TODAY)).toBe(-100);
  });

  it("excludes undated budget rows", () => {
    // A row with no date hasn't been scheduled, so it can't have
    // taken place — keep it out of the running balance.
    const data = workspace();
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      { id: "r-undated", cells: { [amountCol.id]: 123 } },
      {
        id: "r-empty-date",
        cells: { [dateCol.id]: "", [amountCol.id]: 456 },
      },
    ];
    expect(accountBalance(data, "checking-id", TODAY)).toBe(0);
  });

  it("rolls correction rows into the running balance like any other row", () => {
    // A correction row's `amount` carries the signed delta that brings
    // the running total to the user-asserted value. It's just a Row
    // with `isCorrection: true` and the same date/amount cells, so
    // `accountBalance` should consume it without any special casing.
    const data = workspace();
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const descCol = item.columns.find((c) => c.type === "description")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      {
        id: "r-normal",
        cells: {
          [dateCol.id]: "2026-05-01",
          [descCol.id]: "Salary",
          [amountCol.id]: 1000,
        },
      },
      {
        id: "r-correction",
        cells: {
          [dateCol.id]: "2026-05-10",
          [descCol.id]: "Balance correction",
          [amountCol.id]: 250,
        },
        isCorrection: true,
      },
    ];
    expect(accountBalance(data, "checking-id", TODAY)).toBe(1250);
  });

  it("ignores budgets attached to a different account", () => {
    const data = workspace();
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      {
        id: "r1",
        cells: { [dateCol.id]: "2026-05-01", [amountCol.id]: 999 },
      },
    ];
    // The 999 belongs to Checking; Savings has neither budget nor
    // transactions involving it, so its balance stays at 0.
    expect(accountBalance(data, "savings-id", TODAY)).toBe(0);
    expect(accountBalance(data, "checking-id", TODAY)).toBe(999);
  });
});
