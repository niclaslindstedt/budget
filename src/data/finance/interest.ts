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

// The outstanding balance on `date`, reconstructed from the loan's known
// `currentBalance` (today's figure) by walking the deterministic monthly
// amortisation: every whole month before today the balance was one
// amortisation higher; every month after, one lower. Capped at `loanAmount`
// (can't owe more than the original loan) and floored at 0. Amortisation
// here is a fixed sum or a fixed percent of the *initial* loan — constant
// per month — so the reconstruction is exact, not an approximation of a
// real amortising schedule's shrinking-interest curve. Interest-only loans
// (no amortisation) keep a flat balance across time, which is the point.
// Falls back to `loanAmount` when no balance is recorded; returns
// `undefined` when neither balance nor loan amount is known.
export function balanceAt(
  mortgage: Mortgage,
  date: string,
): number | undefined {
  const base = mortgage.currentBalance ?? mortgage.loanAmount;
  if (base === undefined) return undefined;
  const monthlyAmort = resolveMonthlyAmortization(mortgage) ?? 0;
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
// reconstructed for that month. Mirrors `resolveMonthlyAmortization`'s
// "null when not enough info" contract.
export function resolveMonthlyInterestAt(
  mortgage: Mortgage,
  date: string,
): number | null {
  const rate = resolveRateAt(mortgage, date);
  if (rate === null) return null;
  const balance = balanceAt(mortgage, date);
  if (balance === undefined) return null;
  return ((rate / 100) * balance) / 12;
}

// Monthly interest at today's (current) rate — the headline figure the
// card and the finder's expected-amount ranking read.
export function resolveMonthlyInterest(mortgage: Mortgage): number | null {
  return resolveMonthlyInterestAt(mortgage, todayIso());
}
