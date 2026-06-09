import { describe, expect, it } from "vitest";

import { findLoanPaymentCandidates } from "../src/data/loans/candidates";
import { learnPaymentPatterns } from "../src/data/loans/patterns";
import { freshUserData } from "../src/storage/local";
import type { HistoryEntry, Loan, UserData } from "../src/data/types";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: `h-${over.description ?? "x"}-${over.date ?? "d"}`,
    date: "2026-05-27",
    description: "SANTANDER 12345",
    amount: -2500,
    importedAt: 0,
    ...over,
  };
}

function loan(over: Partial<Loan> = {}): Loan {
  return { id: "loan-1", name: "Car loan", kind: "car", payments: [], ...over };
}

function state(over: Partial<UserData> = {}): UserData {
  return { ...freshUserData(), ...over };
}

describe("findLoanPaymentCandidates", () => {
  it("offers entries the user typed with the loan kind's preset type", () => {
    const s = state({
      history: {
        "acct-1": [
          entry({ id: "h1", userTypeId: "preset-type-car-loan" }),
          entry({ id: "h2", description: "ICA", amount: -300 }),
        ],
      },
    });
    const out = findLoanPaymentCandidates(loan(), s);
    expect(out.map((c) => c.entry.id)).toEqual(["h1"]);
    expect(out[0].accountId).toBe("acct-1");
  });

  it("anchors each kind on its own preset type", () => {
    const s = state({
      history: {
        "acct-1": [
          entry({ id: "h1", userTypeId: "preset-type-csn" }),
          entry({ id: "h2", userTypeId: "preset-type-car-loan" }),
        ],
      },
    });
    const out = findLoanPaymentCandidates(loan({ kind: "student" }), s);
    expect(out.map((c) => c.entry.id)).toEqual(["h1"]);
  });

  it("resolves the type through merchant hints", () => {
    const s = state({
      merchantHints: {
        santander: {
          typeId: "preset-type-car-loan",
          hitCount: 3,
          lastUsedAt: 0,
        },
      },
      history: { "acct-1": [entry({ id: "h1", description: "Santander" })] },
    });
    const out = findLoanPaymentCandidates(loan(), s);
    expect(out.map((c) => c.entry.id)).toEqual(["h1"]);
  });

  it("offers entries matching a learned payment pattern regardless of type", () => {
    const s = state({
      history: {
        "acct-1": [entry({ id: "h1", description: "SANTANDER 99887" })],
      },
    });
    const patterns = learnPaymentPatterns(undefined, ["SANTANDER 12345"]);
    const out = findLoanPaymentCandidates(
      loan({ paymentPatterns: patterns }),
      s,
    );
    expect(out.map((c) => c.entry.id)).toEqual(["h1"]);
  });

  it("skips inflows, hidden and transfer-collapsed entries", () => {
    const s = state({
      history: {
        "acct-1": [
          entry({ id: "h1", userTypeId: "preset-type-car-loan", amount: 2500 }),
          entry({
            id: "h2",
            userTypeId: "preset-type-car-loan",
            hidden: true,
          }),
          entry({
            id: "h3",
            userTypeId: "preset-type-car-loan",
            collapsedIntoTransferId: "t1",
          }),
          entry({ id: "h4", userTypeId: "preset-type-car-loan" }),
        ],
      },
    });
    const out = findLoanPaymentCandidates(loan(), s);
    expect(out.map((c) => c.entry.id)).toEqual(["h4"]);
  });

  it("excludes entries already recorded as payments", () => {
    const s = state({
      history: {
        "acct-1": [
          entry({ id: "h1", userTypeId: "preset-type-car-loan" }),
          entry({
            id: "h2",
            userTypeId: "preset-type-car-loan",
            date: "2026-04-27",
          }),
        ],
      },
    });
    const l = loan({
      payments: [
        { id: "p1", date: "2026-04-27", amount: 2500, sourceHistoryId: "h2" },
      ],
    });
    expect(findLoanPaymentCandidates(l, s).map((c) => c.entry.id)).toEqual([
      "h1",
    ]);
  });

  it("dedupes a linked mortgage loan against the mortgage's payments", () => {
    const s = state({
      properties: [
        {
          id: "prop-1",
          name: "Villa",
          purchaseDate: "2020-01-01",
          valueHistory: [],
          repairs: [],
          files: [],
          mortgages: [
            {
              id: "m-1",
              name: "Loan 1",
              payments: [
                {
                  id: "mp1",
                  date: "2026-04-27",
                  amount: 6750,
                  sourceHistoryId: "h2",
                },
              ],
            },
          ],
        },
      ],
      history: {
        "acct-1": [
          entry({ id: "h1", userTypeId: "preset-type-mortgage" }),
          entry({
            id: "h2",
            userTypeId: "preset-type-mortgage",
            date: "2026-04-27",
          }),
        ],
      },
    });
    const l = loan({
      kind: "mortgage",
      propertyId: "prop-1",
      mortgageIds: ["m-1"],
    });
    expect(findLoanPaymentCandidates(l, s).map((c) => c.entry.id)).toEqual([
      "h1",
    ]);
  });

  it("sorts candidates by date, newest first, across buckets", () => {
    const s = state({
      history: {
        "acct-1": [
          entry({
            id: "h1",
            userTypeId: "preset-type-car-loan",
            date: "2026-03-27",
          }),
        ],
        "acct-2": [
          entry({
            id: "h2",
            userTypeId: "preset-type-car-loan",
            date: "2026-05-27",
          }),
        ],
      },
    });
    expect(findLoanPaymentCandidates(loan(), s).map((c) => c.entry.id)).toEqual(
      ["h2", "h1"],
    );
  });
});

describe("learnPaymentPatterns", () => {
  it("normalises and unions with existing keys", () => {
    const first = learnPaymentPatterns(undefined, ["SANTANDER 12345"]);
    expect(first).toBeDefined();
    const second = learnPaymentPatterns(first, [
      "Santander 99887",
      "CSN AVGIFT",
    ]);
    // The two Santander strings collapse to one normalised key (their
    // 4+-digit reference numbers are stripped), so only CSN is new.
    expect(second?.length).toBe((first?.length ?? 0) + 1);
  });

  it("returns undefined when nothing meaningful was learned", () => {
    expect(learnPaymentPatterns(undefined, [""])).toBeUndefined();
  });
});
