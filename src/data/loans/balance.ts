// Pure balance math for the Loans sheet. A simple loan's remaining balance
// derives from its recorded balance snapshots plus the payments between; a
// linked mortgage loan resolves everything live from the linked `Mortgage`
// so the Properties sheet stays the single source of truth.

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

// Remaining balance of a simple (unlinked) loan as of `dateIso`.
//
// The balance anchors on the loan's recorded balance snapshots ("Update
// balance" on the row's "…" menu): the latest snapshot on or before the
// date, treated as the end-of-day figure, and the payments recorded
// between the snapshot and the date amortise from there. Without a rate
// the whole payment amortises. With a rate the walk runs month by month
// (matching the snapshot's monthly granularity): each month accrues
// interest on the outstanding balance (annual rate / 12) before that
// month's payments land, so only the payment net of interest amortises —
// a loan with a rate and no recorded payments honestly grows. Clamped at
// 0 once paid off.
//
// A date before the earliest snapshot adds the payments in between back
// on (interest is not un-accrued — backdated figures are approximate).
//
// Returns null when no balance has been recorded — the row renders "—"
// rather than a guessed figure.
export function loanRemainingBalance(
  loan: Loan,
  dateIso: string,
): number | null {
  if (loan.balanceHistory.length === 0) return null;
  const points = [...loan.balanceHistory].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  let anchor = points[0];
  for (const point of points) {
    if (point.date > dateIso) break;
    anchor = point;
  }
  if (anchor.date > dateIso) {
    // Every snapshot is in the future: walk backward from the earliest by
    // re-adding the payments between the date and the snapshot.
    let balance = anchor.value;
    for (const payment of loan.payments) {
      if (payment.date > dateIso && payment.date <= anchor.date) {
        balance += payment.amount;
      }
    }
    return balance;
  }
  const payments = loan.payments
    .filter((p) => p.date > anchor.date && p.date <= dateIso)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (loan.rate === undefined) {
    let balance = anchor.value;
    for (const payment of payments) balance -= payment.amount;
    return Math.max(0, balance);
  }
  const monthlyRate = loan.rate / 100 / 12;
  const anchorMonth = isoToMonthNum(anchor.date);
  const endMonth = isoToMonthNum(dateIso);
  let balance = anchor.value;
  let next = 0;
  for (let month = anchorMonth; month <= endMonth; month++) {
    if (month > anchorMonth) balance += balance * monthlyRate;
    while (
      next < payments.length &&
      isoToMonthNum(payments[next].date) === month
    ) {
      balance -= payments[next].amount;
      next += 1;
    }
    if (balance <= 0) return 0;
  }
  return balance;
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
