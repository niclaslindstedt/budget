import { describe, expect, it } from "vitest";

import { resolveMonthlyInterest } from "../src/data/property-mortgage/interest";
import type { Mortgage } from "../src/data/types";

function mortgage(patch: Partial<Mortgage>): Mortgage {
  return { id: "m1", name: "Loan", payments: [], ...patch };
}

describe("resolveMonthlyInterest", () => {
  it("returns null when no interest rate is set", () => {
    expect(
      resolveMonthlyInterest(mortgage({ currentBalance: 1_000_000 })),
    ).toBeNull();
  });

  it("returns null when no balance or loan amount is known", () => {
    expect(resolveMonthlyInterest(mortgage({ interestRate: 3 }))).toBeNull();
  });

  it("charges interest on the current balance", () => {
    // 3% of 2,000,000 ÷ 12 = 5,000 / month.
    const m = mortgage({ currentBalance: 2_000_000, interestRate: 3 });
    expect(resolveMonthlyInterest(m)).toBeCloseTo(5_000, 6);
  });

  it("falls back to the original loan amount when no current balance", () => {
    // 2% of 3,000,000 ÷ 12 = 5,000 / month.
    const m = mortgage({ loanAmount: 3_000_000, interestRate: 2 });
    expect(resolveMonthlyInterest(m)).toBeCloseTo(5_000, 6);
  });

  it("prefers the current balance over the original loan amount", () => {
    const m = mortgage({
      loanAmount: 3_000_000,
      currentBalance: 1_500_000,
      interestRate: 4,
    });
    // 4% of 1,500,000 ÷ 12 = 5,000 — uses the balance, not the loan.
    expect(resolveMonthlyInterest(m)).toBeCloseTo(5_000, 6);
  });

  it("resolves a 0% rate to 0 rather than null", () => {
    const m = mortgage({ currentBalance: 1_000_000, interestRate: 0 });
    expect(resolveMonthlyInterest(m)).toBe(0);
  });
});
