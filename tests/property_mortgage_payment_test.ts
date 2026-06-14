import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveRateAt,
  resolveMonthlyInterestAt,
} from "../src/data/finance/interest";
import {
  groupPaymentsByCharge,
  reconcileMortgageAmortization,
  resolveMonthlyPaymentAt,
  splitPaymentAcrossMortgages,
  splitRecordedPayment,
} from "../src/data/finance/payment";
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
  // Pin "today" to the charge date so the reconstructed balance collapses to
  // the recorded `currentBalance` (the historical-balance math is exercised
  // in its own block below).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-08-28T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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
  // Pin "today" to the charge date so each loan's reconstructed balance
  // equals its recorded `currentBalance` — these cases exercise the
  // amortisation-first / computed-interest split, not the date reconstruction.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-08-28T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("pins each loan to its computed interest, then rides the residual on amortisation", () => {
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
    // (2000 / 6000) and each loan keeps its computed 1000 interest; the 1000
    // residual is the model's estimate error, attributed to the loans whose
    // balance moved by amortisation weight (2000 : 6000 ⇒ +250 / +750).
    const split = splitPaymentAcrossMortgages([x, y], 11_000, "2024-08-28");
    expect(split.get("x")).toBeCloseTo(3250); // 2000 amort + 1000 int + 250
    expect(split.get("y")).toBeCloseTo(7750); // 6000 amort + 1000 int + 750
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

