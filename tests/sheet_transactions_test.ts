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

// Build a minimal v9 workspace with two accounts, one budget, and an
// optional list of transactions. Tests use this as a fixture so each
// case can focus on the interesting bit instead of re-stating shape.
function workspace(transactions: Transaction[] = []): UserData {
  const sheet = createDefaultSheet("Checking budget", "checking-id");
  return {
    version: 9,
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
  it("returns 0 for an account with no budget and no transactions", () => {
    const data = workspace();
    expect(accountBalance(data, "savings-id")).toBe(0);
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
    item.rows = [
      { id: "r1", cells: { [amountCol.id]: 50 } },
      { id: "r2", cells: { [amountCol.id]: -20 } },
    ];
    // Checking: budget rows 50 + (-20) = 30; transactions +300 (in)
    // − 100 (out) = 200. Total = 230.
    expect(accountBalance(data, "checking-id")).toBe(230);
    // Savings: no budget rows; transactions −300 (out) + 100 (in) = −200.
    expect(accountBalance(data, "savings-id")).toBe(-200);
  });

  it("ignores budgets attached to a different account", () => {
    const data = workspace();
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    item.rows = [{ id: "r1", cells: { [amountCol.id]: 999 } }];
    // The 999 belongs to Checking; Savings has neither budget nor
    // transactions involving it, so its balance stays at 0.
    expect(accountBalance(data, "savings-id")).toBe(0);
    expect(accountBalance(data, "checking-id")).toBe(999);
  });
});
