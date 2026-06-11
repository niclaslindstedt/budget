// Builds the per-loan bands behind the loans "Visualize loans" stacked-area
// chart. Pure and presentation-free (the data layer must not reach into
// components): each band is `{ x, y }` points and the modal maps them to a
// colour + label. Mirrors `buildSavingsTotalSeries` in spirit, but where the
// savings chart samples the union of snapshot dates, a stacked chart needs
// every band to share one x array — so both builders sample monthly, from the
// earliest date any included loan knows about up to today, and every band
// emits a point at every sample (0 before the loan starts).
//
// Two views:
// - `buildLoanBalanceBands` — each loan's outstanding debt over time; the top
//   of the stack is the total owed. Simple loans walk
//   `loanRemainingBalance`; linked mortgage loans sum `balanceAt` across
//   their linked mortgages, so the chart can never disagree with the
//   Properties sheet.
// - `buildLoanPaymentBands` — each loan's recorded payments per month
//   (months without a payment are honest zeros — the modal draws bars, not
//   an area, so a skipped month reads as a gap), with an optional combined
//   estimated-interest share broken out of each month's amounts.

import type { Loan, Mortgage, Property } from "../types";
import { isoToMonthNum, monthNumToIsoEnd } from "../../utils/date";
import { loanRemainingBalance, resolveLinkedMortgages } from "./balance";
import { balanceAt, resolveMonthlyInterestAt } from "../finance/interest";

export type SeriesPoint = { x: number; y: number };

export type LoanSeriesOptions = {
  // false ⇒ loans of kind "student" are left out of the stack.
  includeStudent: boolean;
  // false ⇒ loans of kind "mortgage" (linked or not) are left out.
  includeMortgages: boolean;
};

export type LoanBandSeries = {
  loanId: string;
  points: SeriesPoint[];
};

// One included loan with its linked mortgages resolved (null for a simple
// loan), so the per-sample walks don't re-resolve per month.
type IncludedLoan = {
  loan: Loan;
  mortgages: Mortgage[] | null;
};

function includedLoans(
  loans: readonly Loan[],
  properties: readonly Property[],
  options: LoanSeriesOptions,
): IncludedLoan[] {
  const result: IncludedLoan[] = [];
  for (const loan of loans) {
    if (loan.kind === "student" && !options.includeStudent) continue;
    if (loan.kind === "mortgage" && !options.includeMortgages) continue;
    const linked = resolveLinkedMortgages(loan, properties);
    result.push({ loan, mortgages: linked ? linked.mortgages : null });
  }
  return result;
}

// The dated payments behind a loan: its own for a simple loan, the linked
// mortgages' for a linked one (the per-leg splits of one combined charge sum
// back to the bank figure, so a raw concat is the right cumulative total).
function loanPayments(
  entry: IncludedLoan,
): readonly { date: string; amount: number }[] {
  if (entry.mortgages === null) return entry.loan.payments;
  const payments: { date: string; amount: number }[] = [];
  for (const mortgage of entry.mortgages) payments.push(...mortgage.payments);
  return payments;
}

// The monthly sample dates shared by every band: from the earliest relevant
// date any included loan knows about through today. Each month samples at
// its last day, except the current month which samples at today so the
// stack's top matches the page's footer total. The balances view anchors on
// every known date (start date, snapshots, payments); the payments view
// anchors on payment dates alone — a loan term recorded years before the
// first payment would otherwise prepend years of flat zero to a cumulative-
// payments chart. Empty when no included loan carries a relevant date.
function sampleDates(
  entries: readonly IncludedLoan[],
  today: string,
  anchor: "all" | "payments",
) {
  let earliest: string | undefined;
  const consider = (date: string) => {
    if (date > today) return;
    if (earliest === undefined || date < earliest) earliest = date;
  };
  for (const entry of entries) {
    if (anchor === "all") {
      if (entry.loan.startDate !== undefined) consider(entry.loan.startDate);
      for (const point of entry.loan.balanceHistory) consider(point.date);
    }
    for (const payment of loanPayments(entry)) consider(payment.date);
  }
  if (earliest === undefined) return [];
  const startMonth = isoToMonthNum(earliest);
  const endMonth = isoToMonthNum(today);
  const dates: { iso: string; ms: number }[] = [];
  for (let month = startMonth; month <= endMonth; month++) {
    const monthEnd = monthNumToIsoEnd(month);
    const iso = monthEnd < today ? monthEnd : today;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) dates.push({ iso, ms });
  }
  return dates;
}

