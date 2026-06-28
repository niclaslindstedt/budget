import { describe, expect, it } from "vitest";

import {
  duplicateRemovals,
  findDuplicateImports,
} from "../src/data/accounts/duplicates";
import { describeActionSubject } from "../src/data/action-summary";
import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type { Account, HistoryEntry, UserData } from "../src/data/types";

function account(id: string, name = id): Account {
  return { id, name };
}

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-04-15",
    description: "ICA Kvantum Lund",
    amount: -1200,
    importedAt: 0,
    ...over,
  };
}

function data(
  accounts: Account[],
  history: Record<string, HistoryEntry[]>,
): UserData {
  return { accounts, history } as unknown as UserData;
}

describe("findDuplicateImports", () => {
  it("flags the same transaction imported into two accounts", () => {
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1" })],
        b: [entry({ id: "b1" })],
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].accounts.map((x) => x.accountId).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("ignores a transaction that lives in only one account", () => {
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1" })],
        b: [entry({ id: "b1", description: "Spotify AB", amount: -119 })],
      }),
    );
    expect(groups).toHaveLength(0);
  });

  it("does not group opposite-sign legs of a transfer", () => {
    // A Swish between own accounts posts as -500 on one side and +500 on
    // the other — same date and description, opposite amount. The signed
    // signature keeps them apart so genuine transfers aren't flagged.
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", description: "Swish Anna", amount: -500 })],
        b: [entry({ id: "b1", description: "Swish Anna", amount: 500 })],
      }),
    );
    expect(groups).toHaveLength(0);
  });

  it("skips entries collapsed into a transfer", () => {
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", collapsedIntoTransferId: "t1" })],
        b: [entry({ id: "b1" })],
      }),
    );
    expect(groups).toHaveLength(0);
  });

  it("flags small-amount duplicates (no minimum-amount floor)", () => {
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", amount: -50, description: "Kiosk" })],
        b: [entry({ id: "b1", amount: -50, description: "Kiosk" })],
      }),
    );
    expect(groups).toHaveLength(1);
  });

  it("suggests the account where the balance reconciles", () => {
    // Account "a" carries a coherent chain: 5000 → 3800 (the -1200
    // ICA charge lands on a balance another entry explains). Account
    // "b" has the same charge land on 9999 with nothing leaving the
    // balance at 11199 — an unexplained jump, so it's the mis-import.
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [
          entry({ id: "a0", amount: -800, balance: 5000, date: "2026-04-10" }),
          entry({ id: "a1", amount: -1200, balance: 3800 }),
        ],
        b: [
          entry({ id: "b0", amount: -300, balance: 2000, date: "2026-04-12" }),
          entry({ id: "b1", amount: -1200, balance: 9999 }),
        ],
      }),
    );
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.suggestedOwnerId).toBe("a");
    const a = group.accounts.find((x) => x.accountId === "a");
    const b = group.accounts.find((x) => x.accountId === "b");
    expect(a?.fits).toBe(true);
    expect(b?.fits).toBe(false);
  });

  it("does not treat a self-consistent mis-imported block as fitting", () => {
    // The mis-import is a whole foreign statement fragment, so its
    // entries chain to EACH OTHER perfectly (5000 → 3800). A naive
    // "is this pre-balance present anywhere?" test reconciles that block
    // against itself and reports it fits. The real chain must be walked
    // forward from the account's own opening balance: "b"'s native chain
    // (2300 → 2000 → 1300) never reaches the foreign block, so the stray
    // copy is correctly flagged as not fitting and "a" is suggested.
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [
          entry({ id: "a0", amount: -800, balance: 5000, date: "2026-04-10" }),
          entry({ id: "a1", amount: -1200, balance: 3800, date: "2026-04-15" }),
        ],
        b: [
          entry({
            id: "b0",
            amount: -300,
            balance: 2000,
            date: "2026-04-02",
            description: "Hyresavi",
          }),
          entry({
            id: "b1",
            amount: -700,
            balance: 1300,
            date: "2026-04-05",
            description: "Elnät",
          }),
          entry({
            id: "bf0",
            amount: -800,
            balance: 5000,
            date: "2026-04-10",
            description: "Vattenfall",
          }),
          entry({
            id: "bf1",
            amount: -1200,
            balance: 3800,
            date: "2026-04-15",
          }),
        ],
      }),
    );
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.accounts.find((x) => x.accountId === "a")?.fits).toBe(true);
    expect(group.accounts.find((x) => x.accountId === "b")?.fits).toBe(false);
    expect(group.suggestedOwnerId).toBe("a");
  });

  it("reports null fit when no balance is present (credit-card export)", () => {
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1" })],
        b: [entry({ id: "b1" })],
      }),
    );
    expect(groups[0].accounts.every((x) => x.fits === null)).toBe(true);
  });
});

describe("duplicateRemovals", () => {
  it("removes every copy except the chosen owner's", () => {
    const [group] = findDuplicateImports(
      data([account("a"), account("b"), account("c")], {
        a: [entry({ id: "a1" })],
        b: [entry({ id: "b1" })],
        c: [entry({ id: "c1" })],
      }),
    );
    const removals = duplicateRemovals(group, "a");
    expect(removals.map((r) => `${r.accountId}:${r.entryId}`).sort()).toEqual([
      "b:b1",
      "c:c1",
    ]);
  });

  it("returns nothing when the owner isn't part of the group", () => {
    const [group] = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1" })],
        b: [entry({ id: "b1" })],
      }),
    );
    expect(duplicateRemovals(group, "nope")).toEqual([]);
  });
});

describe("resolveDuplicateImports reducer", () => {
  it("deletes the listed entries and re-anchors the opening balance", () => {
    const prev: UserData = {
      ...freshUserData(),
      accounts: [account("a"), account("b")],
      history: {
        a: [entry({ id: "a1", amount: -1200, balance: 3800 })],
        b: [
          entry({ id: "b0", amount: -300, balance: 2000, date: "2026-04-01" }),
          entry({ id: "b1", amount: -1200, balance: 9999 }),
        ],
      },
    };
    const next = reducer(prev, {
      type: "resolveDuplicateImports",
      removals: [{ accountId: "b", entryId: "b1" }],
    });
    expect(next.history.b.map((e) => e.id)).toEqual(["b0"]);
    expect(next.history.a.map((e) => e.id)).toEqual(["a1"]);
    // b's earliest remaining entry is b0 (2000, after a -300 charge), so
    // the opening balance re-derives to 2300.
    expect(next.accounts.find((x) => x.id === "b")?.openingBalance).toBe(2300);
  });

  it("is a no-op for an empty removal list", () => {
    const prev: UserData = {
      ...freshUserData(),
      accounts: [account("a")],
      history: { a: [entry({ id: "a1" })] },
    };
    expect(
      reducer(prev, { type: "resolveDuplicateImports", removals: [] }),
    ).toBe(prev);
  });

  it("counts the removed entries in the action summary", () => {
    const prev = freshUserData();
    expect(
      describeActionSubject(
        {
          type: "resolveDuplicateImports",
          removals: [
            { accountId: "b", entryId: "b1" },
            { accountId: "c", entryId: "c1" },
          ],
        },
        prev,
        prev,
        "en",
      ),
    ).toEqual({ kind: "count", value: 2 });
  });
});