describe("splitPaymentAcrossMortgages — date-aware balances", () => {
  // "Today" is fixed so the reconstructed balances are deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // An interest-only loan at a static rate alongside an amortising loan.
  // The combined charge shrinks month over month purely because the
  // amortising loan pays down — so the whole decline must land on it, and
  // the interest-only loan's share must stay flat. A flat-`currentBalance`
  // snapshot would instead smear the decline across both by interest weight
  // (the bug behind "interest going down on a loan that never amortises").
  const interestOnly = mortgage({
    id: "io",
    currentBalance: 2_000_000,
    interestRate: 3, // 5000/mo, constant
  });
  const amortising = mortgage({
    id: "am",
    currentBalance: 200_000, // today's balance
    interestRate: 3,
    amortization: { mode: "fixed", amount: 5000 },
  });
  const loans = [interestOnly, amortising];

  it("keeps the interest-only loan's share flat across months", () => {
    // This month's true charge: 5000 (io interest) + 5000 (am amort) + 500
    // (am interest on 200 000 @ 3%).
    const thisMonth = splitPaymentAcrossMortgages(loans, 10_500, "2026-06-01");
    // Last month am's balance was 205 000 ⇒ 512.5 interest, so the charge was
    // 12.5 higher.
    const lastMonth = splitPaymentAcrossMortgages(
      loans,
      10_512.5,
      "2026-05-01",
    );

    // The interest-only loan is pinned to exactly its 5000 both months — the
    // 12.5 difference is entirely the amortising loan's.
    expect(thisMonth.get("io")).toBeCloseTo(5000);
    expect(lastMonth.get("io")).toBeCloseTo(5000);

    expect(thisMonth.get("am")).toBeCloseTo(5500); // 5000 amort + 500 interest
    expect(lastMonth.get("am")).toBeCloseTo(5512.5); // 5000 amort + 512.5
  });

  // The drifting-charge case: the recorded charge is the actual bank amount,
  // which never lines up exactly with the modelled total (historical balances
  // and rounding drift). A large fixed interest-only loan beside a smaller
  // amortising loan — when the recorded charge differs from the model, the
  // interest-only loan must still keep its computed interest flat. The old
  // interest-weight split smeared that gap by interest magnitude, so the
  // dominant interest-only loan absorbed almost all of it and its "interest"
  // visibly fell month over month even though its balance never moved.
  const bigFixed = mortgage({
    id: "fixed",
    currentBalance: 4_000_000,
    interestRate: 1.5, // 4_000_000 * 1.5% / 12 = 5000/mo, constant
  });
  const smallAmortising = mortgage({
    id: "amort",
    currentBalance: 2_000_000, // today's balance
    interestRate: 3,
    amortization: { mode: "fixed", amount: 10_000 },
  });
  const driftingLoans = [bigFixed, smallAmortising];

  it("keeps a large fixed interest-only loan flat when the charge drifts from the model", () => {
    // This month the recorded charge happens to match the model exactly:
    // 5000 (fixed interest) + 10000 (amort) + 5000 (amort interest @ today).
    const thisMonth = splitPaymentAcrossMortgages(
      driftingLoans,
      20_000,
      "2026-06-01",
    );
    // Last month the amortising loan's balance was 2_010_000 ⇒ 5025 interest,
    // so the model expects 20_025 — but the bank actually charged 19_950. The
    // 75 shortfall is the amortising loan's, NOT the fixed loan's.
    const lastMonth = splitPaymentAcrossMortgages(
      driftingLoans,
      19_950,
      "2026-05-01",
    );

    // The fixed interest-only loan stays pinned to exactly 5000 both months,
    // despite the charge drifting from the model (the old split let it drift
    // below its computed interest, the reported bug).
    expect(thisMonth.get("fixed")).toBeCloseTo(5000);
    expect(lastMonth.get("fixed")).toBeCloseTo(5000);

    // The amortising loan carries its amortisation, its computed interest, and
    // the whole residual.
    expect(thisMonth.get("amort")).toBeCloseTo(15_000); // 10000 + 5000
    expect(lastMonth.get("amort")).toBeCloseTo(14_950); // 10000 + 5025 - 75

    expect([...thisMonth.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(
      20_000,
    );
    expect([...lastMonth.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(
      19_950,
    );
  });
});

describe("splitRecordedPayment", () => {
  it("splits a recorded share into its amortisation and the leftover interest", () => {
    const m = mortgage({ amortization: { mode: "fixed", amount: 5000 } });
    // A 7200 share = 5000 amortisation + 2200 interest.
    const split = splitRecordedPayment(m, {
      id: "p",
      date: "2024-08-28",
      amount: 7200,
    });
    expect(split.amortization).toBeCloseTo(5000);
    expect(split.interest).toBeCloseTo(2200);
  });

  it("resolves a percent-mode amortisation against the initial loan", () => {
    const m = mortgage({
      loanAmount: 1_200_000,
      amortization: { mode: "percent", percent: 2 },
    }); // 2% of 1.2M ÷ 12 = 2000/mo
    const split = splitRecordedPayment(m, {
      id: "p",
      date: "2024-08-28",
      amount: 5000,
    });
    expect(split.amortization).toBeCloseTo(2000);
    expect(split.interest).toBeCloseTo(3000);
  });

  it("treats the whole share as interest when the loan has no amortisation", () => {
    const m = mortgage({ interestRate: 3 });
    const split = splitRecordedPayment(m, {
      id: "p",
      date: "2024-08-28",
      amount: 4000,
    });
    expect(split.amortization).toBe(0);
    expect(split.interest).toBeCloseTo(4000);
  });

  it("never reports negative interest when the charge undercuts the amortisation", () => {
    const m = mortgage({ amortization: { mode: "fixed", amount: 5000 } });
    // An under-covered charge records less than the full amortisation; the
    // whole share is principal and there is no interest.
    const split = splitRecordedPayment(m, {
      id: "p",
      date: "2024-08-28",
      amount: 3000,
    });
    expect(split.amortization).toBeCloseTo(3000);
    expect(split.interest).toBe(0);
  });

  it("always sums back to the recorded amount", () => {
    const m = mortgage({ amortization: { mode: "fixed", amount: 5000 } });
    const payment = { id: "p", date: "2024-08-28", amount: 7250.5 };
    const split = splitRecordedPayment(m, payment);
    expect(split.amortization + split.interest).toBeCloseTo(payment.amount);
  });
});

describe("splitRecordedPayment — constant amortisation across a series", () => {
  // The amortisation leg is the loan's plan figure — a fixed sum or an exact
  // percent of the *initial* loan — so it must be IDENTICAL across every charge
  // of that plan, with the whole month-to-month difference landing on interest.
  // These guard against the drift bug where the amortisation leg tracked the
  // balance a few currency units at a time instead of staying pinned to the
  // plan (the small per-month wobble the user saw in the payments view).

  it("keeps a percent-mode amortisation identical while interest carries the drift", () => {
    const m = mortgage({
      loanAmount: 2_400_000,
      currentBalance: 2_000_000,
      interestRate: 3,
      amortization: { mode: "percent", percent: 2 }, // 2% of 2.4M ÷ 12 = 4000/mo
    });
    // Three monthly charges whose totals drift as the balance (and so the
    // interest) falls month over month.
    const splits = [9100, 9050, 9000].map((amount, i) =>
      splitRecordedPayment(m, {
        id: `p${i}`,
        date: `2026-0${i + 1}-28`,
        amount,
      }),
    );
    // Amortisation is the exact plan figure on every charge — no drift.
    for (const s of splits) expect(s.amortization).toBeCloseTo(4000);
    // The entire month-to-month difference is on interest.
    expect(splits[0].interest).toBeCloseTo(5100);
    expect(splits[1].interest).toBeCloseTo(5050);
    expect(splits[2].interest).toBeCloseTo(5000);
  });

  it("keeps a fixed-mode amortisation identical regardless of the balance", () => {
    // A sold property zeroes the balance; the amortisation leg must not move
    // with it. The plan figure shows on every charge whatever the balance.
    const m = mortgage({
      loanAmount: 3_000_000,
      currentBalance: 0, // settled at the sale
      interestRate: 2,
      amortization: { mode: "fixed", amount: 6000 },
    });
    const a = splitRecordedPayment(m, {
      id: "a",
      date: "2021-05-28",
      amount: 11_000,
    });
    const b = splitRecordedPayment(m, {
      id: "b",
      date: "2022-05-28",
      amount: 10_800,
    });
    expect(a.amortization).toBeCloseTo(6000);
    expect(b.amortization).toBeCloseTo(6000);
    expect(a.interest).toBeCloseTo(5000);
    expect(b.interest).toBeCloseTo(4800);
  });

  it("pins amortisation to the plan even when a charge far exceeds it", () => {
    // A charge well above plan + the rate's interest still leaves amortisation
    // at the plan figure; the surplus is interest, never silently reassigned to
    // principal (which is what made the amortisation leg drift).
    const m = mortgage({
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 3,
      amortization: { mode: "percent", percent: 2 }, // 2000/mo
    });
    const split = splitRecordedPayment(m, {
      id: "p",
      date: "2024-08-28",
      amount: 6000,
    });
    expect(split.amortization).toBeCloseTo(2000);
    expect(split.interest).toBeCloseTo(4000);
  });
});

describe("splitRecordedPayment — amortisation-plan changes", () => {
  // The amortisation leg follows the plan in effect on the charge's date. When
  // a bank steps the plan down (e.g. 3% → 2%) the amortisation leg steps with
  // it — an exact, round change — and, because the loan and rate are unchanged,
  // the interest leg stays flat (the whole drop in the total payment is the
  // amortisation stepping down). This is the case the user reported.
  const planChange = mortgage({
    loanAmount: 1_200_000,
    amortization: { mode: "percent", percent: 2 }, // current plan: 2000/mo
    amortizationHistory: [
      { id: "a0", date: "", amortization: { mode: "percent", percent: 3 } }, // 3000/mo
      {
        id: "a1",
        date: "2024-01-01",
        amortization: { mode: "percent", percent: 2 }, // 2000/mo
      },
    ],
  });

  it("steps the amortisation leg at the change and keeps interest flat", () => {
    // Before the step the charge is larger by the steeper amortisation; the
    // interest the rate explains is the same both months.
    const before = splitRecordedPayment(planChange, {
      id: "p1",
      date: "2023-12-28",
      amount: 5500, // 3000 amort + 2500 interest
    });
    expect(before.amortization).toBeCloseTo(3000);
    expect(before.interest).toBeCloseTo(2500);

    const after = splitRecordedPayment(planChange, {
      id: "p2",
      date: "2024-02-28",
      amount: 4500, // 2000 amort + 2500 interest
    });
    expect(after.amortization).toBeCloseTo(2000);
    // Interest unchanged — only the amortisation stepped down.
    expect(after.interest).toBeCloseTo(2500);
  });

  it("the first charge on/after the change date follows the new plan", () => {
    // A charge dated exactly on the change → new plan.
    const on = splitRecordedPayment(planChange, {
      id: "p",
      date: "2024-01-01",
      amount: 4500,
    });
    expect(on.amortization).toBeCloseTo(2000);
    // The day before → old plan.
    const dayBefore = splitRecordedPayment(planChange, {
      id: "p",
      date: "2023-12-31",
      amount: 5500,
    });
    expect(dayBefore.amortization).toBeCloseTo(3000);
  });

  it("holds the amortisation constant within each plan period", () => {
    // Several charges either side of the step: the leg is one constant before
    // and another constant after, never drifting between them.
    const old = ["2023-09-28", "2023-10-28", "2023-11-28"].map(
      (date, i) =>
        splitRecordedPayment(planChange, { id: `o${i}`, date, amount: 5500 })
          .amortization,
    );
    const recent = ["2024-03-28", "2024-04-28", "2024-05-28"].map(
      (date, i) =>
        splitRecordedPayment(planChange, { id: `r${i}`, date, amount: 4500 })
          .amortization,
    );
    for (const a of old) expect(a).toBeCloseTo(3000);
    for (const a of recent) expect(a).toBeCloseTo(2000);
  });
});

describe("splitPaymentAcrossMortgages — dated amortisation plan", () => {
  it("settles the amortisation in effect on the charge's date", () => {
    // One loan with a stepped plan: a combined charge settles amortisation
    // first, so the amount attributed must use the plan dated to the charge.
    const m = mortgage({
      id: "m",
      loanAmount: 1_200_000,
      interestRate: 3,
      amortization: { mode: "percent", percent: 2 },
      amortizationHistory: [
        { id: "a0", date: "", amortization: { mode: "percent", percent: 3 } },
        {
          id: "a1",
          date: "2024-01-01",
          amortization: { mode: "percent", percent: 2 },
        },
      ],
    });
    // A single-loan charge gets the whole amount; the split still resolves the
    // dated amortisation internally, which `splitRecordedPayment` then inverts.
    const before = splitPaymentAcrossMortgages([m], 5500, "2023-12-28");
    expect(
      splitRecordedPayment(m, {
        id: "p",
        date: "2023-12-28",
        amount: before.get("m") ?? 0,
      }).amortization,
    ).toBeCloseTo(3000);
  });
});

describe("reconcileMortgageAmortization", () => {
  it("reports the gap between the balance drop and the recorded amortisation", () => {
    const m = mortgage({
      loanAmount: 1_000_000,
      currentBalance: 940_000, // 60 000 paid down
      amortization: { mode: "fixed", amount: 5000 },
      payments: [
        // Two months recorded → 10 000 of amortisation; 50 000 unaccounted.
        { id: "p1", date: "2026-01-28", amount: 8000 },
        { id: "p2", date: "2026-02-28", amount: 8000 },
      ],
    });
    const [r] = reconcileMortgageAmortization(property([m]));
    expect(r.expectedAmortized).toBe(60_000);
    expect(r.recordedAmortized).toBeCloseTo(10_000);
    expect(r.unaccounted).toBeCloseTo(50_000);
  });

  it("reports a balanced loan as zero unaccounted", () => {
    const m = mortgage({
      loanAmount: 1_000_000,
      currentBalance: 990_000, // 10 000 paid down
      amortization: { mode: "fixed", amount: 5000 },
      payments: [
        { id: "p1", date: "2026-01-28", amount: 8000 },
        { id: "p2", date: "2026-02-28", amount: 8000 },
      ],
    });
    const [r] = reconcileMortgageAmortization(property([m]));
    expect(r.unaccounted).toBeCloseTo(0);
  });

  it("goes negative when more amortisation is recorded than the balance dropped", () => {
    const m = mortgage({
      loanAmount: 1_000_000,
      currentBalance: 996_000, // only 4 000 paid down
      amortization: { mode: "fixed", amount: 5000 },
      payments: [{ id: "p1", date: "2026-01-28", amount: 8000 }], // 5 000 amortised
    });
    const [r] = reconcileMortgageAmortization(property([m]));
    expect(r.unaccounted).toBeCloseTo(-1000);
  });

  it("skips mortgages missing a loan amount or current balance", () => {
    const noBalance = mortgage({ id: "a", loanAmount: 1_000_000 });
    const noLoan = mortgage({ id: "b", currentBalance: 900_000 });
    const full = mortgage({
      id: "c",
      loanAmount: 1_000_000,
      currentBalance: 900_000,
    });
    const result = reconcileMortgageAmortization(
      property([noBalance, noLoan, full]),
    );
    expect(result.map((r) => r.mortgage.id)).toEqual(["c"]);
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

  it("carries the payment's source account so the popover can resolve a charge drawn from any account", () => {
    const m = mortgage({
      id: "a",
      payments: [
        {
          id: "p1",
          date: "2026-03-28",
          amount: 8000,
          sourceHistoryId: "h1",
          sourceAccountId: "acct-other",
        },
      ],
    });
    const groups = groupPaymentsByCharge(property([m]));
    expect(groups).toHaveLength(1);
    expect(groups[0].sourceHistoryId).toBe("h1");
    expect(groups[0].sourceAccountId).toBe("acct-other");
  });
});
