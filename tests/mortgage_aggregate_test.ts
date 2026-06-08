import { describe, expect, it } from "vitest";

import { aggregateMortgages } from "../src/data/property-mortgage/aggregate";
import type { Mortgage } from "../src/data/types";

function mortgage(patch: Partial<Mortgage>): Mortgage {
  return { id: "m1", name: "Loan", payments: [], ...patch };
}

describe("aggregateMortgages", () => {
  it("returns an empty picture for no mortgages", () => {
    const agg = aggregateMortgages([]);
    expect(agg.count).toBe(0);
    expect(agg.totalBalance).toBeUndefined();
    expect(agg.totalLoan).toBeUndefined();
    expect(agg.effectiveRate).toBeNull();
    expect(agg.monthlyInterest).toBeNull();
    expect(agg.monthlyAmortization).toBeNull();
    expect(agg.progress).toBeNull();
    expect(agg.paymentCount).toBe(0);
  });

  it("sums balances and loan amounts across mortgages", () => {
    const agg = aggregateMortgages([
      mortgage({ id: "a", currentBalance: 1_000_000, loanAmount: 1_500_000 }),
      mortgage({ id: "b", currentBalance: 500_000, loanAmount: 800_000 }),
    ]);
    expect(agg.totalBalance).toBe(1_500_000);
    expect(agg.totalLoan).toBe(2_300_000);
  });

  it("blends the rate by balance, not by a plain average", () => {
    // Loan A: 1,000,000 @ 4% → 40,000/yr. Loan B: 100,000 @ 1% → 1,000/yr.
    // Blended = 41,000 / 1,100,000 ≈ 3.727% — pulled toward the larger loan's
    // rate, not the 2.5% a naive (4+1)/2 average would give.
    const agg = aggregateMortgages([
      mortgage({ id: "a", currentBalance: 1_000_000, interestRate: 4 }),
      mortgage({ id: "b", currentBalance: 100_000, interestRate: 1 }),
    ]);
    expect(agg.effectiveRate).toBeCloseTo(3.727, 2);
  });

  it("skips a mortgage with no rate when blending", () => {
    // Only the rated loan contributes; the unrated one doesn't drag toward 0.
    const agg = aggregateMortgages([
      mortgage({ id: "a", currentBalance: 1_000_000, interestRate: 3 }),
      mortgage({ id: "b", currentBalance: 500_000 }),
    ]);
    expect(agg.effectiveRate).toBeCloseTo(3, 6);
  });

  it("sums monthly interest and amortisation", () => {
    const agg = aggregateMortgages([
      mortgage({
        id: "a",
        currentBalance: 1_200_000,
        loanAmount: 1_200_000,
        interestRate: 5, // 1,200,000 × 5% ÷ 12 = 5,000 / month
        amortization: { mode: "fixed", amount: 2_000 },
      }),
      mortgage({
        id: "b",
        currentBalance: 600_000,
        loanAmount: 600_000,
        interestRate: 4, // 600,000 × 4% ÷ 12 = 2,000 / month
        amortization: { mode: "fixed", amount: 1_000 },
      }),
    ]);
    expect(agg.monthlyInterest).toBeCloseTo(7_000, 2);
    expect(agg.monthlyAmortization).toBeCloseTo(3_000, 2);
  });

  it("computes aggregate payoff over the combined principal", () => {
    // Paid off: (2,300,000 − 1,500,000) / 2,300,000 ≈ 0.3478.
    const agg = aggregateMortgages([
      mortgage({ id: "a", currentBalance: 1_000_000, loanAmount: 1_500_000 }),
      mortgage({ id: "b", currentBalance: 500_000, loanAmount: 800_000 }),
    ]);
    expect(agg.progress).toBeCloseTo(0.3478, 3);
  });

  it("ignores a mortgage missing a term from the payoff aggregate", () => {
    // Only loan A carries both terms, so the aggregate is loan A's own payoff.
    const agg = aggregateMortgages([
      mortgage({ id: "a", currentBalance: 750_000, loanAmount: 1_000_000 }),
      mortgage({ id: "b", currentBalance: 500_000 }),
    ]);
    expect(agg.progress).toBeCloseTo(0.25, 6);
  });

  it("sums recorded payments split into interest and amortisation", () => {
    const agg = aggregateMortgages([
      mortgage({
        id: "a",
        amortization: { mode: "fixed", amount: 2_000 },
        payments: [
          { id: "p1", date: "2026-01-01", amount: 5_000 },
          { id: "p2", date: "2026-02-01", amount: 5_000 },
        ],
      }),
    ]);
    // Each 5,000 payment = 2,000 amortisation + 3,000 interest.
    expect(agg.paymentCount).toBe(2);
    expect(agg.paid.total).toBe(10_000);
    expect(agg.paid.amortization).toBe(4_000);
    expect(agg.paid.interest).toBe(6_000);
  });
});
