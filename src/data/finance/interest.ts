// Resolve a mortgage's interest — the interest charged in a given month —
// to a concrete amount in the user's currency. Interest accrues on the
// outstanding debt at the annual rate in effect that month:
//
//   monthly = balance × rate/100 ÷ 12
//
// where `balance` is the outstanding debt *at that month* (see `balanceAt`)
// and `rate` is resolved from the mortgage's effective-dated `rateHistory`
// (or the headline `interestRate` when no history is recorded). Returns
// `null` when neither a balance nor a rate is known — there's nothing to
// charge interest on.
//
// The balance is reconstructed per month rather than held flat at
// `currentBalance` so that interest is attributed to the loan whose balance
// actually moved: an amortising loan's interest falls month over month as it
// pays down, while an interest-only loan's stays constant. This matters when
// a combined charge is split across several loans (see
// `splitPaymentAcrossMortgages`) — a flat snapshot would smear one loan's
// declining interest proportionally across all of them.
//
// When the loan's start is known the reconstruction runs *forward* from the
// original loan amount (`balanceAt`'s `startDate`) instead of backward from
// today's `currentBalance` — the latter is wrong once `currentBalance` no
// longer reflects the amortisation schedule, e.g. a sold property whose
// balance was zeroed at the sale.

import type { Mortgage } from "../types";
import { isoToMonthNum, todayIso } from "../../utils/date";
import { resolveMonthlyAmortization } from "./amortization";

// The annual rate (percent) in effect on `date`, walking the mortgage's
// effective-dated rate history: the most recent change on or before the
// date wins; a date before the earliest recorded change uses that earliest
// rate (the loan's original rate extends backward). Falls back to the
// headline `interestRate` when no history is recorded, and `null` when
// neither is known.
export function resolveRateAt(mortgage: Mortgage, date: string): number | null {
  const history = mortgage.rateHistory;
  if (history && history.length > 0) {
    const sorted = [...history].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    let rate = sorted[0].rate;
    for (const change of sorted) {
      if (change.date <= date) rate = change.rate;
      else break;
    }
    return rate;
  }
  return mortgage.interestRate ?? null;
}

// The outstanding balance on `date`. Two reconstructions, chosen by whether
// the loan's start is known:
//
// 1. **Forward from the starting balance** — when `startDate` is given and
//    the loan records a `loanAmount`: the balance at `date` is the original
//    loan minus the amortisation accrued between the start and `date`
//    (`loanAmount − monthlyAmort × monthsSinceStart`). This is the reliable
//    anchor whenever the recorded `currentBalance` doesn't reflect the smooth
//    amortisation schedule — most visibly a **sold / paid-off property** whose
//    balance was zeroed at the sale: walking back from 0 (option 2) would
//    understate every historical balance, so a payment's interest would be
//    charged on far too little. A date before the loan started owes the whole
//    loan, so it caps at `loanAmount`; floored at 0 once fully amortised.
//
// 2. **Backward from today's recorded balance** — the fallback when the start
//    isn't known: every whole month before today the balance was one
//    amortisation higher; every month after, one lower. Capped at
//    `loanAmount` and floored at 0. Falls back to `loanAmount` when no balance
//    is recorded.
//
// Amortisation is a fixed sum or a fixed percent of the *initial* loan —
// constant per month — so either reconstruction is exact, not an
// approximation of a real amortising schedule's shrinking-interest curve.
// Interest-only loans (no amortisation) keep a flat balance across time, which
// is the point. Returns `undefined` when neither balance nor loan amount is
// known.
export function balanceAt(
  mortgage: Mortgage,
  date: string,
  startDate?: string,
  percentBasis?: number,
): number | undefined {
  const monthlyAmort = resolveMonthlyAmortization(mortgage, percentBasis) ?? 0;

  // Forward reconstruction from the original loan amount at the loan's start.
  if (startDate !== undefined && mortgage.loanAmount !== undefined) {
    // Whole months from the start to `date`; clamped so a pre-start date owes
    // the whole loan rather than more than it.
    const monthsSinceStart = Math.max(
      0,
      isoToMonthNum(date) - isoToMonthNum(startDate),
    );
    const amortised = monthlyAmort * monthsSinceStart;
    return Math.max(0, mortgage.loanAmount - amortised);
  }

  // Backward reconstruction from today's recorded balance.
  const base = mortgage.currentBalance ?? mortgage.loanAmount;
  if (base === undefined) return undefined;
  // Whole months from `date` to today: positive when `date` is in the past,
  // so the balance back then was higher by that many amortisations.
  const monthsBeforeToday = isoToMonthNum(todayIso()) - isoToMonthNum(date);
  let balance = base + monthlyAmort * monthsBeforeToday;
  if (mortgage.loanAmount !== undefined && balance > mortgage.loanAmount) {
    balance = mortgage.loanAmount;
  }
  return Math.max(0, balance);
}

// Monthly interest at the rate in effect on `date`, on the balance
// reconstructed for that month. Pass `startDate` (the loan's effective start)
// to anchor the balance forward from the original loan amount rather than
// backward from today's `currentBalance` — see `balanceAt`. `percentBasis` is
// the property's total initial loan a percent amortisation is taken against
// (see `propertyInitialLoanTotal`) — it feeds the balance reconstruction so an
// amortising loan's interest falls at the right pace. Mirrors
// `resolveMonthlyAmortization`'s "null when not enough info" contract.
export function resolveMonthlyInterestAt(
  mortgage: Mortgage,
  date: string,
  startDate?: string,
  percentBasis?: number,
): number | null {
  const rate = resolveRateAt(mortgage, date);
  if (rate === null) return null;
  const balance = balanceAt(mortgage, date, startDate, percentBasis);
  if (balance === undefined) return null;
  return ((rate / 100) * balance) / 12;
}

// Monthly interest at today's (current) rate — the headline figure the
// card and the finder's expected-amount ranking read. `percentBasis` is the
// property's total initial loan a percent amortisation is taken against (see
// `propertyInitialLoanTotal`).
export function resolveMonthlyInterest(
  mortgage: Mortgage,
  percentBasis?: number,
): number | null {
  return resolveMonthlyInterestAt(
    mortgage,
    todayIso(),
    undefined,
    percentBasis,
  );
}
