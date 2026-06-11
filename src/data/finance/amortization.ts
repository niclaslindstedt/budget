// Resolve a mortgage's monthly amortisation (the principal paid down each
// month) to a concrete amount in the user's currency. The user records
// amortisation in one of two modes (see `MortgageAmortization`):
//
// - `percent` — an annual percentage of the *initial* loan. Needs the
//   mortgage's `loanAmount` to resolve: monthly = percent/100 × loanAmount
//   ÷ 12. Returns `null` when `loanAmount` is unknown, since there is
//   nothing to take the percentage of.
// - `fixed` — a flat monthly sum, returned as-is.
//
// Returns `null` when no amortisation is set, or when a `percent` mode
// can't resolve for lack of a loan amount — the caller decides how to
// present "not enough info to compute a monthly figure".

import type { Mortgage } from "../types";

export function resolveMonthlyAmortization(mortgage: Mortgage): number | null {
  const a = mortgage.amortization;
  if (!a) return null;
  if (a.mode === "fixed") return a.amount;
  // percent mode: needs the initial loan to take the percentage of.
  if (mortgage.loanAmount === undefined) return null;
  return ((a.percent / 100) * mortgage.loanAmount) / 12;
}
