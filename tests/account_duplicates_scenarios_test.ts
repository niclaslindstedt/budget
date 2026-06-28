import { describe, expect, it } from "vitest";

import {
  findDuplicateImports,
  historyContext,
  suggestOwner,
} from "../src/data/accounts/duplicates";
import type { Account, HistoryEntry, UserData } from "../src/data/types";

// Scenario-level suite for the cross-account duplicate finder. Where
// `account_duplicates_test.ts` pins individual behaviours with minimal
// fixtures, this file builds realistic, continuous account histories — the
// way a bank statement actually imports — and asserts the finder reaches
// the right verdict end to end. The headline case is the exact one from
// the bug reports: a charge that genuinely belongs to one account but was
// also imported into another.

function account(id: string, name = id): Account {
  return { id, name };
}

type Row = { id: string; date: string; desc: string; amount: number };

// Build a CONTINUOUS statement chain from an opening balance: each row's
// recorded balance is the previous balance plus its signed amount, exactly
// as a real bank export reads. Returns ready-to-store `HistoryEntry`s.
function chain(opening: number, rows: Row[]): HistoryEntry[] {
  let balance = opening;
  return rows.map((r) => {
    balance += r.amount;
    return {
      id: r.id,
      date: r.date,
      description: r.desc,
      amount: r.amount,
      balance,
      importedAt: 0,
    };
  });
}

