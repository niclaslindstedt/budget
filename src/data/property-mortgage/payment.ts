// A property's monthly mortgage cost is paid to the bank as a single
// transaction, but it covers every loan against the property. These
// helpers compute each mortgage's expected monthly payment (amortisation +
// interest at the rate in effect that month) and split a real combined
// bank charge across the mortgages by those expected shares — so the
// per-mortgage payment records add up to exactly what was paid while still
// being derived, never hand-allocated.

import type { Mortgage } from "../types";
import { resolveMonthlyAmortization } from "./amortization";
import { resolveMonthlyInterestAt } from "./interest";

// A mortgage's expected monthly payment on `date` — amortisation plus
// interest at the rate in effect that month. Unknown legs count as 0, so a
// mortgage with no terms recorded contributes nothing (and is left out of
// the split). Never negative.
export function resolveMonthlyPaymentAt(
  mortgage: Mortgage,
  date: string,
): number {
  const amort = resolveMonthlyAmortization(mortgage) ?? 0;
  const interest = resolveMonthlyInterestAt(mortgage, date) ?? 0;
  return Math.max(0, amort + interest);
}

// Split a combined charge of `amount` (paid on `date`) across `mortgages`
// in proportion to each one's expected monthly payment on that date.
// Returns a map of mortgage id → amount, omitting any mortgage that gets
// nothing. The parts sum to exactly `amount` (the largest share absorbs
// rounding). When no mortgage has terms to weight by, the charge is split
// evenly. An empty mortgage list yields an empty map.
export function splitPaymentAcrossMortgages(
  mortgages: readonly Mortgage[],
  amount: number,
  date: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (mortgages.length === 0) return result;

  let weights = mortgages.map((m) => resolveMonthlyPaymentAt(m, date));
  let total = weights.reduce((s, w) => s + w, 0);
  // No terms anywhere ⇒ weight every mortgage equally.
  if (total <= 0) {
    weights = mortgages.map(() => 1);
    total = mortgages.length;
  }

  // Work in integer cents so the parts sum back to `amount` exactly. The
  // mortgage with the largest weight absorbs the rounding remainder.
  const totalCents = Math.round(amount * 100);
  let largestIdx = 0;
  for (let i = 1; i < weights.length; i += 1) {
    if (weights[i] > weights[largestIdx]) largestIdx = i;
  }

  let assigned = 0;
  const cents = weights.map((w, i) => {
    if (i === largestIdx) return 0; // filled in after the rest
    const c = Math.round((totalCents * w) / total);
    assigned += c;
    return c;
  });
  cents[largestIdx] = totalCents - assigned;

  mortgages.forEach((m, i) => {
    if (cents[i] !== 0) result.set(m.id, cents[i] / 100);
  });
  return result;
}
