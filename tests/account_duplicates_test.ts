import { describe, expect, it } from "vitest";

import {
  duplicateRemovals,
  findDuplicateImports,
  historyContext,
  ignoreRulesForGroup,
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
    // A verbatim mis-import copies the statement row's balance too, so
    // both copies carry the SAME balance (3800) — that shared balance is
    // what lets them group at all. Account "a" carries a coherent chain
    // (5000 → 3800: the -1200 ICA charge lands on a balance another entry
    // explains). Account "b"'s native chain (2300 → 2000) never reaches
    // 3800, so its copy is the stray one.
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [
          entry({ id: "a0", amount: -800, balance: 5000, date: "2026-04-10" }),
          entry({ id: "a1", amount: -1200, balance: 3800 }),
        ],
        b: [
          entry({ id: "b0", amount: -300, balance: 2000, date: "2026-04-12" }),
          entry({ id: "b1", amount: -1200, balance: 3800 }),
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

  it("does not flag a coincidence whose balances differ", () => {
    // The core false-positive guard: a recurring card payment that
    // legitimately posts the same amount on the same day to two accounts
    // lands each account on its own running total, so the balances
    // differ. Only date + description + amount match — not balance — so
    // the pair is NOT flagged.
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", amount: -99, balance: 4200 })],
        b: [entry({ id: "b1", amount: -99, balance: 8800 })],
      }),
    );
    expect(groups).toHaveLength(0);
  });

  it("flags balance-less copies but not when only one carries a balance", () => {
    // Two credit-card exports with no running balance still match each
    // other (both bucket under the "no balance" sentinel)...
    const both = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", amount: -250, description: "Klarna" })],
        b: [entry({ id: "b1", amount: -250, description: "Klarna" })],
      }),
    );
    expect(both).toHaveLength(1);
    // ...but a balance-less copy never matches one that carries a balance,
    // since the balance segments ("nb" vs the öre figure) differ.
    const mixed = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", amount: -250, description: "Klarna" })],
        b: [
          entry({
            id: "b1",
            amount: -250,
            description: "Klarna",
            balance: 700,
          }),
        ],
      }),
    );
    expect(mixed).toHaveLength(0);
  });

  it("skips entries matching a duplicate-ignore rule", () => {
    const base = data([account("a"), account("b")], {
      a: [entry({ id: "a1", description: "Kortbetalning", amount: -349 })],
      b: [entry({ id: "b1", description: "Kortbetalning", amount: -349 })],
    });
    expect(findDuplicateImports(base)).toHaveLength(1);
    // Same data, but the user has ignored this exact charge — gone.
    const ignored = {
      ...base,
      duplicateIgnores: [{ description: "Kortbetalning", amount: -349 }],
    } as unknown as UserData;
    expect(findDuplicateImports(ignored)).toHaveLength(0);
    // A rule with a different amount does not suppress it.
    const otherAmount = {
      ...base,
      duplicateIgnores: [{ description: "Kortbetalning", amount: -350 }],
    } as unknown as UserData;
    expect(findDuplicateImports(otherAmount)).toHaveLength(1);
  });

  it("treats a copy with a chaining predecessor in both accounts as fitting both", () => {
    // A whole statement imported into two accounts leaves each copy with a
    // real predecessor inside its own account (the line above it on the
    // mis-imported statement). The one-step balance check can't tell those
    // apart — both fit — so ownership falls to the tie-breakers (and, in
    // the app, to the user picking from the surrounding-history view). This
    // is the deliberate trade for not walking the whole chain; the strong
    // date+description+amount+balance match is what flags the pair at all.
    const groups = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [
          entry({
            id: "a_prev",
            amount: -800,
            balance: 5000,
            date: "2026-04-10",
            description: "Hyra",
          }),
          entry({
            id: "a_x",
            amount: -1200,
            balance: 3800,
            date: "2026-04-15",
          }),
        ],
        b: [
          entry({
            id: "b_prev",
            amount: -200,
            balance: 5000,
            date: "2026-04-12",
            description: "Elnät",
          }),
          entry({
            id: "b_x",
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
    expect(group.accounts.find((x) => x.accountId === "b")?.fits).toBe(true);
  });

  it("flags the copy whose predecessor balance is missing", () => {
    // The real-world case: the Dagens Nyheter charge (-410 → 9997)
    // genuinely follows the salary deposit (9000 → 10407) in "utgift"
    // (10407 - 410 = 9997), so its predecessor balance 10407 exists there
    // and it fits. The same charge mis-imported into "lon" lands on a
    // pre-balance (10407) no "lon" entry ever held, so it does not fit and
    // "utgift" is correctly suggested. No whole-history walk is needed —
    // and the discontinuity earlier in "utgift" (1000 → 10407) is
    // irrelevant to the one-step check.
    const groups = findDuplicateImports(
      data([account("utgift"), account("lon")], {
        utgift: [
          entry({
            id: "u_open",
            amount: -500,
            balance: 1000,
            date: "2026-01-05",
            description: "Startköp",
          }),
          entry({
            id: "u_dep",
            amount: 9000,
            balance: 10407,
            date: "2026-06-18",
            description: "Överf N Lindstedt",
          }),
          entry({
            id: "u_dn",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "AB Dagens Nyheter",
          }),
        ],
        lon: [
          entry({
            id: "l_apotea",
            amount: -67,
            balance: 10903,
            date: "2026-06-17",
            description: "Apotea",
          }),
          entry({
            id: "l_loopia",
            amount: -361,
            balance: 10542,
            date: "2026-06-22",
            description: "Loopia",
          }),
          entry({
            id: "l_dn",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "AB Dagens Nyheter",
          }),
        ],
      }),
    );
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.accounts.find((x) => x.accountId === "utgift")?.fits).toBe(
      true,
    );
    expect(group.accounts.find((x) => x.accountId === "lon")?.fits).toBe(false);
    expect(group.suggestedOwnerId).toBe("utgift");
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

describe("historyContext", () => {
  it("returns the statement neighbours around the target with balances", () => {
    const entries: HistoryEntry[] = [
      entry({ id: "e0", date: "2026-04-10", amount: -800, balance: 5000 }),
      entry({ id: "e1", date: "2026-04-15", amount: -1200, balance: 3800 }),
      entry({ id: "e2", date: "2026-04-18", amount: -200, balance: 3600 }),
    ];
    const ctx = historyContext(entries, "e1");
    expect(ctx?.before?.id).toBe("e0");
    expect(ctx?.target.id).toBe("e1");
    expect(ctx?.after?.id).toBe("e2");
    expect(ctx?.target.balance).toBe(3800);
  });

  it("returns null neighbours at the edges and null when not found", () => {
    const entries: HistoryEntry[] = [
      entry({ id: "e0", date: "2026-04-10" }),
      entry({ id: "e1", date: "2026-04-15" }),
    ];
    const first = historyContext(entries, "e0");
    expect(first?.before).toBeNull();
    expect(first?.after?.id).toBe("e1");
    expect(historyContext(entries, "missing")).toBeNull();
  });
});

describe("ignoreRulesForGroup", () => {
  it("emits one rule per distinct exact description, sharing the amount", () => {
    const [group] = findDuplicateImports(
      data([account("a"), account("b")], {
        a: [entry({ id: "a1", description: "Kortköp ICA", amount: -349 })],
        b: [entry({ id: "b1", description: "KORTKÖP ICA", amount: -349 })],
      }),
    );
    const rules = ignoreRulesForGroup(group);
    expect(rules).toEqual([
      { description: "Kortköp ICA", amount: -349 },
      { description: "KORTKÖP ICA", amount: -349 },
    ]);
  });
});

describe("ignoreDuplicates reducer", () => {
  it("appends ignore rules, de-duplicating, and clears them", () => {
    const prev = freshUserData();
    const next = reducer(prev, {
      type: "ignoreDuplicates",
      ignores: [
        { description: "Kortbetalning", amount: -349 },
        { description: "Kortbetalning", amount: -349 },
      ],
    });
    expect(next.duplicateIgnores).toEqual([
      { description: "Kortbetalning", amount: -349 },
    ]);
    // Re-ignoring the same pair is a no-op (same reference back).
    const again = reducer(next, {
      type: "ignoreDuplicates",
      ignores: [{ description: "Kortbetalning", amount: -349 }],
    });
    expect(again).toBe(next);
    // Clearing wipes the list.
    const cleared = reducer(next, { type: "clearDuplicateIgnores" });
    expect(cleared.duplicateIgnores).toEqual([]);
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
