import { describe, expect, it } from "vitest";

import {
  duplicateBatchOwners,
  duplicateBatchRemovals,
  duplicateRemovals,
  duplicateSessionRemovals,
  duplicateSessions,
  findDuplicateImports,
  historyContext,
  ignoreRulesForGroup,
  suggestBatchOwner,
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

  it("counts an auto-collapsed transfer leg as a valid predecessor", () => {
    // The genuine owner's predecessor is an internal transfer that the
    // auto-collapse flow hid (`hidden`, `collapsedIntoTransferId` set). Its
    // balance is still on the running-balance chain, so the copy that lands
    // on it must read as fitting — and the other account, where no entry
    // hands off to that balance, as the stray. Before the continuity set
    // spanned collapsed legs, the owner's predecessor was invisible and the
    // real owner was wrongly flagged.
    const groups = findDuplicateImports(
      data([account("owner"), account("stray")], {
        owner: [
          entry({
            id: "o_xfer",
            amount: 9000,
            balance: 10407,
            date: "2026-06-18",
            description: "Internal transfer",
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
          entry({
            id: "o_dup",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "Newspaper",
          }),
        ],
        stray: [
          entry({
            id: "s_prev",
            amount: -67,
            balance: 10903,
            date: "2026-06-17",
            description: "Pharmacy",
          }),
          entry({
            id: "s_dup",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "Newspaper",
          }),
        ],
      }),
    );
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.accounts.find((x) => x.accountId === "owner")?.fits).toBe(
      true,
    );
    expect(group.accounts.find((x) => x.accountId === "stray")?.fits).toBe(
      false,
    );
    expect(group.suggestedOwnerId).toBe("owner");
  });

  it("anchors on the last non-duplicate so a mis-imported block can't self-validate", () => {
    // A two-row statement (Shop One, Shop Two) is genuine in "right" and
    // mis-imported as a contiguous block into "wrong". Inside the block
    // each row chains into the previous one in BOTH accounts (the balances
    // were copied verbatim), so checking the immediate predecessor would
    // wrongly validate the second row in "wrong" too. Anchoring on the last
    // genuine row — and carrying the block's amounts forward — tells them
    // apart: in "right" the genuine 5000 flows into the block, in "wrong"
    // the genuine 9000 does not.
    const groups = findDuplicateImports(
      data([account("right"), account("wrong")], {
        right: [
          entry({
            id: "r_anchor",
            amount: 100,
            balance: 5000,
            date: "2026-06-01",
            description: "Native R",
          }),
          entry({
            id: "r_d1",
            amount: -1000,
            balance: 4000,
            date: "2026-06-02",
            description: "Shop One",
          }),
          entry({
            id: "r_d2",
            amount: -500,
            balance: 3500,
            date: "2026-06-03",
            description: "Shop Two",
          }),
        ],
        wrong: [
          entry({
            id: "w_anchor",
            amount: 200,
            balance: 9000,
            date: "2026-06-01",
            description: "Native W",
          }),
          entry({
            id: "w_d1",
            amount: -1000,
            balance: 4000,
            date: "2026-06-02",
            description: "Shop One",
          }),
          entry({
            id: "w_d2",
            amount: -500,
            balance: 3500,
            date: "2026-06-03",
            description: "Shop Two",
          }),
        ],
      }),
    );
    // Both rows form their own duplicate group; both are owned by "right",
    // and the second row in "wrong" is NOT validated by the first.
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.accounts.find((x) => x.accountId === "right")?.fits).toBe(
        true,
      );
      expect(group.accounts.find((x) => x.accountId === "wrong")?.fits).toBe(
        false,
      );
      expect(group.suggestedOwnerId).toBe("right");
    }
  });

  it("ignores a matching balance elsewhere in history that isn't the anchor", () => {
    // The copy lands on 9997 after a -410 charge (pre-balance 10407). The
    // "wrong" account DID hold 10407 once, weeks earlier, but the row
    // directly chaining into the copy is 10903 — which doesn't add up. A
    // set-membership test would call this a fit; anchoring on the genuine
    // predecessor correctly flags it, so "right" (where 10407 is the real
    // predecessor) owns the transaction.
    const groups = findDuplicateImports(
      data([account("right"), account("wrong")], {
        right: [
          entry({
            id: "r_pred",
            amount: 9000,
            balance: 10407,
            date: "2026-06-18",
            description: "Deposit",
          }),
          entry({
            id: "r_dup",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "Newspaper",
          }),
        ],
        wrong: [
          entry({
            id: "w_old",
            amount: -100,
            balance: 10407,
            date: "2026-05-02",
            description: "Old charge",
          }),
          entry({
            id: "w_pred",
            amount: -67,
            balance: 10903,
            date: "2026-06-17",
            description: "Pharmacy",
          }),
          entry({
            id: "w_dup",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "Newspaper",
          }),
        ],
      }),
    );
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.accounts.find((x) => x.accountId === "right")?.fits).toBe(
      true,
    );
    expect(group.accounts.find((x) => x.accountId === "wrong")?.fits).toBe(
      false,
    );
    expect(group.suggestedOwnerId).toBe("right");
  });
});

