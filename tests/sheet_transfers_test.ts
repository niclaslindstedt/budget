import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import {
  accountBalance,
  computeAccountBalances,
} from "../src/data/accounts/balance";
import { userDataWithSavableRows } from "../src/data/budget/rows";
import {
  synthesizeHistoryRow,
  synthesizeTransferRow,
  transfersForAccount,
} from "../src/data/budget/synthesis";
import { createDefaultSheet } from "../src/data/sheet";
import type {
  AccountBudget,
  HistoryEntry,
  MerchantHint,
  Transfer,
  UserData,
} from "../src/data/types";

// Build a minimal workspace with two accounts, one budget, and an
// optional list of transfers. Tests use this as a fixture so each
// case can focus on the interesting bit instead of re-stating shape.
function workspace(transfers: Transfer[] = []): UserData {
  const sheet = createDefaultSheet("Checking budget", "checking-id");
  return {
    version: 44,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [
      { id: "checking-id", name: "Checking" },
      { id: "savings-id", name: "Savings" },
    ],
    companies: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers,
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
  };
}

describe("transfersForAccount", () => {
  it("returns transfers on either end of the account, sorted by date", () => {
    const txs: Transfer[] = [
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
    const result = transfersForAccount(txs, "checking-id");
    expect(result.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("returns an empty list for an account that has no transfers", () => {
    const data = workspace();
    expect(transfersForAccount(data.transfers, "checking-id")).toEqual([]);
  });
});

describe("synthesizeTransferRow", () => {
  const accountsById = new Map<string, string>([
    ["checking-id", "Checking"],
    ["savings-id", "Savings"],
  ]);

  function budgetColumns() {
    const sheet = createDefaultSheet("Tmp", "checking-id");
    return (sheet.items[0] as AccountBudget).columns;
  }

  it("renders the from-side amount as negative", () => {
    const tx: Transfer = {
      id: "t1",
      date: "2026-05-01",
      description: "Dinner cover",
      amount: 987,
      fromAccountId: "checking-id",
      toAccountId: "savings-id",
    };
    const cols = budgetColumns();
    const row = synthesizeTransferRow(tx, "checking-id", cols, accountsById);
    const amountCol = cols.find((c) => c.type === "amount")!;
    expect(row.cells[amountCol.id]).toBe(-987);
    expect(row.transferId).toBe("t1");
    expect(row.peerAccountId).toBe("savings-id");
    expect(row.peerAccountName).toBe("Savings");
  });

  it("renders the to-side amount as positive", () => {
    const tx: Transfer = {
      id: "t1",
      date: "2026-05-01",
      description: "Dinner cover",
      amount: 987,
      fromAccountId: "savings-id",
      toAccountId: "checking-id",
    };
    const cols = budgetColumns();
    const row = synthesizeTransferRow(tx, "checking-id", cols, accountsById);
    const amountCol = cols.find((c) => c.type === "amount")!;
    expect(row.cells[amountCol.id]).toBe(987);
    expect(row.peerAccountName).toBe("Savings");
  });

  it("uses 'Unknown account' for a peer id with no matching account", () => {
    const tx: Transfer = {
      id: "t1",
      date: "2026-05-01",
      description: "Mystery",
      amount: 10,
      fromAccountId: "checking-id",
      toAccountId: "gone-id",
    };
    const row = synthesizeTransferRow(
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
    // through the helper to confirm a workspace with transfers
    // still produces the same item.rows on save.
    const saved = userDataWithSavableRows(data);
    const item = saved.sheets[0].items[0] as AccountBudget;
    expect(item.rows.every((r) => r.transferId === undefined)).toBe(true);
  });
});

describe("synthesizeHistoryRow", () => {
  function budgetColumns() {
    const sheet = createDefaultSheet("Tmp", "checking-id");
    return (sheet.items[0] as AccountBudget).columns;
  }
  const entry: HistoryEntry = {
    id: "h1",
    date: "2026-02-26",
    description: "ICA SUPERMARKET 12345",
    amount: -421,
    balance: 1000,
    importedAt: 0,
  };

  it("renders raw bank text when no hint matches", () => {
    const cols = budgetColumns();
    const [row] = synthesizeHistoryRow(entry, cols, {});
    const descCol = cols.find((c) => c.type === "description")!;
    expect(row.cells[descCol.id]).toBe("ICA SUPERMARKET 12345");
    expect(row.typeId).toBeUndefined();
    expect(row.historyEntryId).toBe("h1");
  });

  it("overlays the hint description and typeId when one matches", () => {
    const cols = budgetColumns();
    // Key is the normalised form of the bank text — the synthesizer
    // computes the key itself so callers just pass the hint store.
    const hints: Record<string, MerchantHint> = {
      "ica supermarket": {
        typeId: "type-grocery",
        description: "Groceries",
        hitCount: 1,
        lastUsedAt: 0,
      },
    };
    const [row] = synthesizeHistoryRow(entry, cols, hints);
    const descCol = cols.find((c) => c.type === "description")!;
    expect(row.cells[descCol.id]).toBe("Groceries");
    expect(row.typeId).toBe("type-grocery");
  });

  it("keeps raw description when the hint has no description override", () => {
    const cols = budgetColumns();
    const hints: Record<string, MerchantHint> = {
      "ica supermarket": {
        typeId: "type-grocery",
        hitCount: 1,
        lastUsedAt: 0,
      },
    };
    const [row] = synthesizeHistoryRow(entry, cols, hints);
    const descCol = cols.find((c) => c.type === "description")!;
    expect(row.cells[descCol.id]).toBe("ICA SUPERMARKET 12345");
    expect(row.typeId).toBe("type-grocery");
  });

  it("emits one row per split when entry carries splits", () => {
    const cols = budgetColumns();
    const splitEntry: HistoryEntry = {
      ...entry,
      amount: -5000,
      splits: [
        { description: "Groceries", amount: -2000, typeId: "type-food" },
        { description: "Insurance", amount: -1500 },
        { description: "Bankgiro", amount: -1500 },
      ],
    };
    const rows = synthesizeHistoryRow(splitEntry, cols, {});
    expect(rows).toHaveLength(3);
    const descCol = cols.find((c) => c.type === "description")!;
    const amountCol = cols.find((c) => c.type === "amount")!;
    expect(rows.map((r) => r.cells[descCol.id])).toEqual([
      "Groceries",
      "Insurance",
      "Bankgiro",
    ]);
    expect(rows.map((r) => r.cells[amountCol.id])).toEqual([
      -2000, -1500, -1500,
    ]);
    expect(rows[0].typeId).toBe("type-food");
    expect(rows[1].typeId).toBeUndefined();
    expect(rows.every((r) => r.historyEntryId === "h1")).toBe(true);
    expect(rows.map((r) => r.id)).toEqual([
      "hist:h1:0",
      "hist:h1:1",
      "hist:h1:2",
    ]);
  });

  it("falls back to single-row path when splits is empty", () => {
    const cols = budgetColumns();
    const rows = synthesizeHistoryRow({ ...entry, splits: [] }, cols, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("hist:h1");
  });
});

describe("accountBalance", () => {
  // Fixed reference "today" so the date-filtering branch is
  // deterministic across the suite — the real clock would drift
  // and silently re-categorise rows as past vs. future over time.
  const TODAY = "2026-05-17";

  it("returns 0 for an account with no budget and no transfers", () => {
    const data = workspace();
    expect(accountBalance(data, "savings-id", TODAY)).toBe(0);
  });

  it("sums budget-row amounts plus signed transfer amounts", () => {
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
    // Checking: budget rows 50 + (-20) = 30; transfers +300 (in)
    // − 100 (out) = 200. Total = 230.
    expect(accountBalance(data, "checking-id", TODAY)).toBe(230);
    // Savings: no budget rows; transfers −300 (out) + 100 (in) = −200.
    expect(accountBalance(data, "savings-id", TODAY)).toBe(-200);
  });

  it("excludes future-dated budget rows and transfers", () => {
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
    // Checking: past budget rows 40 + 5 = 45; past transfer
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
    // transfers involving it, so its balance stays at 0.
    expect(accountBalance(data, "savings-id", TODAY)).toBe(0);
    expect(accountBalance(data, "checking-id", TODAY)).toBe(999);
  });

  it("anchors on the latest history balance and adds only newer items", () => {
    // Imported history is authoritative: the latest entry with a
    // stored balance pins the total at that moment, and only events
    // after it contribute.
    const data = workspace();
    data.accounts = data.accounts.map((a) =>
      // Pretend an older import set an opening balance that's gone
      // stale — the latest history entry's stored balance should
      // override the cumulative sum off `openingBalance`.
      a.id === "checking-id" ? { ...a, openingBalance: 50_000 } : a,
    );
    const history: HistoryEntry[] = [
      {
        id: "h-old",
        date: "2026-04-10",
        description: "Older",
        amount: -100,
        balance: 9_900,
        importedAt: 0,
      },
      {
        id: "h-anchor",
        date: "2026-05-01",
        description: "Anchor",
        amount: -500,
        balance: 9_400,
        importedAt: 0,
      },
    ];
    data.history = { "checking-id": history };
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      // Authored row dated before the anchor — absorbed by the snap.
      {
        id: "r-old-authored",
        cells: { [dateCol.id]: "2026-04-15", [amountCol.id]: -10_000 },
      },
      // Authored row dated after the anchor — adds on top.
      {
        id: "r-new-authored",
        cells: { [dateCol.id]: "2026-05-10", [amountCol.id]: -250 },
      },
    ];
    // 9_400 (anchor) + (-250 authored after) = 9_150.
    expect(accountBalance(data, "checking-id", TODAY)).toBe(9_150);
  });

  it("falls back to openingBalance sum when no history entry has a balance", () => {
    // Credit-card-style import: amounts only, no per-row balance.
    // The anchor never engages, so we keep the legacy behaviour.
    const data = workspace();
    data.accounts = data.accounts.map((a) =>
      a.id === "checking-id" ? { ...a, openingBalance: 100 } : a,
    );
    data.history = {
      "checking-id": [
        {
          id: "h-cc",
          date: "2026-05-01",
          description: "Card purchase",
          amount: -30,
          importedAt: 0,
        },
      ],
    };
    expect(accountBalance(data, "checking-id", TODAY)).toBe(70);
  });
});

describe("computeAccountBalances", () => {
  const TODAY = "2026-05-31";

  it("matches accountBalance for every account in one pass", () => {
    // Multi-account workspace mixing opening balances, anchored
    // history, post-anchor amounts, budget rows, and transfers — the
    // four contribution paths `accountBalance` has to thread together.
    const data = workspace([
      {
        id: "t1",
        date: "2026-05-10",
        description: "Move",
        amount: 250,
        fromAccountId: "checking-id",
        toAccountId: "savings-id",
      },
      {
        id: "t2",
        date: "2026-05-20",
        description: "Back",
        amount: 75,
        fromAccountId: "savings-id",
        toAccountId: "checking-id",
      },
      {
        id: "t-future",
        date: "2026-12-01",
        description: "Future",
        amount: 999,
        fromAccountId: "checking-id",
        toAccountId: "savings-id",
      },
    ]);
    data.accounts = data.accounts.map((a) =>
      a.id === "savings-id" ? { ...a, openingBalance: 1_000 } : a,
    );
    data.history = {
      "checking-id": [
        {
          id: "h1",
          date: "2026-05-01",
          description: "Anchor",
          amount: -100,
          balance: 5_000,
          importedAt: 0,
        },
        {
          id: "h2",
          date: "2026-05-15",
          description: "Post",
          amount: -50,
          importedAt: 0,
        },
        {
          id: "h-future",
          date: "2026-06-15",
          description: "Future",
          amount: -999,
          importedAt: 0,
        },
      ],
    };
    const item = data.sheets[0].items[0] as AccountBudget;
    const amountCol = item.columns.find((c) => c.type === "amount")!;
    const dateCol = item.columns.find((c) => c.type === "date")!;
    item.rows = [
      {
        id: "r1",
        cells: { [dateCol.id]: "2026-05-12", [amountCol.id]: -40 },
      },
      {
        id: "r-future",
        cells: { [dateCol.id]: "2026-07-01", [amountCol.id]: -9_999 },
      },
    ];

    const balances = computeAccountBalances(data, TODAY);
    expect(balances.get("checking-id")).toBe(
      accountBalance(data, "checking-id", TODAY),
    );
    expect(balances.get("savings-id")).toBe(
      accountBalance(data, "savings-id", TODAY),
    );
    // Sanity check the concrete numbers so a regression that breaks
    // both helpers in the same direction can't slip through.
    // Checking: anchor 5_000, post-anchor history -50, post-anchor
    // budget row -40, post-anchor outgoing transfer -250, post-anchor
    // incoming transfer +75 = 4_735.
    expect(balances.get("checking-id")).toBe(4_735);
    // Savings: opening 1_000 + incoming 250 - outgoing 75 = 1_175.
    expect(balances.get("savings-id")).toBe(1_175);
  });

  it("returns 0-defaults for accounts with no history, rows, or transfers", () => {
    const data = workspace();
    const balances = computeAccountBalances(data, TODAY);
    expect(balances.get("checking-id")).toBe(0);
    expect(balances.get("savings-id")).toBe(0);
  });
});
