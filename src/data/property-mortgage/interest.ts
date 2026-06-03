// Resolve a mortgage's interest — the interest charged in a given month —
// to a concrete amount in the user's currency. Interest accrues on the
// outstanding debt at the annual rate in effect that month:
//
//   monthly = balance × rate/100 ÷ 12
//
// where `balance` is the `currentBalance` (what's left to pay) when known,
// falling back to the original `loanAmount` otherwise, and `rate` is
// resolved from the mortgage's effective-dated `rateHistory` (or the
// headline `interestRate` when no history is recorded). Returns `null`
// when neither a balance nor a rate is known — there's nothing to charge
// interest on.

import type { Mortgage } from "../types";
import { todayIso } from "../../utils/date";

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

// Monthly interest at the rate in effect on `date`. Mirrors
// `resolveMonthlyAmortization`'s "null when not enough info" contract.
export function resolveMonthlyInterestAt(
  mortgage: Mortgage,
  date: string,
): number | null {
  const rate = resolveRateAt(mortgage, date);
  if (rate === null) return null;
  const balance = mortgage.currentBalance ?? mortgage.loanAmount;
  if (balance === undefined) return null;
  return ((rate / 100) * balance) / 12;
}

// Monthly interest at today's (current) rate — the headline figure the
// card and the finder's expected-amount ranking read.
export function resolveMonthlyInterest(mortgage: Mortgage): number | null {
  return resolveMonthlyInterestAt(mortgage, todayIso());
}
