// Pure balance math for the Loans sheet. A simple loan's remaining balance
// derives from its balance anchors (recorded snapshots and/or the start
// sum) plus the payments between; a linked mortgage loan resolves
// everything live from the linked `Mortgage` so the Properties sheet
// stays the single source of truth.

import type { Loan, Mortgage, Property } from "../types";
import { addDaysIso, isoToMonthNum } from "../../utils/date";
import { balanceAt, resolveRateAt } from "../finance/interest";
import { resolveMonthlyPaymentAt } from "../finance/payment";

// Total recorded against the loan so far — the "paid so far" column.
export function loanPaidSoFar(loan: Loan): number {
  let sum = 0;
  for (const payment of loan.payments) sum += payment.amount;
  return sum;
}

// The "Monthly" column — derived from the recorded payments rather than
// entered. Payments are grouped into per-month totals (a charge split
// across several rows in one month sums back to the bank figure) and
// the figure is the average of the current year's months-with-payments
// — so a January rate change doesn't drag last year's level along all
// year. At the start of the year, when fewer than three months have
// landed yet, the average falls back to the three most recent payment
// months regardless of year. Null with no payments recorded.
export function loanMonthlyPayment(
  loan: Loan,
  todayIso: string,
): number | null {
  if (loan.payments.length === 0) return null;
  const totalsByMonth = new Map<number, number>();
  for (const payment of loan.payments) {
    if (payment.date > todayIso) continue;
    const month = isoToMonthNum(payment.date);
    totalsByMonth.set(month, (totalsByMonth.get(month) ?? 0) + payment.amount);
  }
  if (totalsByMonth.size === 0) return null;
  const months = [...totalsByMonth.keys()].sort((a, b) => a - b);
  const yearStartMonth = isoToMonthNum(`${todayIso.slice(0, 4)}-01-01`);
  const currentYear = months.filter((m) => m >= yearStartMonth);
  const window = currentYear.length >= 3 ? currentYear : months.slice(-3);
  let sum = 0;
  for (const month of window) sum += totalsByMonth.get(month) ?? 0;
  return sum / window.length;
}

// The dated anchors the remaining-balance walk can start from: every
// recorded snapshot, plus — when a start sum is recorded — an implicit
// opening point worth startSum + startFee. The opening point sorts
// before everything else: dated at `startDate` when recorded, otherwise
// the day before the earliest payment / snapshot (so every payment
// amortises from it), otherwise `fallbackIso`. Sorted ascending.
function effectiveBalancePoints(
  loan: Loan,
  fallbackIso: string,
): Array<{ date: string; value: number }> {
  const points: Array<{ date: string; value: number }> = [];
  if (loan.startSum !== undefined) {
    let date = loan.startDate;
    if (date === undefined) {
      let earliest: string | undefined;
      for (const payment of loan.payments) {
        if (earliest === undefined || payment.date < earliest)
          earliest = payment.date;
      }
      for (const point of loan.balanceHistory) {
        if (earliest === undefined || point.date < earliest)
          earliest = point.date;
      }
      date = earliest !== undefined ? addDaysIso(earliest, -1) : fallbackIso;
    }
    points.push({ date, value: loan.startSum + (loan.startFee ?? 0) });
  }
  // The opening anchor goes first so a snapshot recorded on the same day
  // wins the (stable) sort and anchors the walk.
  points.push(...loan.balanceHistory);
  return points.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
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
// The balance anchors on the loan's balance points ("Update balance"
// snapshots, plus the implicit `startSum` opening anchor — see
// `effectiveBalancePoints`): the latest point on or before the date,
// treated as the end-of-day figure, and the payments recorded between
// the anchor and the date amortise from there. Without a rate the whole
// payment amortises. With a rate the walk runs month by month: each
// month accrues interest on the outstanding balance (annual rate / 12)
// before that month's payments land, so only the payment net of
// interest amortises — a loan with a rate and no recorded payments
// honestly grows. Clamped at 0 once paid off.
//
// A date before the earliest point adds the payments in between back
// on (interest is not un-accrued — backdated figures are approximate).
//
// Returns null when neither a snapshot nor a start sum is recorded —
// the row renders "—" rather than a guessed figure.
export function loanRemainingBalance(
  loan: Loan,
  dateIso: string,
): number | null {
  const points = effectiveBalancePoints(loan, dateIso);
  if (points.length === 0) return null;
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
// `percentBasis` is the property's total initial loan a percent amortisation is
// taken against (see `propertyInitialLoanTotal`). Resolve it from the linked
// loan's **property** (`resolveLinkedMortgages(...).property.mortgages`), not
// the linked subset passed here — a loan need not link every mortgage on the
// property, but the amortisation requirement is set on the property's combined
// debt all the same.
export function linkedMortgageFigures(
  mortgages: readonly Mortgage[],
  todayIso: string,
  percentBasis?: number,
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
    monthly += resolveMonthlyPaymentAt(mortgage, todayIso, percentBasis);
    for (const payment of mortgage.payments) paid += payment.amount;
    const balance = balanceAt(mortgage, todayIso, undefined, percentBasis);
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

// Per-mortgage figures for the linked-mortgages list in the loan viewer:
// each linked mortgage's own remaining balance, rate, and monthly payment,
// resolved live from the `Mortgage` so the card can spell out the terms
// behind the aggregate above it. Mirrors the per-mortgage math
// `linkedMortgageFigures` sums up.
export function linkedMortgageRowFigures(
  mortgage: Mortgage,
  todayIso: string,
  percentBasis?: number,
): { remaining: number | null; rate: number | null; monthly: number | null } {
  const balance = balanceAt(mortgage, todayIso, undefined, percentBasis);
  const monthly = resolveMonthlyPaymentAt(mortgage, todayIso, percentBasis);
  return {
    remaining: balance ?? null,
    rate: resolveRateAt(mortgage, todayIso),
    monthly: monthly > 0 ? monthly : null,
  };
}