// A single bank row with an explicit balance — used to inject a
// mis-imported copy whose balance does NOT follow the host account's own
// chain (the whole point of a stray import).
function row(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-06-22",
    description: "AB Dagens Nyheter",
    amount: -410,
    balance: 9997,
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

function accIn(group: { accounts: { accountId: string }[] }, id: string) {
  return group.accounts.find((a) => a.accountId === id) as {
    accountId: string;
    fits: boolean | null;
    entries: HistoryEntry[];
  };
}

describe("duplicate finder — realistic scenarios", () => {
  it("owns the charge to the account whose running total flows into it", () => {
    // The reported case. The −410 "AB Dagens Nyheter" charge genuinely
    // posts to UTGIFT right after a 9000 deposit lands the balance on
    // 10407 (10407 − 410 = 9997). The same charge was also mis-imported
    // into LON, where 9997 follows nothing — there is no LON entry at
    // 10407. So UTGIFT owns it and the LON copy is the stray one.
    const utgift = chain(1407, [
      {
        id: "u_dep",
        date: "2026-06-18",
        desc: "Överf N Lindstedt",
        amount: 9000,
      },
      {
        id: "u_dn",
        date: "2026-06-22",
        desc: "AB Dagens Nyheter",
        amount: -410,
      },
      { id: "u_in", date: "2026-06-24", desc: "Lön", amount: 33800 },
      { id: "u_rack", date: "2026-06-24", desc: "Rackstad", amount: -369 },
    ]);
    // LON's own chain is continuous (10970 → 10903 → 10542); the DN copy is
    // injected on top of it with the foreign balance 9997, which does not
    // chain from 10542.
    const lon = [
      ...chain(10970, [
        { id: "l_apotea", date: "2026-06-17", desc: "Apotea", amount: -67 },
        { id: "l_loopia", date: "2026-06-22", desc: "Loopia", amount: -361 },
      ]),
      row({ id: "l_dn" }),
    ];

    const groups = findDuplicateImports(
      data([account("utgift"), account("lon")], { utgift, lon }),
    );

    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group.description).toBe("AB Dagens Nyheter");
    expect(group.amount).toBe(-410);
    expect(accIn(group, "utgift").fits).toBe(true);
    expect(accIn(group, "lon").fits).toBe(false);
    expect(group.suggestedOwnerId).toBe("utgift");
  });

  it("gives the same verdict no matter what order the entries imported in", () => {
    // `entryFits` is a set membership test, so the result must not depend
    // on array order — a re-import that shuffles rows can't flip the owner.
    const utgift = chain(1407, [
      {
        id: "u_dep",
        date: "2026-06-18",
        desc: "Överf N Lindstedt",
        amount: 9000,
      },
      {
        id: "u_dn",
        date: "2026-06-22",
        desc: "AB Dagens Nyheter",
        amount: -410,
      },
    ]);
    const lon = [
      ...chain(10970, [
        { id: "l_apotea", date: "2026-06-17", desc: "Apotea", amount: -67 },
        { id: "l_loopia", date: "2026-06-22", desc: "Loopia", amount: -361 },
      ]),
      row({ id: "l_dn" }),
    ];
    const shuffled = (xs: HistoryEntry[]) => [xs[2], xs[0], xs[1]];
    const groups = findDuplicateImports(
      data([account("utgift"), account("lon")], {
        utgift: [utgift[1], utgift[0]],
        lon: shuffled(lon),
      }),
    );
    expect(groups).toHaveLength(1);
    expect(accIn(groups[0], "utgift").fits).toBe(true);
    expect(accIn(groups[0], "lon").fits).toBe(false);
    expect(groups[0].suggestedOwnerId).toBe("utgift");
  });

  it("is unaffected by a discontinuity earlier in the owning account", () => {
    // The owning account's history need not be gap-free: only the ONE step
    // into the charge matters. Here UTGIFT opens at 1000 and the next known
    // row jumps to 10407 (an un-imported stretch in between), yet the DN
    // charge still fits because its predecessor balance 10407 is present.
    const utgift = [
      {
        id: "u_old",
        date: "2026-01-05",
        description: "Startköp",
        amount: -500,
        balance: 1000,
        importedAt: 0,
      },
      ...chain(1407, [
        {
          id: "u_dep",
          date: "2026-06-18",
          desc: "Överf N Lindstedt",
          amount: 9000,
        },
        {
          id: "u_dn",
          date: "2026-06-22",
          desc: "AB Dagens Nyheter",
          amount: -410,
        },
      ]),
    ];
    const lon = [
      ...chain(10970, [
        { id: "l_apotea", date: "2026-06-17", desc: "Apotea", amount: -67 },
        { id: "l_loopia", date: "2026-06-22", desc: "Loopia", amount: -361 },
      ]),
      row({ id: "l_dn" }),
    ];
    const groups = findDuplicateImports(
      data([account("utgift"), account("lon")], { utgift, lon }),
    );
    expect(accIn(groups[0], "utgift").fits).toBe(true);
    expect(accIn(groups[0], "lon").fits).toBe(false);
    expect(groups[0].suggestedOwnerId).toBe("utgift");
  });

  it("does not flag a same-day same-amount charge whose balances differ", () => {
    // A recurring card payment can legitimately post the same amount on the
    // same day to two accounts; each lands on its own running total, so the
    // balances differ and the pair is never grouped.
    const a = chain(1000, [
      { id: "a_x", date: "2026-06-22", desc: "Spotify", amount: -119 },
    ]);
    const b = chain(7000, [
      { id: "b_x", date: "2026-06-22", desc: "Spotify", amount: -119 },
    ]);
    const groups = findDuplicateImports(
      data([account("a"), account("b")], { a, b }),
    );
    expect(groups).toHaveLength(0);
  });

  it("tolerates a one-öre rounding wobble in the predecessor balance", () => {
    // Bank exports round; the predecessor lookup allows ±1 öre. Here the
    // deposit lands the balance one öre off from the charge's pre-balance
    // and the charge still fits.
    const a = [
      {
        id: "a_dep",
        date: "2026-06-18",
        description: "Lön",
        amount: 9000,
        balance: 10407.01,
        importedAt: 0,
      },
      {
        id: "a_dn",
        date: "2026-06-22",
        description: "AB Dagens Nyheter",
        amount: -410,
        balance: 9997,
        importedAt: 0,
      },
    ];
    const b = [
      ...chain(10970, [
        { id: "b_loopia", date: "2026-06-22", desc: "Loopia", amount: -361 },
      ]),
      row({ id: "b_dn" }),
    ];
    const groups = findDuplicateImports(
      data([account("a"), account("b")], { a, b }),
    );
    expect(groups).toHaveLength(1);
    expect(accIn(groups[0], "a").fits).toBe(true);
    expect(accIn(groups[0], "b").fits).toBe(false);
  });

  it("resolves several duplicate groups in one pass, newest first", () => {
    // Two separate charges were each mis-imported into LON; both belong to
    // UTGIFT. Groups come back newest-first.
    const utgift = chain(1407, [
      { id: "u_dep", date: "2026-06-18", desc: "Överf", amount: 9000 },
      {
        id: "u_dn",
        date: "2026-06-22",
        desc: "AB Dagens Nyheter",
        amount: -410,
      },
      { id: "u_dep2", date: "2026-06-25", desc: "Överf", amount: 5000 },
      { id: "u_hbo", date: "2026-06-26", desc: "HBO Max", amount: -129 },
    ]);
    const lon = [
      ...chain(20000, [
        { id: "l_a", date: "2026-06-20", desc: "Apotea", amount: -67 },
      ]),
      row({ id: "l_dn" }),
      row({
        id: "l_hbo",
        date: "2026-06-26",
        description: "HBO Max",
        amount: -129,
        balance: 14868,
      }),
    ];
    const groups = findDuplicateImports(
      data([account("utgift"), account("lon")], { utgift, lon }),
    );
    expect(groups.map((g) => g.description)).toEqual([
      "HBO Max",
      "AB Dagens Nyheter",
    ]);
    for (const g of groups) {
      expect(accIn(g, "utgift").fits).toBe(true);
      expect(accIn(g, "lon").fits).toBe(false);
      expect(g.suggestedOwnerId).toBe("utgift");
    }
  });

  it("flags the stray copy across three accounts and owns the right one", () => {
    const utgift = chain(1407, [
      { id: "u_dep", date: "2026-06-18", desc: "Överf", amount: 9000 },
      {
        id: "u_dn",
        date: "2026-06-22",
        desc: "AB Dagens Nyheter",
        amount: -410,
      },
    ]);
    const lon = [
      ...chain(5000, [
        { id: "l_a", date: "2026-06-20", desc: "Apotea", amount: -67 },
      ]),
      row({ id: "l_dn" }),
    ];
    const spar = [
      ...chain(80000, [
        { id: "s_a", date: "2026-06-20", desc: "Ränta", amount: 12 },
      ]),
      row({ id: "s_dn" }),
    ];
    const groups = findDuplicateImports(
      data([account("utgift"), account("lon"), account("spar")], {
        utgift,
        lon,
        spar,
      }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].accounts).toHaveLength(3);
    expect(accIn(groups[0], "utgift").fits).toBe(true);
    expect(accIn(groups[0], "lon").fits).toBe(false);
    expect(accIn(groups[0], "spar").fits).toBe(false);
    expect(groups[0].suggestedOwnerId).toBe("utgift");
  });

  it("surfaces the surrounding history so the user can verify by eye", () => {
    const utgift = chain(1407, [
      {
        id: "u_dep",
        date: "2026-06-18",
        desc: "Överf N Lindstedt",
        amount: 9000,
      },
      {
        id: "u_dn",
        date: "2026-06-22",
        desc: "AB Dagens Nyheter",
        amount: -410,
      },
      { id: "u_rack", date: "2026-06-24", desc: "Rackstad", amount: -369 },
    ]);
    const ctx = historyContext(utgift, "u_dn");
    // The predecessor's balance plus the charge's amount equals the
    // charge's balance — visible proof the charge belongs here.
    expect(ctx?.before?.id).toBe("u_dep");
    expect((ctx?.before?.balance as number) + ctx!.target.amount).toBe(
      ctx?.target.balance,
    );
    expect(ctx?.after?.id).toBe("u_rack");
  });

  it("falls to the tie-breakers when a whole statement was imported twice", () => {
    // The one case the one-step check can't disambiguate: an entire
    // statement imported into two accounts leaves each copy with a real
    // predecessor inside its own account, so both fit. Ownership then
    // leans on the fuller / denser history (and the user's own pick).
    const genuine = chain(5000, [
      { id: "g0", date: "2026-06-10", desc: "Vattenfall", amount: -800 },
      { id: "g1", date: "2026-06-15", desc: "AB Dagens Nyheter", amount: -410 },
    ]);
    const wrong = chain(5000, [
      { id: "w_prev", date: "2026-06-12", desc: "Elnät", amount: -800 },
      { id: "w1", date: "2026-06-15", desc: "AB Dagens Nyheter", amount: -410 },
    ]);
    const groups = findDuplicateImports(
      data([account("genuine"), account("wrong")], { genuine, wrong }),
    );
    const dn = groups.find((g) => g.description === "AB Dagens Nyheter")!;
    expect(accIn(dn, "genuine").fits).toBe(true);
    expect(accIn(dn, "wrong").fits).toBe(true);
  });

  it("suggestOwner prefers the fitting account over a denser non-fit", () => {
    // Even if the stray account has more activity on the day, the account
    // where the balance reconciles wins.
    const fitIdx = new Map([
      [
        "fit",
        {
          balances: new Set([1040700]),
          total: 2,
          byDate: new Map([["2026-06-22", 1]]),
        },
      ],
      [
        "stray",
        {
          balances: new Set([900000]),
          total: 50,
          byDate: new Map([["2026-06-22", 9]]),
        },
      ],
    ]) as unknown as Parameters<typeof suggestOwner>[2];
    const owner = suggestOwner(
      [
        { accountId: "stray", entries: [], fits: false },
        { accountId: "fit", entries: [], fits: true },
      ],
      "2026-06-22",
      fitIdx,
    );
    expect(owner).toBe("fit");
  });
});
