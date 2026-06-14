// Resolve a mortgage's monthly amortisation (the principal paid down each
// month) to a concrete amount in the user's currency. The user records
// amortisation in one of two modes (see `MortgageAmortization`):
//
// - `percent` — an annual percentage of the *initial* loan. Needs a loan
//   amount to take the percentage of: monthly = percent/100 × basis ÷ 12.
//   The basis is the property's **total** initial loan, not this one
//   mortgage's: Swedish "amorteringskrav" is set on the property's combined
//   debt, so a property carrying a large interest-only first loan plus a
//   small amortising top-up amortises 2% of the *combined* original loan,
//   charged against the top-up. Pass the property total as `percentBasis`;
//   it defaults to the mortgage's own `loanAmount` so a single-mortgage
//   property (where the two are equal) needs no caller change. Returns
//   `null` when the basis is unknown, since there is nothing to take the
//   percentage of.
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

// The basis a `percent`-mode amortisation plan is taken against: the sum of
// every mortgage's *initial* loan amount on the property. Swedish
// "amorteringskrav" is set on the property's combined debt, not one loan in
// isolation — so the percent any single loan amortises is a percent of this
// total. Returns `undefined` when no mortgage records a loan amount (nothing
// to take a percentage of). Pass the result as the `percentBasis` argument to
// the resolvers below.
export function propertyInitialLoanTotal(
  mortgages: readonly Mortgage[],
): number | undefined {
  let total = 0;
  let any = false;
  for (const m of mortgages) {
    if (m.loanAmount !== undefined) {
      total += m.loanAmount;
      any = true;
    }
  }
  return any ? total : undefined;
}

// Convert an amortisation plan to a monthly figure against a percent basis.
// `null` when a percent plan has no basis to take the percentage of.
function planToMonthly(
  plan: MortgageAmortization,
  basis: number | undefined,
): number | null {
  if (plan.mode === "fixed") return plan.amount;
  // percent mode: needs the (property-total) initial loan to take a percent of.
  if (basis === undefined) return null;
  return ((plan.percent / 100) * basis) / 12;
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
// resolver's "null when not enough info" contract. `percentBasis` is the
// property's total initial loan a percent plan is taken against (see
// `propertyInitialLoanTotal`); it defaults to the mortgage's own `loanAmount`.
export function resolveMonthlyAmortizationAt(
  mortgage: Mortgage,
  date: string,
  percentBasis?: number,
): number | null {
  const plan = resolveAmortizationPlanAt(mortgage, date);
  if (!plan) return null;
  return planToMonthly(plan, percentBasis ?? mortgage.loanAmount);
}

// The monthly amortisation under the loan's *current* plan — the headline
// figure the card and current resolvers read. `percentBasis` is the property's
// total initial loan a percent plan is taken against (see
// `propertyInitialLoanTotal`); it defaults to the mortgage's own `loanAmount`.
export function resolveMonthlyAmortization(
  mortgage: Mortgage,
  percentBasis?: number,
): number | null {
  if (!mortgage.amortization) return null;
  return planToMonthly(
    mortgage.amortization,
    percentBasis ?? mortgage.loanAmount,
  );
}