describe("import-session expansion", () => {
  const history = {
    owner: [entry({ id: "o1" })],
    stray: [
      entry({ id: "s1", importId: "imp" }),
      entry({ id: "s2", importId: "imp", description: "Rent", amount: -7000 }),
      entry({
        id: "s3",
        importId: "other",
        description: "Salary",
        amount: 25000,
      }),
    ],
  };
  const [group] = findDuplicateImports(
    data([account("owner"), account("stray")], history),
  );

  it("reports the surplus entries a session would sweep out", () => {
    expect(duplicateSessions(group, "owner", history)).toEqual([
      { accountId: "stray", importId: "imp", total: 2, matched: 1 },
    ]);
  });

  it("removes every entry sharing the mis-import's session", () => {
    const removals = duplicateSessionRemovals(group, "owner", history);
    expect(removals.map((r) => `${r.accountId}:${r.entryId}`).sort()).toEqual([
      "stray:s1",
      "stray:s2",
    ]);
  });

  it("falls back to the matched copy when it carries no session backref", () => {
    const noBackref = {
      owner: [entry({ id: "o1" })],
      stray: [entry({ id: "s1" })],
    };
    const [g] = findDuplicateImports(
      data([account("owner"), account("stray")], noBackref),
    );
    expect(duplicateSessions(g, "owner", noBackref)).toEqual([]);
    expect(duplicateSessionRemovals(g, "owner", noBackref)).toEqual([
      { accountId: "stray", entryId: "s1" },
    ]);
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

describe("importBankHistory import session", () => {
  it("stamps each new entry with the created HistoryImport's id", () => {
    const prev: UserData = {
      ...freshUserData(),
      accounts: [account("acc")],
    };
    const next = reducer(prev, {
      type: "importBankHistory",
      accountId: "acc",
      bankParserId: "test",
      filename: "statement.csv",
      entries: [
        { date: "2026-05-01", description: "Shop", amount: -100, balance: 900 },
        { date: "2026-05-02", description: "Café", amount: -40, balance: 860 },
      ],
      now: 1,
    });
    const record = next.historyImports.acc?.[0];
    expect(record?.id).toBeTruthy();
    const entries = next.history.acc;
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.importId === record!.id)).toBe(true);
  });
});

describe("batch owner helpers (import-time single-owner picker)", () => {
  // Two rows imported into "x" that both already exist in "y", whose
  // genuine deposit chains through them — so y owns the whole batch.
  const batch = data([account("x"), account("y")], {
    x: [
      entry({
        id: "x_dn",
        amount: -410,
        balance: 9997,
        date: "2026-06-22",
        description: "Newspaper",
      }),
      entry({
        id: "x_shop",
        amount: -100,
        balance: 9897,
        date: "2026-06-23",
        description: "Shop",
      }),
    ],
    y: [
      entry({
        id: "y_dep",
        amount: 9000,
        balance: 10407,
        date: "2026-06-18",
        description: "Deposit",
      }),
      entry({
        id: "y_dn",
        amount: -410,
        balance: 9997,
        date: "2026-06-22",
        description: "Newspaper",
      }),
      entry({
        id: "y_shop",
        amount: -100,
        balance: 9897,
        date: "2026-06-23",
        description: "Shop",
      }),
    ],
  });
  const groups = findDuplicateImports(batch);

  it("tallies each involved account's group and fit counts", () => {
    expect(groups).toHaveLength(2);
    const owners = duplicateBatchOwners(groups).sort((a, b) =>
      a.accountId.localeCompare(b.accountId),
    );
    expect(owners).toEqual([
      { accountId: "x", groupCount: 2, fitCount: 0 },
      { accountId: "y", groupCount: 2, fitCount: 2 },
    ]);
  });

  it("suggests the account whose balances reconcile across the batch", () => {
    expect(suggestBatchOwner(groups)).toBe("y");
  });

  it("suggests nothing when no account reconciles (caller defaults to Skip)", () => {
    const noFit = findDuplicateImports(
      data([account("x"), account("y")], {
        x: [entry({ id: "x1" })],
        y: [entry({ id: "y1" })],
      }),
    );
    expect(suggestBatchOwner(noFit)).toBeNull();
  });

  it("removes every non-owner copy across the batch", () => {
    expect(
      duplicateBatchRemovals(groups, "y")
        .map((r) => `${r.accountId}:${r.entryId}`)
        .sort(),
    ).toEqual(["x:x_dn", "x:x_shop"]);
    expect(
      duplicateBatchRemovals(groups, "x")
        .map((r) => `${r.accountId}:${r.entryId}`)
        .sort(),
    ).toEqual(["y:y_dn", "y:y_shop"]);
  });
});

describe("cross-account duplicate detection at import time", () => {
  it("flags a freshly-imported row that already exists in another account", () => {
    const prev: UserData = {
      ...freshUserData(),
      accounts: [account("x"), account("y")],
      history: {
        y: [
          entry({
            id: "y_pred",
            amount: 9000,
            balance: 10407,
            date: "2026-06-18",
            description: "Deposit",
          }),
          entry({
            id: "y_dn",
            amount: -410,
            balance: 9997,
            date: "2026-06-22",
            description: "Newspaper",
          }),
        ],
      },
    };
    // Import the same -410 / 9997 row into account x.
    const next = reducer(prev, {
      type: "importBankHistory",
      accountId: "x",
      bankParserId: "test",
      filename: "x.csv",
      entries: [
        {
          date: "2026-06-22",
          description: "Newspaper",
          amount: -410,
          balance: 9997,
        },
      ],
      now: 4242,
    });
    const groups = findDuplicateImports(next);
    expect(groups).toHaveLength(1);
    // The import-scoped resolver keys off `importedAt`: the just-added row
    // carries the import's timestamp, so the group is recognisably "touched
    // by this import".
    const touched = groups.filter((g) =>
      g.accounts.some((a) => a.entries.some((e) => e.importedAt === 4242)),
    );
    expect(touched).toHaveLength(1);
    // y owns it (its genuine deposit chains into the row); x's copy is the
    // stray with no genuine predecessor to anchor on.
    expect(touched[0].suggestedOwnerId).toBe("y");
    expect(touched[0].accounts.find((a) => a.accountId === "y")?.fits).toBe(
      true,
    );
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

  it("restores a stranded transfer partner when a removed entry was collapsed", () => {
    // Session removal can drag out an entry the auto-collapse flow later
    // merged into a Transfer. Dropping it must also drop the transfer and
    // un-hide its partner leg on the other account — otherwise the partner
    // is stranded `hidden` with a dangling backref. Mirrors cutAccountHistory.
    const prev: UserData = {
      ...freshUserData(),
      accounts: [account("a"), account("b")],
      transfers: [
        {
          id: "t1",
          date: "2026-04-15",
          description: "Transfer",
          amount: 500,
          fromAccountId: "a",
          toAccountId: "b",
        },
      ],
      history: {
        a: [
          entry({
            id: "a_leg",
            amount: -500,
            date: "2026-04-15",
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
        ],
        b: [
          entry({
            id: "b_leg",
            amount: 500,
            date: "2026-04-15",
            hidden: true,
            collapsedIntoTransferId: "t1",
          }),
        ],
      },
    };
    const next = reducer(prev, {
      type: "resolveDuplicateImports",
      removals: [{ accountId: "a", entryId: "a_leg" }],
    });
    expect(next.history.a).toEqual([]);
    expect(next.transfers).toEqual([]);
    const bLeg = next.history.b.find((e) => e.id === "b_leg");
    expect(bLeg?.hidden).toBeUndefined();
    expect(bLeg?.collapsedIntoTransferId).toBeUndefined();
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
