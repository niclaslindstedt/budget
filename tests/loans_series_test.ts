import { describe, expect, it } from "vitest";

import {
  buildLoanBalanceBands,
  buildLoanPaymentBands,
} from "../src/data/loans/series";
import type { Loan, Property } from "../src/data/types";

function loan(overrides: Partial<Loan> & { id: string }): Loan {
  return {
    name: overrides.id,
    kind: "car",
    payments: [],
    balanceHistory: [],
    ...overrides,
  };
}

// A property carrying one linked, interest-only mortgage. No amortization on
// purpose: `balanceAt` reconstructs past balances from the real clock, so
// only a flat (non-amortising) balance is deterministic under test.
function propertyWithMortgage(overrides: {
  balance: number;
  rate?: number;
  payments?: { date: string; amount: number }[];
}): { property: Property; linked: Pick<Loan, "propertyId" | "mortgageIds"> } {
  const property: Property = {
    id: "prop-1",
    name: "prop-1",
    valueHistory: [],
    repairs: [],
    files: [],
    mortgages: [
      {
        id: "mort-1",
        name: "mort-1",
        currentBalance: overrides.balance,
        interestRate: overrides.rate,
        payments: (overrides.payments ?? []).map((p, i) => ({
          id: `mp-${i}`,
          date: p.date,
          amount: p.amount,
        })),
      },
    ],
  };
  return {
    property,
    linked: { propertyId: "prop-1", mortgageIds: ["mort-1"] },
  };
}

const ms = (iso: string) => Date.parse(iso);
const ALL = { includeStudent: true, includeMortgages: true };
const TODAY = "2026-04-15";

describe("buildLoanBalanceBands", () => {
  it("returns no bands when no loan carries a date", () => {
    expect(buildLoanBalanceBands([loan({ id: "a" })], [], TODAY, ALL)).toEqual(
      [],
    );
  });

  it("samples a snapshot-anchored loan monthly through today", () => {
    const a = loan({
      id: "a",
      balanceHistory: [{ id: "p1", date: "2026-02-10", value: 1000 }],
      payments: [{ id: "pay1", date: "2026-03-05", amount: 100 }],
    });
    const bands = buildLoanBalanceBands([a], [], TODAY, ALL);
    expect(bands).toEqual([
      {
        loanId: "a",
        points: [
          { x: ms("2026-02-28"), y: 1000 },
          { x: ms("2026-03-31"), y: 900 },
          { x: ms(TODAY), y: 900 },
        ],
      },
    ]);
  });

  it("emits aligned x arrays across bands", () => {
    const a = loan({
      id: "a",
      balanceHistory: [{ id: "p1", date: "2026-01-10", value: 500 }],
    });
    const b = loan({
      id: "b",
      startDate: "2026-03-01",
      startSum: 200,
      balanceHistory: [],
    });
    const bands = buildLoanBalanceBands([a, b], [], TODAY, ALL);
    expect(bands).toHaveLength(2);
    const [bandA, bandB] = bands;
    expect(bandA.points.map((p) => p.x)).toEqual(bandB.points.map((p) => p.x));
    expect(bandA.points).toHaveLength(4); // Jan, Feb, Mar, today
    // b's start-sum anchor is dated March; the backdated walk before it
    // re-adds payments (none here), so earlier samples hold the anchor too.
    expect(bandB.points[0]).toEqual({ x: ms("2026-01-31"), y: 200 });
    expect(bandB.points[2]).toEqual({ x: ms("2026-03-31"), y: 200 });
  });

  it("drops loans of an excluded kind", () => {
    const student = loan({
      id: "s",
      kind: "student",
      balanceHistory: [{ id: "p1", date: "2026-01-01", value: 900 }],
    });
    const car = loan({
      id: "c",
      kind: "car",
      balanceHistory: [{ id: "p2", date: "2026-01-01", value: 100 }],
    });
    const bands = buildLoanBalanceBands([student, car], [], TODAY, {
      includeStudent: false,
      includeMortgages: true,
    });
    expect(bands.map((b) => b.loanId)).toEqual(["c"]);
  });

  it("drops a loan with no balance anchor but keeps a paid-off one", () => {
    const anchorless = loan({
      id: "a",
      payments: [{ id: "pay1", date: "2026-01-05", amount: 50 }],
    });
    const paidOff = loan({
      id: "b",
      balanceHistory: [{ id: "p1", date: "2026-01-10", value: 0 }],
    });
    const bands = buildLoanBalanceBands([anchorless, paidOff], [], TODAY, ALL);
    expect(bands.map((b) => b.loanId)).toEqual(["b"]);
    expect(bands[0].points.every((p) => p.y === 0)).toBe(true);
  });

  it("clamps a negative walked balance to 0", () => {
    const a = loan({
      id: "a",
      balanceHistory: [{ id: "p1", date: "2026-02-01", value: 100 }],
      payments: [{ id: "pay1", date: "2026-03-05", amount: 500 }],
    });
    const bands = buildLoanBalanceBands([a], [], TODAY, ALL);
    expect(bands[0].points.map((p) => p.y)).toEqual([100, 0, 0]);
  });

  it("sums a linked loan's mortgage balances", () => {
    const { property, linked } = propertyWithMortgage({
      balance: 800,
      payments: [{ date: "2026-03-01", amount: 40 }],
    });
    const a = loan({ id: "a", kind: "mortgage", ...linked });
    const bands = buildLoanBalanceBands([a], [property], TODAY, ALL);
    // Interest-only mortgage: flat at currentBalance across every sample.
    expect(bands[0].points.map((p) => p.y)).toEqual([800, 800]);
  });
});

