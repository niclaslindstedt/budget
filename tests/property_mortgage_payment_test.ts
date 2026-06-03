import { describe, expect, it } from "vitest";

import {
  resolveRateAt,
  resolveMonthlyInterestAt,
} from "../src/data/property-mortgage/interest";
import {
  resolveMonthlyPaymentAt,
  splitPaymentAcrossMortgages,
} from "../src/data/property-mortgage/payment";
import type { Mortgage } from "../src/data/types";

function mortgage(over: Partial<Mortgage> = {}): Mortgage {
  return { id: "m", name: "Loan", payments: [], ...over };
}

describe("resolveRateAt", () => {
  it("falls back to the headline rate when no history is recorded", () => {
    const m = mortgage({ interestRate: 3.45 });
    expect(resolveRateAt(m, "2024-01-01")).toBe(3.45);
  });

  it("returns null when neither history nor headline rate is known", () => {
    expect(resolveRateAt(mortgage(), "2024-01-01")).toBeNull();
  });

  it("walks the history to the rate in effect on the date", () => {
    const m = mortgage({
      interestRate: 3.0,
      rateHistory: [
        { id: "a", date: "", rate: 1.0 },
        { id: "b", date: "2023-06-01", rate: 2.0 },
        { id: "c", date: "2024-01-01", rate: 3.0 },
      ],
    });
    // Before any dated change → the original (blank-date) rate.
    expect(resolveRateAt(m, "2023-01-15")).toBe(1.0);
    // Between two changes → the earlier of the two.
    expect(resolveRateAt(m, "2023-09-15")).toBe(2.0);
    // On/after the last change → the current rate.
    expect(resolveRateAt(m, "2024-05-15")).toBe(3.0);
  });
});

describe("resolveMonthlyInterestAt", () => {
  it("uses the rate in effect that month on the current balance", () => {
    const m = mortgage({
      currentBalance: 1_200_000,
      rateHistory: [
        { id: "a", date: "", rate: 1.0 },
        { id: "b", date: "2024-01-01", rate: 3.0 },
      ],
    });
    // 1% on 1,200,000 ÷ 12 = 1000 before the change.
    expect(resolveMonthlyInterestAt(m, "2023-08-28")).toBeCloseTo(1000);
    // 3% on 1,200,000 ÷ 12 = 3000 after.
    expect(resolveMonthlyInterestAt(m, "2024-08-28")).toBeCloseTo(3000);
  });
});

describe("resolveMonthlyPaymentAt", () => {
  it("sums amortisation and dated interest", () => {
    const m = mortgage({
      currentBalance: 1_200_000,
      interestRate: 3.0,
      amortization: { mode: "fixed", amount: 5000 },
    });
    // 5000 amort + 3000 interest.
    expect(resolveMonthlyPaymentAt(m, "2024-08-28")).toBeCloseTo(8000);
  });
});

describe("splitPaymentAcrossMortgages", () => {
  const a = mortgage({
    id: "a",
    currentBalance: 1_200_000,
    interestRate: 3,
    amortization: { mode: "fixed", amount: 5000 },
  }); // expected 8000
  const b = mortgage({
    id: "b",
    currentBalance: 600_000,
    interestRate: 3,
    amortization: { mode: "fixed", amount: 2500 },
  }); // expected 4000

  it("splits by expected share and sums to the charge exactly", () => {
    const split = splitPaymentAcrossMortgages([a, b], 12_000, "2024-08-28");
    expect(split.get("a")).toBeCloseTo(8000);
    expect(split.get("b")).toBeCloseTo(4000);
    const total = [...split.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(12_000);
  });

  it("gives the whole charge to a single mortgage", () => {
    const split = splitPaymentAcrossMortgages([a], 8123.45, "2024-08-28");
    expect(split.get("a")).toBeCloseTo(8123.45);
  });

  it("splits evenly when no mortgage has terms to weight by", () => {
    const split = splitPaymentAcrossMortgages(
      [mortgage({ id: "a" }), mortgage({ id: "b" })],
      1000,
      "2024-08-28",
    );
    expect(split.get("a")).toBeCloseTo(500);
    expect(split.get("b")).toBeCloseTo(500);
  });
});
