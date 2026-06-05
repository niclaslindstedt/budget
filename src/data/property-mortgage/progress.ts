// How far a mortgage has been paid off — the share of the original loan
// that has been amortised away. Paid-off principal is `loanAmount −
// currentBalance`, so the fraction is that over `loanAmount`, clamped to
// [0, 1]: 0 when nothing has been paid down (balance still equals the
// loan), 1 when the balance reaches zero (the loan is fully paid).
//
// Returns `null` when the figure can't be computed — either term
// missing, or a non-positive loan amount (there's nothing to take a
// percentage of). The interest paid over the years is deliberately not
// counted: paying interest doesn't pay *off* the mortgage, only
// amortising the principal does.

import type { Mortgage } from "../types";

export function mortgagePayoffProgress(mortgage: Mortgage): number | null {
  const { loanAmount, currentBalance } = mortgage;
  if (loanAmount === undefined || currentBalance === undefined) return null;
  if (loanAmount <= 0) return null;
  const paidOff = loanAmount - currentBalance;
  const fraction = paidOff / loanAmount;
  return Math.min(1, Math.max(0, fraction));
}
