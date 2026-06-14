// Resolve a mortgage's monthly amortisation (the principal paid down each
// month) to a concrete amount in the user's currency. The user records
// amortisation in one of two modes (see `MortgageAmortization`):
//
// - `percent` — an annual percentage of the *initial* loan: monthly =
//   percent/100 × base ÷ 12. The base is the mortgage's `loanAmount` so the
//   figure stays constant as the loan pays down (the Swedish
//   amorteringskrav is a percent of the original loan, not the shrinking
//   balance). When the original loan amount was never recorded — a loan
//   tracked only by its outstanding figure — it falls back to
//   `currentBalance` so the percentage still resolves to a monthly amount
//   instead of silently reading as zero. Returns `null` only when neither
//   base is known, since there is then nothing to take the percentage of.
// - `fixed` — a flat monthly sum, returned as-is.
//
// Returns `null` when no amortisation is set, or when a `percent` mode
// can't resolve for lack of any base amount — the caller decides how to
// present "not enough info to compute a monthly figure".

import type { Mortgage } from "../types";

export function resolveMonthlyAmortization(mortgage: Mortgage): number | null {
  const a = mortgage.amortization;
  if (!a) return null;
  if (a.mode === "fixed") return a.amount;
  // percent mode: take the percentage of the original loan, falling back to
  // the current balance when the loan amount was never recorded.
  const base = mortgage.loanAmount ?? mortgage.currentBalance;
  if (base === undefined) return null;
  return ((a.percent / 100) * base) / 12;
}
