import { describe, expect, it } from "vitest";

import {
  resolveRateAt,
  resolveMonthlyInterestAt,
} from "../src/data/property-mortgage/interest";
import {
  groupPaymentsByCharge,
  resolveMonthlyPaymentAt,
  splitPaymentAcrossMortgages,
} from "../src/data/property-mortgage/payment";
import type { Mortgage, Property } from "../src/data/types";

function mortgage(over: Partial<Mortgage> = {}): Mortgage {
  return { id: "m", name: "Loan", payments: [], ...over };
}

function property(mortgages: Mortgage[]): Property {
  return { id: "p", name: "Home", valueHistory: [], mortgages };
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

  it("settles amortisation in full first, then splits the rest by interest", () => {
    const x = mortgage({
      id: "x",
      currentBalance: 1_200_000,
      interestRate: 1, // 1000/mo interest
      amortization: { mode: "fixed", amount: 2000 },
    });
    const y = mortgage({
      id: "y",
      currentBalance: 1_200_000,
      interestRate: 1, // 1000/mo interest
      amortization: { mode: "fixed", amount: 6000 },
    }); // expected total = 10000

    // Charge runs 1000 over the expected total. Amortisation stays pinned
    // (2000 / 6000); only the leftover interest (3000) is shared by interest
    // weight, which is equal here ⇒ +1500 each.
    const split = splitPaymentAcrossMortgages([x, y], 11_000, "2024-08-28");
    expect(split.get("x")).toBeCloseTo(3500);
    expect(split.get("y")).toBeCloseTo(7500);
    const total = [...split.values()].reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(11_000);
  });

  it("pins an amortising loan to its amortisation when the other carries the interest", () => {
    // x is interest-only (no amortisation); y amortises but charges no
    // interest (no rate). The variance is interest, so it lands on x.
    const x = mortgage({ id: "x", currentBalance: 1_200_000, interestRate: 1 }); // 1000 interest
    const y = mortgage({
      id: "y",
      amortization: { mode: "fixed", amount: 5000 },
    }); // 5000 amortisation, no interest

    // Charge runs 500 over the expected 6000 ⇒ y stays at 5000, x absorbs
    // its interest plus the whole variance.
    const split = splitPaymentAcrossMortgages([x, y], 6500, "2024-08-28");
    expect(split.get("x")).toBeCloseTo(1500);
    expect(split.get("y")).toBeCloseTo(5000);
  });

  it("splits by amortisation weight when the charge can't cover it", () => {
    const x = mortgage({
      id: "x",
      amortization: { mode: "fixed", amount: 2000 },
    });
    const y = mortgage({
      id: "y",
      amortization: { mode: "fixed", amount: 6000 },
    });
    // Charge below the combined amortisation ⇒ proportional, never negative.
    const split = splitPaymentAcrossMortgages([x, y], 4000, "2024-08-28");
    expect(split.get("x")).toBeCloseTo(1000);
    expect(split.get("y")).toBeCloseTo(3000);
  });

  it("spreads the leftover by amortisation when no loan charges interest", () => {
    const x = mortgage({
      id: "x",
      amortization: { mode: "fixed", amount: 2000 },
    });
    const y = mortgage({
      id: "y",
      amortization: { mode: "fixed", amount: 6000 },
    });
    // No interest anywhere ⇒ the whole charge stays proportional to
    // amortisation (x:y = 1:3).
    const split = splitPaymentAcrossMortgages([x, y], 8000, "2024-08-28");
    expect(split.get("x")).toBeCloseTo(2000);
    expect(split.get("y")).toBeCloseTo(6000);
  });
});

describe("groupPaymentsByCharge", () => {
  it("groups the records of one charge by their shared sourceHistoryId", () => {
    const a = mortgage({
      id: "a",
      payments: [
        { id: "pa", date: "2026-03-28", amount: 8000, sourceHistoryId: "h1" },
      ],
    });
    const b = mortgage({
      id: "b",
      payments: [
        { id: "pb", date: "2026-03-28", amount: 12000, sourceHistoryId: "h1" },
      ],
    });
    const groups = groupPaymentsByCharge(property([a, b]));
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(20000);
    expect(groups[0].date).toBe("2026-03-28");
    expect(groups[0].items.map((i) => i.mortgage.id)).toEqual(["a", "b"]);
  });

  it("separates distinct charges and sorts them most-recent first", () => {
    const m = mortgage({
      id: "a",
      payments: [
        { id: "p1", date: "2026-01-28", amount: 5000, sourceHistoryId: "h1" },
        { id: "p2", date: "2026-03-28", amount: 5200, sourceHistoryId: "h2" },
      ],
    });
    const groups = groupPaymentsByCharge(property([m]));
    expect(groups.map((g) => g.date)).toEqual(["2026-03-28", "2026-01-28"]);
    expect(groups.map((g) => g.total)).toEqual([5200, 5000]);
  });

  it("groups a hand-entered payment (no sourceHistoryId) by its date", () => {
    const m = mortgage({
      id: "a",
      payments: [{ id: "p1", date: "2026-02-28", amount: 4000 }],
    });
    const groups = groupPaymentsByCharge(property([m]));
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(4000);
  });
});
