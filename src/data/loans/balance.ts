// Pure balance math for the Loans sheet. A simple loan's remaining balance
// is simulated from its terms; a linked mortgage loan resolves everything
// live from the linked `Mortgage` so the Properties sheet stays the single
// source of truth.

import type { Loan, Mortgage, Property } from "../types";
import { isoToMonthNum } from "../../utils/date";
import { balanceAt, resolveRateAt } from "../property-mortgage/interest";
import { resolveMonthlyPaymentAt } from "../property-mortgage/payment";

// Total recorded against the loan so far — the "paid so far" column.
export function loanPaidSoFar(loan: Loan): number {
  let sum = 0;
  for (const payment of loan.payments) sum += payment.amount;
  return sum;
}

// The linked mortgages behind a `kind: "mortgage"` loan, or null when the
// loan is unlinked / no linked id resolves (the validator sweeps dangling
// ids, so a miss here only happens mid-session after a delete). A loan can
// link several of one property's mortgages — the bank draws their combined
// monthly cost as a single transaction, so the Loans sheet lists them as
// one row.
export function resolveLinkedMortgages(
  loan: Loan,
  properties: readonly Property[],
): { property: Property; mortgages: Mortgage[] } | null {
  if (
    loan.propertyId === undefined ||
    loan.mortgageIds === undefined ||
    loan.mortgageIds.length === 0
  ) {
    return null;
  }
  const property = properties.find((p) => p.id === loan.propertyId);
  if (!property) return null;
  const linked = new Set(loan.mortgageIds);
  const mortgages = property.mortgages.filter((m) => linked.has(m.id));
  if (mortgages.length === 0) return null;
  return { property, mortgages };
}

// Remaining balance of a simple (unlinked) loan as of `todayIso`.
//
// With a rate, the balance is simulated month by month from `startDate`:
// the setup fee is treated as financed into the principal, each month
// accrues interest on the outstanding balance (annual rate / 12), and the
// monthly payment net of that interest amortises the principal. Clamped at
// 0; a non-amortising loan (payment <= interest) is naturally capped by the
// elapsed-month iteration count, so the loop can't run unbounded.
//
// Without a rate, the whole payment is treated as amortisation:
// startSum + startFee − payments recorded so far.
//
// Returns null when the inputs needed for either path are missing — the
// row renders "—" rather than a guessed figure.
export function loanRemainingBalance(
  loan: Loan,
  todayIso: string,
): number | null {
  if (loan.startSum === undefined) return null;
  const principal = loan.startSum + (loan.startFee ?? 0);
  if (
    loan.rate !== undefined &&
    loan.monthlyPayment !== undefined &&
    loan.startDate !== undefined
  ) {
    const months = isoToMonthNum(todayIso) - isoToMonthNum(loan.startDate);
    if (months <= 0) return principal;
    const monthlyRate = loan.rate / 100 / 12;
    let balance = principal;
    for (let i = 0; i < months; i++) {
      const interest = balance * monthlyRate;
      balance -= loan.monthlyPayment - interest;
      if (balance <= 0) return 0;
    }
    return balance;
  }
  return Math.max(0, principal - loanPaidSoFar(loan));
}

// Display figures for a linked mortgage loan, aggregated live across the
// linked mortgages' own terms. Mirrors what the Properties sheet shows so
// the two pages can never disagree: monthly payment and remaining balance
// sum across the loans, paid-so-far sums every recorded payment (a
// combined charge's per-mortgage splits add back up to the bank figure),
// and the rate is the balance-weighted blend of the mortgages that
// resolve both a rate and a balance — so an unknown rate doesn't drag the
// blend toward zero.
export function linkedMortgageFigures(
  mortgages: readonly Mortgage[],
  todayIso: string,
): {
  monthlyPayment: number | null;
  rate: number | null;
  paidSoFar: number;
  remaining: number | null;
} {
  let monthly = 0;
  let paid = 0;
  let remaining: number | null = null;
  let ratedInterest = 0;
  let ratedBalance = 0;
  for (const mortgage of mortgages) {
    monthly += resolveMonthlyPaymentAt(mortgage, todayIso);
    for (const payment of mortgage.payments) paid += payment.amount;
    const balance = balanceAt(mortgage, todayIso);
    if (balance !== undefined) {
      remaining = (remaining ?? 0) + balance;
      const rate = resolveRateAt(mortgage, todayIso);
      if (rate !== null) {
        ratedInterest += balance * rate;
        ratedBalance += balance;
      }
    }
  }
  return {
    monthlyPayment: monthly > 0 ? monthly : null,
    rate: ratedBalance > 0 ? ratedInterest / ratedBalance : null,
    paidSoFar: paid,
    remaining,
  };
}
