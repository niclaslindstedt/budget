import { describe, expect, it } from "vitest";

import { resolveMonthlyAmortization } from "../src/data/finance/amortization";
import type { Mortgage } from "../src/data/types";

function mortgage(patch: Partial<Mortgage>): Mortgage {
  return { id: "m1", name: "Loan", payments: [], ...patch };
}

describe("resolveMonthlyAmortization", () => {
  it("returns null when no amortisation is set", () => {
    expect(resolveMonthlyAmortization(mortgage({}))).toBeNull();
  });

  it("returns the fixed sum unchanged", () => {
    const m = mortgage({ amortization: { mode: "fixed", amount: 5000 } });
    expect(resolveMonthlyAmortization(m)).toBe(5000);
  });

  it("returns the fixed sum even without a loan amount", () => {
    const m = mortgage({ amortization: { mode: "fixed", amount: 5000 } });
    expect(resolveMonthlyAmortization(m)).toBe(5000);
  });

  it("resolves a percent of the initial loan to a monthly figure", () => {
    // 2% of 7,000,000 ÷ 12 ≈ 11,666.67 — the worked example from the spec.
    const m = mortgage({
      loanAmount: 7_000_000,
      amortization: { mode: "percent", percent: 2 },
    });
    expect(resolveMonthlyAmortization(m)).toBeCloseTo(11_666.67, 2);
  });

  it("falls back to the current balance when no loan amount is recorded", () => {
    // A loan tracked only by its outstanding figure still amortises — 2% of
    // 1,908,000 ÷ 12 = 3,180 a month.
    const m = mortgage({
      currentBalance: 1_908_000,
      amortization: { mode: "percent", percent: 2 },
    });
    expect(resolveMonthlyAmortization(m)).toBeCloseTo(3_180, 2);
  });

  it("prefers the initial loan amount over the current balance", () => {
    // With both recorded, the percentage is of the original loan so the
    // figure stays constant as the balance pays down.
    const m = mortgage({
      loanAmount: 7_000_000,
      currentBalance: 1_000_000,
      amortization: { mode: "percent", percent: 2 },
    });
    expect(resolveMonthlyAmortization(m)).toBeCloseTo(11_666.67, 2);
  });

  it("returns null for percent mode without any base amount to take it of", () => {
    const m = mortgage({ amortization: { mode: "percent", percent: 2 } });
    expect(resolveMonthlyAmortization(m)).toBeNull();
  });

  it("resolves a 0% rate to 0 rather than null", () => {
    const m = mortgage({
      loanAmount: 1_000_000,
      amortization: { mode: "percent", percent: 0 },
    });
    expect(resolveMonthlyAmortization(m)).toBe(0);
  });
});
