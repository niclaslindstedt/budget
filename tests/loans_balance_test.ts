import { describe, expect, it } from "vitest";

import {
  linkedMortgageFigures,
  loanPaidSoFar,
  loanRemainingBalance,
  resolveLinkedMortgages,
} from "../src/data/loans/balance";
import type { Loan, Property } from "../src/data/types";

function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: "loan-1",
    name: "Car loan",
    kind: "car",
    payments: [],
    ...over,
  };
}

describe("loanPaidSoFar", () => {
  it("sums recorded payments", () => {
    const l = loan({
      payments: [
        { id: "p1", date: "2026-01-27", amount: 1500 },
        { id: "p2", date: "2026-02-27", amount: 1500 },
      ],
    });
    expect(loanPaidSoFar(l)).toBe(3000);
  });

  it("is 0 with no payments", () => {
    expect(loanPaidSoFar(loan())).toBe(0);
  });
});

describe("loanRemainingBalance", () => {
  it("returns null when the start sum is unknown", () => {
    expect(loanRemainingBalance(loan(), "2026-06-01")).toBeNull();
  });

  it("subtracts payments when no rate is set", () => {
    const l = loan({
      startSum: 100000,
      startFee: 500,
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(96500);
  });

  it("clamps the no-rate fallback at 0", () => {
    const l = loan({
      startSum: 1000,
      payments: [{ id: "p1", date: "2026-01-27", amount: 5000 }],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(0);
  });

  it("simulates month-by-month with a rate", () => {
    // 120 000 at 12% annual (1%/month), 2 000/month, 2 months elapsed:
    // m1: 120000 + 1200 interest − 2000 = 119200
    // m2: 119200 + 1192 interest − 2000 = 118392
    const l = loan({
      startSum: 120000,
      monthlyPayment: 2000,
      rate: 12,
      startDate: "2026-01-15",
    });
    expect(loanRemainingBalance(l, "2026-03-20")).toBeCloseTo(118392, 5);
  });

  it("finances the start fee into the simulated principal", () => {
    const withFee = loan({
      startSum: 120000,
      startFee: 600,
      monthlyPayment: 2000,
      rate: 12,
      startDate: "2026-01-15",
    });
    const withoutFee = loan({
      startSum: 120000,
      monthlyPayment: 2000,
      rate: 12,
      startDate: "2026-01-15",
    });
    const a = loanRemainingBalance(withFee, "2026-02-20");
    const b = loanRemainingBalance(withoutFee, "2026-02-20");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect((a ?? 0) - (b ?? 0)).toBeCloseTo(606, 5);
  });

  it("returns the full principal before the start date", () => {
    const l = loan({
      startSum: 50000,
      startFee: 500,
      monthlyPayment: 1000,
      rate: 5,
      startDate: "2026-06-01",
    });
    expect(loanRemainingBalance(l, "2026-01-01")).toBe(50500);
  });

  it("clamps the simulation at 0 once the loan is paid off", () => {
    const l = loan({
      startSum: 5000,
      monthlyPayment: 3000,
      rate: 5,
      startDate: "2020-01-01",
    });
    expect(loanRemainingBalance(l, "2026-01-01")).toBe(0);
  });

  it("does not run away on a non-amortising loan", () => {
    // Payment below the monthly interest: the balance grows, but the
    // simulation is capped at the elapsed-month count.
    const l = loan({
      startSum: 100000,
      monthlyPayment: 10,
      rate: 12,
      startDate: "2025-01-01",
    });
    const balance = loanRemainingBalance(l, "2026-01-01");
    expect(balance).not.toBeNull();
    expect(balance ?? 0).toBeGreaterThan(100000);
  });

  it("falls back to subtraction when rate is set but terms are missing", () => {
    // No startDate → the simulation can't anchor, so payments subtract.
    const l = loan({
      startSum: 10000,
      rate: 5,
      payments: [{ id: "p1", date: "2026-01-27", amount: 1000 }],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(9000);
  });
});

describe("linked mortgages", () => {
  const property: Property = {
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
        loanAmount: 2000000,
        currentBalance: 1500000,
        interestRate: 3,
        amortization: { mode: "fixed", amount: 3000 },
        payments: [
          { id: "mp1", date: "2026-01-27", amount: 6750 },
          { id: "mp2", date: "2026-02-27", amount: 6742 },
        ],
      },
      {
        id: "m-2",
        name: "Loan 2",
        loanAmount: 600000,
        currentBalance: 500000,
        interestRate: 4.5,
        amortization: { mode: "fixed", amount: 1000 },
        payments: [{ id: "mp3", date: "2026-02-27", amount: 2875 }],
      },
    ],
  };

  it("resolves every linked mortgage behind a loan", () => {
    const l = loan({
      kind: "mortgage",
      propertyId: "prop-1",
      mortgageIds: ["m-1", "m-2"],
    });
    const linked = resolveLinkedMortgages(l, [property]);
    expect(linked?.property.name).toBe("Villa");
    expect(linked?.mortgages.map((m) => m.name)).toEqual(["Loan 1", "Loan 2"]);
  });

  it("returns null for an unlinked or dangling loan", () => {
    expect(resolveLinkedMortgages(loan(), [property])).toBeNull();
    const dangling = loan({
      kind: "mortgage",
      propertyId: "prop-1",
      mortgageIds: ["gone"],
    });
    expect(resolveLinkedMortgages(dangling, [property])).toBeNull();
  });

  it("resolves display figures live from one mortgage", () => {
    const figures = linkedMortgageFigures(
      [property.mortgages[0]],
      "2026-06-01",
    );
    expect(figures.rate).toBe(3);
    expect(figures.paidSoFar).toBe(6750 + 6742);
    // amortisation 3000 + interest 1500000 × 3% / 12 = 3750
    expect(figures.monthlyPayment).toBeCloseTo(6750, 5);
    expect(figures.remaining).not.toBeNull();
  });

  it("aggregates figures across several linked mortgages", () => {
    const figures = linkedMortgageFigures(property.mortgages, "2026-06-01");
    // Monthly payments sum: 6750 + (1000 + 500000 × 4.5% / 12 = 2875).
    expect(figures.monthlyPayment).toBeCloseTo(6750 + 2875, 5);
    // Paid-so-far sums every recorded payment across the loans.
    expect(figures.paidSoFar).toBe(6750 + 6742 + 2875);
    // The blended rate is balance-weighted:
    // (1.5M × 3 + 0.5M × 4.5) / 2M = 3.375.
    expect(figures.rate).toBeCloseTo(3.375, 5);
    expect(figures.remaining).not.toBeNull();
  });
});
