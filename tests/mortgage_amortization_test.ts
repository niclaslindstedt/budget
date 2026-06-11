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

  it("returns null for percent mode without a loan amount to take it of", () => {
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
