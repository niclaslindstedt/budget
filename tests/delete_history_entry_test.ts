import { describe, expect, it } from "vitest";

import { detectTransferCandidates } from "../src/data/accounts/transfer-collapse";
import { reducer } from "../src/data/reducer";
import { newId } from "../src/data/sheet";
import type { HistoryEntry, UserData } from "../src/data/types";
import { freshUserData } from "../src/storage/local";

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: newId(),
    date: "2026-05-01",
    description: "x",
    amount: 0,
    importedAt: 0,
    ...overrides,
  };
}

describe("deleteHistoryEntry reducer", () => {
  it("removes a single bank-history entry from the account", () => {
    const state: UserData = {
      ...freshUserData(),
      accounts: [{ id: "acc-1", name: "Checking" }],
      history: {
        "acc-1": [
          entry({ id: "h1", date: "2026-05-01", amount: -100 }),
          entry({ id: "h2", date: "2026-05-02", amount: -50 }),
        ],
      },
    };

    const after = reducer(state, {
      type: "deleteHistoryEntry",
      accountId: "acc-1",
      entryId: "h1",
    });

    expect(after.history["acc-1"].map((e) => e.id)).toEqual(["h2"]);
  });

  it("is a no-op for an unknown account or entry", () => {
    const state: UserData = {
      ...freshUserData(),
      accounts: [{ id: "acc-1", name: "Checking" }],
      history: { "acc-1": [entry({ id: "h1" })] },
    };

    expect(
      reducer(state, {
        type: "deleteHistoryEntry",
        accountId: "acc-1",
        entryId: "nope",
      }),
    ).toBe(state);
    expect(
      reducer(state, {
        type: "deleteHistoryEntry",
        accountId: "ghost",
        entryId: "h1",
      }),
    ).toBe(state);
  });

  it("re-derives the opening balance when the earliest entry is deleted", () => {
    const state: UserData = {
      ...freshUserData(),
      accounts: [{ id: "acc-1", name: "Checking", openingBalance: 1100 }],
      // Earliest row carries a running balance of 1000 after a -100 amount,
      // so the opening balance before it was 1100. Deleting it should
      // re-anchor the opening balance to the next-earliest row (900 + 50).
      history: {
        "acc-1": [
          entry({ id: "h1", date: "2026-05-01", amount: -100, balance: 1000 }),
          entry({ id: "h2", date: "2026-05-02", amount: -50, balance: 950 }),
        ],
      },
    };

    const after = reducer(state, {
      type: "deleteHistoryEntry",
      accountId: "acc-1",
      entryId: "h1",
    });

    expect(after.accounts[0].openingBalance).toBe(1000);
  });

  it("restores the partner leg of a removed collapsed transfer", () => {
    // A collapsed transfer ties a leg on acc-1 to a leg on acc-2, both
    // hidden + backref'd to the transfer. Deleting one leg drops the
    // transfer — the partner must come back, not stay stranded hidden
    // with a dangling backref. Mirrors `cutAccountHistory`.
    const state: UserData = {
      ...freshUserData(),
      accounts: [
        { id: "acc-1", name: "Checking" },
        { id: "acc-2", name: "Savings" },
      ],
      history: {
        "acc-1": [
          entry({
            id: "h-from",
            amount: -100,
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
        ],
        "acc-2": [
          entry({
            id: "h-to",
            amount: 100,
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
        ],
      },
      transfers: [
        {
          id: "t1",
          date: "2026-05-01",
          description: "to savings",
          amount: 100,
          fromAccountId: "acc-1",
          toAccountId: "acc-2",
        },
      ],
    };

    const after = reducer(state, {
      type: "deleteHistoryEntry",
      accountId: "acc-1",
      entryId: "h-from",
    });

    // The transfer is gone and the deleted leg trimmed.
    expect(after.transfers).toHaveLength(0);
    expect(after.history["acc-1"]).toHaveLength(0);
    // The partner leg on acc-2 is back — visible and detectable.
    const partner = after.history["acc-2"][0];
    expect(partner.id).toBe("h-to");
    expect(partner.hidden).toBeUndefined();
    expect(partner.collapsedIntoTransferId).toBeUndefined();

    // And it re-pairs: a fresh acc-1 import surfaces a candidate again.
    const candidates = detectTransferCandidates({
      history: {
        ...after.history,
        "acc-1": [entry({ id: "h-from2", amount: -100 })],
      },
    });
    expect(candidates).toHaveLength(1);
  });
});
