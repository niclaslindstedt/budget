import { describe, expect, it } from "vitest";

import {
  associationLoanShare,
  cumulativeAssociationInterestAt,
  cumulativeMortgageInterestAt,
  monthlyAssociationInterest,
  resolveAssociationLoanAt,
} from "../src/data/property-value/interest";
import type { AssociationLoan, Property } from "../src/data/types";

function property(overrides: Partial<Property>): Property {
  return {
    id: "p1",
    name: "Flat",
    valueHistory: [],
    mortgages: [],
    repairs: [],
    files: [],
    ...overrides,
  };
}

describe("associationLoanShare", () => {
  it("multiplies the per-area figure by the recorded size", () => {
    const p = property({
      size: 42,
      associationLoan: { loanPerSize: 5_800, rate: 3.2 },
    });
    expect(associationLoanShare(p)).toBe(243_600);
    // 243,600 × 3.2% / 12 = 649.6
    expect(monthlyAssociationInterest(p)).toBeCloseTo(649.6, 4);
  });

  it("is undefined without a loan or without a size", () => {
    expect(associationLoanShare(property({ size: 42 }))).toBeUndefined();
    expect(
      associationLoanShare(
        property({ associationLoan: { loanPerSize: 5_800, rate: 3.2 } }),
      ),
    ).toBeUndefined();
  });

  it("prefers the association-registered size over the measured size", () => {
    // Measured 82 but registered 80 in the association → apportion on 80.
    const p = property({
      size: 82,
      associationLoan: { loanPerSize: 5_000, rate: 3 },
    });
    expect(associationLoanShare(p)).toBe(410_000); // 5,000 × 82
    p.associationLoan!.size = 80;
    expect(associationLoanShare(p)).toBe(400_000); // 5,000 × 80
  });

  it("falls back to the measured size when no registered size is set", () => {
    const p = property({
      associationLoan: { loanPerSize: 5_000, rate: 3, size: 80 },
    });
    // No Property.size at all, but the association size carries it.
    expect(associationLoanShare(p)).toBe(400_000);
  });
});

describe("cumulativeAssociationInterestAt", () => {
  it("accrues the monthly figure for whole months since purchase", () => {
    const p = property({
      purchaseDate: "2024-01-01",
      size: 50,
      // 200,000 share at 6% ⇒ 1,000/month.
      associationLoan: { loanPerSize: 4_000, rate: 6 },
    });
    // Purchase month: nothing paid yet.
    expect(cumulativeAssociationInterestAt(p, "2024-01-15")).toBe(0);
    // Three whole months later: 3 × 1,000.
    expect(cumulativeAssociationInterestAt(p, "2024-04-01")).toBe(3_000);
  });

  it("is zero without a purchase date to accrue from", () => {
    const p = property({
      size: 50,
      associationLoan: { loanPerSize: 4_000, rate: 6 },
    });
    expect(cumulativeAssociationInterestAt(p, "2024-04-01")).toBe(0);
  });

  it("accrues at the figures in effect each month when history is set", () => {
    const p = property({
      purchaseDate: "2024-01-01",
      size: 50,
      associationLoan: {
        loanPerSize: 6_000,
        rate: 6,
        history: [
          // Jan–Feb: 4,000/kvm × 50 = 200,000 at 3% ⇒ 500/month.
          { id: "a", date: "", loanPerSize: 4_000, rate: 3 },
          // From March: 6,000/kvm × 50 = 300,000 at 6% ⇒ 1,500/month.
          { id: "b", date: "2024-03-01", loanPerSize: 6_000, rate: 6 },
        ],
      },
    });
    // Months Jan + Feb at 500 = 1,000 by March 1.
    expect(cumulativeAssociationInterestAt(p, "2024-03-01")).toBe(1_000);
    // Plus March + April at 1,500 = 1,000 + 3,000 by May 1.
    expect(cumulativeAssociationInterestAt(p, "2024-05-01")).toBe(4_000);
  });
});

describe("resolveAssociationLoanAt", () => {
  const loan: AssociationLoan = {
    loanPerSize: 6_000,
    rate: 6,
    history: [
      { id: "a", date: "", loanPerSize: 4_000, rate: 3 },
      { id: "b", date: "2024-03-01", loanPerSize: 6_000, rate: 6 },
    ],
  };

  it("walks history to the figures in effect on a date", () => {
    // Before the first change → the original figures.
    expect(resolveAssociationLoanAt(loan, "2024-02-01")).toEqual({
      loanPerSize: 4_000,
      rate: 3,
    });
    // On/after the change → the new figures.
    expect(resolveAssociationLoanAt(loan, "2024-03-01")).toEqual({
      loanPerSize: 6_000,
      rate: 6,
    });
  });

  it("falls back to the headline figures with no history", () => {
    expect(
      resolveAssociationLoanAt({ loanPerSize: 5_000, rate: 2 }, "2024-01-01"),
    ).toEqual({ loanPerSize: 5_000, rate: 2 });
  });
});

describe("cumulativeMortgageInterestAt", () => {
  it("sums interest-only interest for whole months since the loan start", () => {
    const p = property({
      purchaseDate: "2024-01-01",
      mortgages: [
        {
          id: "m1",
          name: "Loan",
          loanAmount: 1_200_000,
          currentBalance: 1_200_000,
          interestRate: 6,
          loanStartDate: "2024-01-01",
          payments: [],
        },
      ],
    });
    // Flat 1,200,000 at 6% ⇒ 6,000/month. Start month: nothing yet.
    expect(cumulativeMortgageInterestAt(p, "2024-01-20")).toBe(0);
    // Three months later: 3 × 6,000.
    expect(cumulativeMortgageInterestAt(p, "2024-04-01")).toBe(18_000);
  });

  it("falls back to the purchase date when the loan has no start", () => {
    const p = property({
      purchaseDate: "2024-01-01",
      mortgages: [
        {
          id: "m1",
          name: "Loan",
          loanAmount: 600_000,
          currentBalance: 600_000,
          interestRate: 4,
          payments: [],
        },
      ],
    });
    // 600,000 at 4% ⇒ 2,000/month, two months from Jan to Mar.
    expect(cumulativeMortgageInterestAt(p, "2024-03-01")).toBe(4_000);
  });

  it("contributes nothing for a loan with no resolvable start", () => {
    const p = property({
      mortgages: [
        {
          id: "m1",
          name: "Loan",
          loanAmount: 600_000,
          currentBalance: 600_000,
          interestRate: 4,
          payments: [],
        },
      ],
    });
    expect(cumulativeMortgageInterestAt(p, "2024-03-01")).toBe(0);
  });
});
