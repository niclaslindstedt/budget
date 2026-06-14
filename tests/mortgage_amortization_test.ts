import { describe, expect, it } from "vitest";

import {
  resolveAmortizationPlanAt,
  resolveMonthlyAmortization,
  resolveMonthlyAmortizationAt,
} from "../src/data/finance/amortization";
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

  it("reads the current plan, not an older history entry", () => {
    // The current `amortization` mirrors the latest history entry, so the plain
    // resolver must return the current (2%) plan, not the original (3%).
    const m = mortgage({
      loanAmount: 1_200_000,
      amortization: { mode: "percent", percent: 2 }, // 2000/mo
      amortizationHistory: [
        { id: "a0", date: "", amortization: { mode: "percent", percent: 3 } },
        {
          id: "a1",
          date: "2024-01-01",
          amortization: { mode: "percent", percent: 2 },
        },
      ],
    });
    expect(resolveMonthlyAmortization(m)).toBeCloseTo(2000);
  });
});

describe("resolveAmortizationPlanAt", () => {
  it("falls back to the current plan when no history is recorded", () => {
    const m = mortgage({ amortization: { mode: "fixed", amount: 4000 } });
    expect(resolveAmortizationPlanAt(m, "2024-01-01")).toEqual({
      mode: "fixed",
      amount: 4000,
    });
  });

  it("returns undefined when neither history nor a current plan is known", () => {
    expect(
      resolveAmortizationPlanAt(mortgage({}), "2024-01-01"),
    ).toBeUndefined();
  });

  it("walks the history to the plan in effect on the date", () => {
    const m = mortgage({
      amortization: { mode: "percent", percent: 1 },
      amortizationHistory: [
        { id: "a0", date: "", amortization: { mode: "percent", percent: 3 } },
        {
          id: "a1",
          date: "2023-06-01",
          amortization: { mode: "percent", percent: 2 },
        },
        {
          id: "a2",
          date: "2024-01-01",
          amortization: { mode: "percent", percent: 1 },
        },
      ],
    });
    // Before any dated change → the original (blank-date) plan.
    expect(resolveAmortizationPlanAt(m, "2023-01-15")).toEqual({
      mode: "percent",
      percent: 3,
    });
    // Between two changes → the earlier of the two.
    expect(resolveAmortizationPlanAt(m, "2023-09-15")).toEqual({
      mode: "percent",
      percent: 2,
    });
    // On / after the last change → the current plan.
    expect(resolveAmortizationPlanAt(m, "2024-05-15")).toEqual({
      mode: "percent",
      percent: 1,
    });
  });
});

describe("resolveMonthlyAmortizationAt", () => {
  it("resolves the dated percent plan against the initial loan", () => {
    const m = mortgage({
      loanAmount: 1_200_000,
      amortization: { mode: "percent", percent: 2 },
      amortizationHistory: [
        { id: "a0", date: "", amortization: { mode: "percent", percent: 3 } }, // 3000/mo
        {
          id: "a1",
          date: "2024-01-01",
          amortization: { mode: "percent", percent: 2 }, // 2000/mo
        },
      ],
    });
    // 3% of 1.2M ÷ 12 = 3000 before the step; 2% ÷ 12 = 2000 after.
    expect(resolveMonthlyAmortizationAt(m, "2023-08-28")).toBeCloseTo(3000);
    expect(resolveMonthlyAmortizationAt(m, "2024-08-28")).toBeCloseTo(2000);
  });

  it("steps a fixed-mode plan at the change date", () => {
    const m = mortgage({
      amortization: { mode: "fixed", amount: 4000 },
      amortizationHistory: [
        { id: "a0", date: "", amortization: { mode: "fixed", amount: 6000 } },
        {
          id: "a1",
          date: "2024-01-01",
          amortization: { mode: "fixed", amount: 4000 },
        },
      ],
    });
    expect(resolveMonthlyAmortizationAt(m, "2023-12-31")).toBe(6000);
    expect(resolveMonthlyAmortizationAt(m, "2024-01-01")).toBe(4000);
  });

  it("falls back to the current plan when no history is recorded", () => {
    const m = mortgage({
      loanAmount: 1_000_000,
      amortization: { mode: "percent", percent: 2 },
    });
    expect(resolveMonthlyAmortizationAt(m, "2020-01-01")).toBeCloseTo(
      1666.67,
      2,
    );
  });
});
