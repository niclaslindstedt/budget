import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type { Account, UserData } from "../src/data/types";

// `importBankHistory` re-threads same-day rows into running-balance order
// before storing them, so the stored history is one coherent chain even when
// the bank file listed a day's transactions out of balance order. This is
// the import-time counterpart to the duplicate finder's own ordering.

function account(id: string): Account {
  return { id, name: id };
}

function importInto(
  history: UserData["history"],
  entries: {
    date: string;
    description: string;
    amount: number;
    balance: number;
  }[],
) {
  const prev: UserData = {
    ...freshUserData(),
    accounts: [account("acc")],
    history,
  };
  const next = reducer(prev, {
    type: "importBankHistory",
    accountId: "acc",
    bankParserId: "test",
    filename: "acc.csv",
    entries,
    now: 1000,
  });
  return next.history["acc"].map((e) => e.description);
}

describe("importBankHistory — intra-day balance ordering", () => {
  it("stores a day's rows in running-balance order, not file order", () => {
    // The bank listed the day reversed: the -278 cabin charge (landing
    // 19820) before the -217 grocery (landing 20098), even though
    // 20098 - 278 = 19820. Import threads the grocery back in front.
    const stored = importInto({}, [
      {
        date: "2026-05-03",
        description: "Cabin",
        amount: -278,
        balance: 19820,
      },
      {
        date: "2026-05-03",
        description: "Grocery",
        amount: -217,
        balance: 20098,
      },
    ]);
    expect(stored).toEqual(["Grocery", "Cabin"]);
  });

  it("orients the imported day off the existing closing balance", () => {
    // The account already holds a row closing at 20315 on 2026-05-02; the
    // freshly-imported same-day pair (stored reversed) threads off it:
    // 20315 -> 20098 (grocery) -> 19820 (cabin).
    const existing: UserData["history"] = {
      acc: [
        {
          id: "open",
          date: "2026-05-02",
          description: "Opening",
          amount: -100,
          balance: 20315,
          importedAt: 0,
        },
      ],
    };
    const stored = importInto(existing, [
      {
        date: "2026-05-03",
        description: "Cabin",
        amount: -278,
        balance: 19820,
      },
      {
        date: "2026-05-03",
        description: "Grocery",
        amount: -217,
        balance: 20098,
      },
    ]);
    expect(stored).toEqual(["Opening", "Grocery", "Cabin"]);
  });

  it("keeps file order across distinct dates", () => {
    const stored = importInto({}, [
      { date: "2026-05-01", description: "First", amount: -50, balance: 950 },
      { date: "2026-05-02", description: "Second", amount: -50, balance: 900 },
    ]);
    expect(stored).toEqual(["First", "Second"]);
  });
});
