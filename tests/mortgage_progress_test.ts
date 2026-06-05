import { describe, expect, it } from "vitest";

import { mortgagePayoffProgress } from "../src/data/property-mortgage/progress";
import type { Mortgage } from "../src/data/types";

function mortgage(patch: Partial<Mortgage>): Mortgage {
  return { id: "m1", name: "Loan", payments: [], ...patch };
}

describe("mortgagePayoffProgress", () => {
  it("returns null when the loan amount is missing", () => {
    expect(mortgagePayoffProgress(mortgage({ currentBalance: 0 }))).toBeNull();
  });

  it("returns null when the current balance is missing", () => {
    expect(
      mortgagePayoffProgress(mortgage({ loanAmount: 1_000_000 })),
    ).toBeNull();
  });

  it("returns null for a non-positive loan amount", () => {
    expect(
      mortgagePayoffProgress(mortgage({ loanAmount: 0, currentBalance: 0 })),
    ).toBeNull();
  });

  it("is 0 when nothing has been paid down (balance equals loan)", () => {
    const m = mortgage({ loanAmount: 1_000_000, currentBalance: 1_000_000 });
    expect(mortgagePayoffProgress(m)).toBe(0);
  });

  it("is the amortised share between the two figures", () => {
    const m = mortgage({ loanAmount: 1_000_000, currentBalance: 750_000 });
    expect(mortgagePayoffProgress(m)).toBeCloseTo(0.25, 5);
  });

  it("is 1 when the balance reaches zero (fully paid off)", () => {
    const m = mortgage({ loanAmount: 1_000_000, currentBalance: 0 });
    expect(mortgagePayoffProgress(m)).toBe(1);
  });

  it("clamps an overpaid (negative) balance to 1", () => {
    const m = mortgage({ loanAmount: 1_000_000, currentBalance: -5_000 });
    expect(mortgagePayoffProgress(m)).toBe(1);
  });

  it("clamps a balance above the loan to 0", () => {
    const m = mortgage({ loanAmount: 1_000_000, currentBalance: 1_200_000 });
    expect(mortgagePayoffProgress(m)).toBe(0);
  });
});