// Each included loan's outstanding balance at every sample date. A loan that
// resolves no balance at any sample (no snapshot, no start sum; linked with
// no balance or loan amount recorded) is dropped — a paid-off loan with real
// zeros stays.
export function buildLoanBalanceBands(
  loans: readonly Loan[],
  properties: readonly Property[],
  todayIso: string,
  options: LoanSeriesOptions,
): LoanBandSeries[] {
  const entries = includedLoans(loans, properties, options);
  const dates = sampleDates(entries, todayIso, "all");
  if (dates.length === 0) return [];

  const bands: LoanBandSeries[] = [];
  for (const entry of entries) {
    let known = false;
    const points = dates.map(({ iso, ms }) => {
      let value: number | null = null;
      if (entry.mortgages === null) {
        value = loanRemainingBalance(entry.loan, iso);
      } else {
        for (const mortgage of entry.mortgages) {
          const balance = balanceAt(mortgage, iso);
          if (balance !== undefined) value = (value ?? 0) + balance;
        }
      }
      if (value !== null) known = true;
      return { x: ms, y: Math.max(0, value ?? 0) };
    });
    if (known) bands.push({ loanId: entry.loan.id, points });
  }
  return bands;
}

export type LoanPaymentBands = {
  // Per loan, its cumulative payments — net of the counted interest when
  // `breakOutInterest` is on.
  loans: LoanBandSeries[];
  // The combined accumulated estimated interest across every charted loan;
  // null when `breakOutInterest` is off.
  interest: SeriesPoint[] | null;
};

// Each included loan's cumulative payments at every sample date, with the
// estimated-interest share optionally broken out into one combined band.
//
// Interest is an estimate: per month, a simple loan with a rate accrues
// last month's outstanding balance × rate/12 (no rate ⇒ no estimate), and a
// linked loan sums `resolveMonthlyInterestAt` over its mortgages
// (rate-history aware). The counted interest is clamped per month to what
// was actually paid that month — `i = min(est, paid)` — so the net segment
// stays >= 0 by construction, a skipped month carries no phantom interest,
// and accrued-but-unpaid interest (or a pre-start month's backdated balance)
// never inflates the chart.
//
// A loan with no payment on or before today is dropped from this view.
export function buildLoanPaymentBands(
  loans: readonly Loan[],
  properties: readonly Property[],
  todayIso: string,
  options: LoanSeriesOptions & { breakOutInterest: boolean },
): LoanPaymentBands {
  const entries = includedLoans(loans, properties, options);
  const dates = sampleDates(entries, todayIso, "payments");
  if (dates.length === 0) return { loans: [], interest: null };

  const bands: LoanBandSeries[] = [];
  const totalInterest = dates.map(({ ms }) => ({ x: ms, y: 0 }));
  for (const entry of entries) {
    const payments = [...loanPayments(entry)].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    let hasPayments = false;
    let next = 0;
    const points = dates.map(({ iso, ms }, i) => {
      let paid = 0;
      while (next < payments.length && payments[next].date <= iso) {
        paid += payments[next].amount;
        next += 1;
      }
      if (paid > 0) hasPayments = true;
      if (!options.breakOutInterest) return { x: ms, y: paid };
      let estimate = 0;
      if (entry.mortgages === null) {
        if (entry.loan.rate !== undefined) {
          const month = isoToMonthNum(iso);
          const balance =
            loanRemainingBalance(entry.loan, monthNumToIsoEnd(month - 1)) ?? 0;
          estimate = Math.max(0, balance) * (entry.loan.rate / 100 / 12);
        }
      } else {
        for (const mortgage of entry.mortgages) {
          estimate += resolveMonthlyInterestAt(mortgage, iso) ?? 0;
        }
      }
      const interest = Math.min(estimate, paid);
      totalInterest[i].y += interest;
      return { x: ms, y: paid - interest };
    });
    if (hasPayments) bands.push({ loanId: entry.loan.id, points });
  }
  return {
    loans: bands,
    interest: options.breakOutInterest ? totalInterest : null,
  };
}
