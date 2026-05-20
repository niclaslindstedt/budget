import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import { createDefaultSheet } from "../src/data/sheet";
import type { EntryType, Transaction, UserData } from "../src/data/types";
import { validateUserData } from "../src/data/validate";

// A known EntryType the workspace can reference. Linked to the catch-all
// preset category so the validator accepts it without seeding a custom
// category alongside.
const knownType: EntryType = {
  id: "type-1",
  name: "Dinner",
  color: "#e06c75",
  glyph: "utensils",
  categoryId: "preset-cat-other",
};

// Build a minimal valid workspace then let each case mutate the
// `transactions` array. Keeps the irrelevant fields off-screen.
function workspaceWithTransactions(transactions: unknown[]): unknown {
  const sheet = createDefaultSheet("Checking", "a1");
  const base: UserData = {
    version: 29,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [
      { id: "a1", name: "Checking" },
      { id: "a2", name: "Savings" },
    ],
    categories: [],
    types: [knownType],
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    settings: { ...DEFAULT_SETTINGS },
  };
  return { ...base, transactions };
}

const validTx: Transaction = {
  id: "t1",
  date: "2026-05-01",
  description: "Dinner cover",
  amount: 987,
  fromAccountId: "a1",
  toAccountId: "a2",
};

describe("validateUserData — transactions", () => {
  it("accepts a fully populated transaction", () => {
    const result = validateUserData(
      workspaceWithTransactions([
        { ...validTx, typeId: null, completed: true },
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transactions[0].completed).toBe(true);
    }
  });

  it("rejects a transaction missing its date", () => {
    const { date: _drop, ...rest } = validTx;
    void _drop;
    const result = validateUserData(workspaceWithTransactions([rest]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("date");
    }
  });

  it("rejects a non-string fromAccountId", () => {
    const result = validateUserData(
      workspaceWithTransactions([{ ...validTx, fromAccountId: 42 }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("fromAccountId");
    }
  });

  it("rejects a non-finite amount", () => {
    const result = validateUserData(
      workspaceWithTransactions([{ ...validTx, amount: Number.NaN }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("amount");
    }
  });

  it("rejects a fromAccountId that doesn't match any known account", () => {
    const result = validateUserData(
      workspaceWithTransactions([{ ...validTx, fromAccountId: "ghost" }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unknown account");
    }
  });

  it("rejects duplicate transaction ids", () => {
    const result = validateUserData(
      workspaceWithTransactions([validTx, validTx]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("duplicate id");
    }
  });

  it("silently drops a typeId that no longer exists", () => {
    const result = validateUserData(
      workspaceWithTransactions([{ ...validTx, typeId: "gone" }]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.transactions[0].typeId).toBeNull();
    }
  });

  it("accepts an empty transactions array", () => {
    const result = validateUserData(workspaceWithTransactions([]));
    expect(result.ok).toBe(true);
  });
});

describe("validateUserData — accounts metadata", () => {
  it("accepts an account with full bank details", () => {
    const sheet = createDefaultSheet("Checking", "a1");
    const data: UserData = {
      version: 29,
      sheets: [sheet],
      activeSheetId: sheet.id,
      accounts: [
        {
          id: "a1",
          name: "Checking",
          description: "Daily spending",
          glyph: "wallet",
          color: "#61afef",
          bank: "Swedbank",
          clearing: "8327",
          accountNumber: "123 456 789",
          iban: "SE45 5000 0000 0583 9825 7466",
          bic: "SWEDSESS",
          currency: "SEK",
        },
      ],
      categories: [],
      types: [],
      hiddenPresetTypeIds: [],
      hiddenPresetCategoryIds: [],
      transactions: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accounts[0].bank).toBe("Swedbank");
      expect(result.value.accounts[0].iban).toBe(
        "SE45 5000 0000 0583 9825 7466",
      );
    }
  });

  it("drops an unknown glyph silently rather than failing", () => {
    const sheet = createDefaultSheet("Checking", "a1");
    const data = {
      version: 29,
      sheets: [sheet],
      activeSheetId: sheet.id,
      accounts: [{ id: "a1", name: "Checking", glyph: "not-a-real-glyph" }],
      categories: [],
      types: [],
      hiddenPresetTypeIds: [],
      hiddenPresetCategoryIds: [],
      transactions: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.accounts[0].glyph).toBeUndefined();
    }
  });

  it("drops merchant hints whose typeId no longer exists, and dedups dismissal arrays", () => {
    const sheet = createDefaultSheet("Checking", "a1");
    const data = {
      version: 29,
      sheets: [sheet],
      activeSheetId: sheet.id,
      accounts: [{ id: "a1", name: "Checking" }],
      categories: [
        { id: "c1", name: "Food", color: "#e06c75", icon: "utensils" },
      ],
      types: [knownType],
      hiddenPresetTypeIds: [],
      hiddenPresetCategoryIds: [],
      transactions: [],
      history: {},
      historyImports: {},
      merchantHints: {
        "ica maxi": { typeId: knownType.id, hitCount: 3, lastUsedAt: 1 },
        "ghost merchant": { typeId: "deleted", hitCount: 1, lastUsedAt: 2 },
      },
      recurringDismissals: ["spotify", "", "spotify"],
      transferCollapseDismissals: ["pair1|pair2"],
      matchRules: [],
      seriesMatchRules: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.merchantHints).sort()).toEqual([
        "ica maxi",
      ]);
      expect(result.value.merchantHints["ica maxi"].hitCount).toBe(3);
      expect(result.value.recurringDismissals).toEqual(["spotify"]);
      expect(result.value.transferCollapseDismissals).toEqual(["pair1|pair2"]);
    }
  });
});
