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
//
// The plan can change over the loan's life (a bank-agreed step like 3% → 2%),
// recorded as effective-dated entries in `amortizationHistory`. The plain
// resolver reads the *current* plan (`Mortgage.amortization`, kept in sync with
// the latest history entry); `resolveMonthlyAmortizationAt` walks the history
// to the plan in effect on a given date.

import type { Mortgage, MortgageAmortization } from "../types";

// Convert an amortisation plan to a monthly figure against a loan's amount.
// `null` when the plan needs a loan amount it doesn't have (percent mode).
function planToMonthly(
  plan: MortgageAmortization,
  loanAmount: number | undefined,
): number | null {
  if (plan.mode === "fixed") return plan.amount;
  // percent mode: needs the initial loan to take the percentage of.
  if (loanAmount === undefined) return null;
  return ((plan.percent / 100) * loanAmount) / 12;
}

// The amortisation plan in effect on `date`, walking the mortgage's
// effective-dated `amortizationHistory`: the most recent change on or before
// the date wins; a date before the earliest recorded change uses that earliest
// plan (the loan's original plan extends backward). Falls back to the current
// `amortization` when no history is recorded, and `undefined` when neither is
// known.
export function resolveAmortizationPlanAt(
  mortgage: Mortgage,
  date: string,
): MortgageAmortization | undefined {
  const history = mortgage.amortizationHistory;
  if (history && history.length > 0) {
    const sorted = [...history].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    let plan = sorted[0].amortization;
    for (const change of sorted) {
      if (change.date <= date) plan = change.amortization;
      else break;
    }
    return plan;
  }
  return mortgage.amortization;
}

// The monthly amortisation under the plan in effect on `date` — so a historical
// payment is split against the plan that was actually charged that month (the
// next charge after a bank-agreed step follows the new plan). Mirrors the plain
// resolver's "null when not enough info" contract.
export function resolveMonthlyAmortizationAt(
  mortgage: Mortgage,
  date: string,
): number | null {
  const plan = resolveAmortizationPlanAt(mortgage, date);
  if (!plan) return null;
  return planToMonthly(plan, mortgage.loanAmount);
}

// The monthly amortisation under the loan's *current* plan — the headline
// figure the card and current resolvers read.
export function resolveMonthlyAmortization(mortgage: Mortgage): number | null {
  if (!mortgage.amortization) return null;
  return planToMonthly(mortgage.amortization, mortgage.loanAmount);
}
