import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  balanceAt,
  resolveMonthlyInterest,
} from "../src/data/finance/interest";
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

describe("balanceAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when neither balance nor loan amount is known", () => {
    expect(
      balanceAt(mortgage({ interestRate: 3 }), "2026-01-01"),
    ).toBeUndefined();
  });

  it("holds an interest-only loan's balance flat across time", () => {
    const m = mortgage({ currentBalance: 2_000_000, interestRate: 3 });
    expect(balanceAt(m, "2025-01-01")).toBe(2_000_000);
    expect(balanceAt(m, "2026-06-01")).toBe(2_000_000);
  });

  it("reconstructs a higher balance in past months for an amortising loan", () => {
    const m = mortgage({
      currentBalance: 200_000,
      amortization: { mode: "fixed", amount: 5000 },
    });
    // Today's balance is current; three whole months back it was higher by
    // three amortisations.
    expect(balanceAt(m, "2026-06-01")).toBe(200_000);
    expect(balanceAt(m, "2026-03-01")).toBe(215_000);
  });

  it("caps the reconstructed balance at the original loan amount", () => {
    const m = mortgage({
      loanAmount: 210_000,
      currentBalance: 200_000,
      amortization: { mode: "fixed", amount: 5000 },
    });
    // Three months back would be 215 000, but the loan was only 210 000.
    expect(balanceAt(m, "2026-03-01")).toBe(210_000);
  });

  it("projects a lower balance forward and never below zero", () => {
    const m = mortgage({
      currentBalance: 8000,
      amortization: { mode: "fixed", amount: 5000 },
    });
    // One month ahead drops it by 5000; two months ahead floors at 0.
    expect(balanceAt(m, "2026-07-01")).toBe(3000);
    expect(balanceAt(m, "2026-08-01")).toBe(0);
  });

  it("reconstructs forward from the loan amount when a start date is given", () => {
    const m = mortgage({
      loanAmount: 1_000_000,
      currentBalance: 700_000,
      amortization: { mode: "fixed", amount: 10_000 },
    });
    // 24 months after the 2020-01 start: 1,000,000 - 24 × 10,000 = 760,000.
    expect(balanceAt(m, "2022-01-01", "2020-01-01")).toBe(760_000);
    // Before the loan started it owes the whole loan.
    expect(balanceAt(m, "2019-06-01", "2020-01-01")).toBe(1_000_000);
    // Fully amortised, floored at 0 (100 months × 10,000 > loan).
    expect(balanceAt(m, "2028-06-01", "2020-01-01")).toBe(0);
  });

  it("ignores a zeroed current balance for a sold loan when reconstructing forward", () => {
    // A sold property zeroes the balance at the sale; walking back from 0 would
    // understate every historical balance. The start anchor recovers the real
    // figure the loan carried that month.
    const m = mortgage({
      loanAmount: 1_000_000,
      currentBalance: 0, // settled at the sale
      amortization: { mode: "fixed", amount: 10_000 },
    });
    // Backward from 0 (no start) would give 0 + 36 × 10,000 = 360,000.
    expect(balanceAt(m, "2023-06-01")).toBe(360_000);
    // Forward from the 2020-01 start: 1,000,000 - 41 × 10,000 = 590,000.
    expect(balanceAt(m, "2023-06-01", "2020-01-01")).toBe(590_000);
  });
});