describe("buildLoanPaymentBands", () => {
  it("returns nothing when no loan carries a date", () => {
    expect(
      buildLoanPaymentBands([loan({ id: "a" })], [], TODAY, {
        ...ALL,
        breakOutInterest: false,
      }),
    ).toEqual({ loans: [], interest: null });
  });

  it("sums each month's payments and drops payment-less loans", () => {
    const a = loan({
      id: "a",
      payments: [
        { id: "p1", date: "2026-02-10", amount: 100 },
        { id: "p2", date: "2026-03-10", amount: 100 },
      ],
    });
    const idle = loan({
      id: "b",
      balanceHistory: [{ id: "s1", date: "2026-02-01", value: 999 }],
    });
    const result = buildLoanPaymentBands([a, idle], [], TODAY, {
      ...ALL,
      breakOutInterest: false,
    });
    expect(result.interest).toBeNull();
    // The range anchors on payment dates (Feb–today), not the snapshot;
    // April has no payment yet, so its bar is an honest zero.
    expect(result.loans).toEqual([
      {
        loanId: "a",
        points: [
          { x: ms("2026-02-28"), y: 100 },
          { x: ms("2026-03-31"), y: 100 },
          { x: ms(TODAY), y: 0 },
        ],
      },
    ]);
  });

  it("clamps broken-out interest to what was paid that month", () => {
    // 12% yearly on a 10 000 balance ⇒ 100/month estimated interest, but
    // only 30/month is paid — each month's interest segment must clamp to
    // that month's payment, the net segment must stay at 0 (not negative),
    // and a payment-less month must carry no phantom interest.
    const a = loan({
      id: "a",
      rate: 12,
      balanceHistory: [{ id: "s1", date: "2026-01-01", value: 10000 }],
      payments: [
        { id: "p1", date: "2026-02-10", amount: 30 },
        { id: "p2", date: "2026-03-10", amount: 30 },
      ],
    });
    const result = buildLoanPaymentBands([a], [], TODAY, {
      ...ALL,
      breakOutInterest: true,
    });
    expect(result.loans[0].points.map((p) => p.y)).toEqual([0, 0, 0]);
    expect(result.interest?.map((p) => p.y)).toEqual([30, 30, 0]);
  });

  it("estimates no interest for a rate-less loan", () => {
    const a = loan({
      id: "a",
      balanceHistory: [{ id: "s1", date: "2026-01-01", value: 1000 }],
      payments: [{ id: "p1", date: "2026-02-10", amount: 100 }],
    });
    const result = buildLoanPaymentBands([a], [], TODAY, {
      ...ALL,
      breakOutInterest: true,
    });
    expect(result.interest?.every((p) => p.y === 0)).toBe(true);
    expect(result.loans[0].points.map((p) => p.y)).toEqual([100, 0, 0]);
  });

  it("breaks a linked loan's estimated mortgage interest out", () => {
    // Interest-only mortgage at 12% on a flat 10 000 ⇒ 100/month estimate;
    // February's 400 payment covers it with room, so February splits into
    // 100 interest + 300 net while the payment-less months stay zero.
    const { property, linked } = propertyWithMortgage({
      balance: 10000,
      rate: 12,
      payments: [{ date: "2026-02-10", amount: 400 }],
    });
    const a = loan({ id: "a", kind: "mortgage", ...linked });
    const result = buildLoanPaymentBands([a], [property], TODAY, {
      ...ALL,
      breakOutInterest: true,
    });
    expect(result.interest?.map((p) => p.y)).toEqual([100, 0, 0]);
    expect(result.loans[0].points.map((p) => p.y)).toEqual([300, 0, 0]);
  });

  it("filters kinds in the payments view too", () => {
    const student = loan({
      id: "s",
      kind: "student",
      payments: [{ id: "p1", date: "2026-02-10", amount: 100 }],
    });
    const result = buildLoanPaymentBands([student], [], TODAY, {
      includeStudent: false,
      includeMortgages: true,
      breakOutInterest: false,
    });
    expect(result.loans).toEqual([]);
  });
});
