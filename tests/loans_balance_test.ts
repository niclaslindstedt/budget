import { describe, expect, it } from "vitest";

import {
  linkedMortgageFigures,
  loanMonthlyPayment,
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
    balanceHistory: [],
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
  it("returns null when neither a snapshot nor a start sum is recorded", () => {
    expect(loanRemainingBalance(loan(), "2026-06-01")).toBeNull();
  });

  it("anchors on the start sum (plus fee) when no snapshot is recorded", () => {
    const l = loan({
      startDate: "2026-01-01",
      startSum: 100000,
      startFee: 500,
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(96500);
  });

  it("anchors the start sum before the earliest payment when no start date exists", () => {
    const l = loan({
      startSum: 10000,
      payments: [{ id: "p1", date: "2026-01-27", amount: 1000 }],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(9000);
  });

  it("lets a recorded snapshot override the start sum from its date on", () => {
    const l = loan({
      startDate: "2026-01-01",
      startSum: 100000,
      balanceHistory: [{ id: "b1", date: "2026-03-01", value: 95000 }],
      payments: [
        // Already reflected by the snapshot — must not double-count.
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-03-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(93000);
    // Before the snapshot the start sum still anchors.
    expect(loanRemainingBalance(l, "2026-02-01")).toBe(98000);
  });

  it("subtracts payments after the snapshot when no rate is set", () => {
    const l = loan({
      balanceHistory: [{ id: "b1", date: "2026-01-01", value: 100500 }],
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(96500);
  });

  it("treats the snapshot as end-of-day — same-day payments don't subtract", () => {
    const l = loan({
      balanceHistory: [{ id: "b1", date: "2026-01-27", value: 100000 }],
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(98000);
  });

  it("ignores payments after the asked date", () => {
    const l = loan({
      balanceHistory: [{ id: "b1", date: "2026-01-01", value: 100000 }],
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-02-01")).toBe(98000);
  });

  it("anchors on the latest snapshot at or before the date", () => {
    const l = loan({
      balanceHistory: [
        { id: "b1", date: "2026-01-01", value: 100000 },
        { id: "b2", date: "2026-03-01", value: 95000 },
      ],
      payments: [
        // Already reflected by the second snapshot — must not double-count.
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-03-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(93000);
  });

  it("walks backward from a future snapshot by re-adding payments", () => {
    const l = loan({
      balanceHistory: [{ id: "b1", date: "2026-03-01", value: 95000 }],
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-01-01")).toBe(99000);
  });

  it("clamps the no-rate walk at 0", () => {
    const l = loan({
      balanceHistory: [{ id: "b1", date: "2026-01-01", value: 1000 }],
      payments: [{ id: "p1", date: "2026-01-27", amount: 5000 }],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(0);
  });

  it("accrues monthly interest before each month's payments with a rate", () => {
    // 120 000 at 12% annual (1%/month), 2 000 paid in Feb and Mar:
    // Feb: 120000 + 1200 interest − 2000 = 119200
    // Mar: 119200 + 1192 interest − 2000 = 118392
    const l = loan({
      rate: 12,
      balanceHistory: [{ id: "b1", date: "2026-01-15", value: 120000 }],
      payments: [
        { id: "p1", date: "2026-02-15", amount: 2000 },
        { id: "p2", date: "2026-03-15", amount: 2000 },
      ],
    });
    expect(loanRemainingBalance(l, "2026-03-20")).toBeCloseTo(118392, 5);
  });

  it("grows by interest when a rated loan has no recorded payments", () => {
    // 100 000 at 12% annual (1%/month), two whole months elapsed.
    const l = loan({
      rate: 12,
      balanceHistory: [{ id: "b1", date: "2026-01-15", value: 100000 }],
    });
    expect(loanRemainingBalance(l, "2026-03-15")).toBeCloseTo(102010, 5);
  });

  it("clamps the rated walk at 0 once the loan is paid off", () => {
    const l = loan({
      rate: 5,
      balanceHistory: [{ id: "b1", date: "2026-01-01", value: 1000 }],
      payments: [{ id: "p1", date: "2026-02-01", amount: 5000 }],
    });
    expect(loanRemainingBalance(l, "2026-06-01")).toBe(0);
  });
});

describe("loanMonthlyPayment", () => {
  it("returns null with no payments recorded", () => {
    expect(loanMonthlyPayment(loan(), "2026-06-01")).toBeNull();
  });

  it("averages the current year's payment months", () => {
    const l = loan({
      payments: [
        { id: "p0", date: "2025-12-27", amount: 9999 },
        { id: "p1", date: "2026-01-27", amount: 2000 },
        { id: "p2", date: "2026-02-27", amount: 2100 },
        { id: "p3", date: "2026-03-27", amount: 2200 },
      ],
    });
    // Three months in 2026 ⇒ last year's level is out of the window.
    expect(loanMonthlyPayment(l, "2026-06-01")).toBeCloseTo(2100, 5);
  });

  it("falls back to the last three payment months at the start of the year", () => {
    const l = loan({
      payments: [
        { id: "p1", date: "2025-10-27", amount: 1000 },
        { id: "p2", date: "2025-11-27", amount: 2000 },
        { id: "p3", date: "2025-12-27", amount: 2100 },
        { id: "p4", date: "2026-01-27", amount: 2200 },
      ],
    });
    // Only one month landed in 2026 ⇒ average the three most recent
    // payment months across the year boundary.
    expect(loanMonthlyPayment(l, "2026-02-01")).toBeCloseTo(
      (2000 + 2100 + 2200) / 3,
      5,
    );
  });

  it("sums split rows within a month and ignores future payments", () => {
    const l = loan({
      payments: [
        { id: "p1", date: "2026-01-27", amount: 2400 },
        { id: "p2", date: "2026-02-27", amount: 2600 },
        { id: "p3", date: "2026-03-05", amount: 1000 },
        { id: "p4", date: "2026-03-27", amount: 1500 },
        { id: "p5", date: "2026-07-27", amount: 9999 },
      ],
    });
    expect(loanMonthlyPayment(l, "2026-06-01")).toBeCloseTo(
      (2400 + 2600 + 2500) / 3,
      5,
    );
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
