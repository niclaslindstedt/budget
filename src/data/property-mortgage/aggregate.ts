// Aggregate a property's mortgages into one summed picture — the figures the
// unified mortgage view shows when several loans are collapsed into a single
// card. Each leg reuses the per-mortgage resolvers so the summed view and the
// split view never disagree about an individual loan's contribution.
//
// The "null / undefined when not enough info" convention from the per-mortgage
// resolvers (`finance/interest.ts`, `finance/amortization.ts`, the sibling
// `progress.ts`) carries through: a total is `undefined` when no mortgage
// supplied that figure, and the effective rate / progress are `null` when no
// mortgage carries the terms they need. A caller renders only the legs that
// resolved.

import type { Mortgage } from "../types";

import { resolveMonthlyAmortization } from "../finance/amortization";
import {
  balanceAt,
  resolveMonthlyInterest,
  resolveRateAt,
} from "../finance/interest";
import { splitRecordedPayment } from "../finance/payment";
import { todayIso } from "../../utils/date";

export type MortgageAggregate = {
  // How many mortgages were folded in.
  count: number;
  // Σ currentBalance / Σ loanAmount over the mortgages that record each —
  // `undefined` when none do, so the caller can hide the stat.
  totalBalance: number | undefined;
  totalLoan: number | undefined;
  // Balance-weighted annual interest rate (percent): the single rate that,
  // applied to the combined balance, accrues the combined monthly interest.
  // Computed only over mortgages that resolve BOTH a rate and a balance;
  // `null` when none do.
  effectiveRate: number | null;
  // Σ of each mortgage's monthly interest / amortisation, skipping the
  // mortgages that can't resolve one; `null` when none resolve.
  monthlyInterest: number | null;
  monthlyAmortization: number | null;
  // Aggregate payoff share — Σ amortised principal over Σ original loan, across
  // the mortgages that record both `loanAmount` and `currentBalance`. Clamped
  // to [0, 1]; `null` when no mortgage carries both terms (or the combined
  // loan is non-positive).
  progress: number | null;
  // Combined recorded payments, split into amortisation and interest the same
  // way `MortgageRow` splits a single loan's payments.
  paid: { total: number; interest: number; amortization: number };
  paymentCount: number;
};

export function aggregateMortgages(mortgages: Mortgage[]): MortgageAggregate {
  let totalBalance: number | undefined;
  let totalLoan: number | undefined;
  let monthlyInterest: number | null = null;
  let monthlyAmortization: number | null = null;
  // Effective-rate accumulators: the combined monthly interest and balance of
  // only the mortgages that resolve both a rate and a balance, so a loan with
  // an unknown rate doesn't drag the blended rate toward zero.
  let ratedInterest = 0;
  let ratedBalance = 0;
  let hasRated = false;
  // Aggregate-payoff accumulators: only mortgages carrying both terms.
  let progressLoan = 0;
  let progressBalance = 0;
  let hasProgress = false;

  const paid = { total: 0, interest: 0, amortization: 0 };
  let paymentCount = 0;
  const today = todayIso();

  for (const mortgage of mortgages) {
    if (mortgage.currentBalance !== undefined) {
      totalBalance = (totalBalance ?? 0) + mortgage.currentBalance;
    }
    if (mortgage.loanAmount !== undefined) {
      totalLoan = (totalLoan ?? 0) + mortgage.loanAmount;
    }

    const interest = resolveMonthlyInterest(mortgage);
    if (interest !== null) monthlyInterest = (monthlyInterest ?? 0) + interest;
    const amort = resolveMonthlyAmortization(mortgage);
    if (amort !== null)
      monthlyAmortization = (monthlyAmortization ?? 0) + amort;

    // Blended rate: weight each loan's rate by the balance it accrues on, via
    // the interest it actually charges (interest = balance × rate ÷ 1200), so
    // the division below recovers the balance-weighted rate.
    const rate = resolveRateAt(mortgage, today);
    const balance = balanceAt(mortgage, today);
    if (rate !== null && balance !== undefined) {
      ratedInterest += (rate / 100) * balance;
      ratedBalance += balance;
      hasRated = true;
    }

    if (
      mortgage.loanAmount !== undefined &&
      mortgage.currentBalance !== undefined
    ) {
      progressLoan += mortgage.loanAmount;
      progressBalance += mortgage.currentBalance;
      hasProgress = true;
    }

    for (const payment of mortgage.payments) {
      const split = splitRecordedPayment(mortgage, payment);
      paid.amortization += split.amortization;
      paid.interest += split.interest;
      paid.total += payment.amount;
      paymentCount++;
    }
  }

  const effectiveRate =
    hasRated && ratedBalance > 0 ? (ratedInterest / ratedBalance) * 100 : null;

  let progress: number | null = null;
  if (hasProgress && progressLoan > 0) {
    const fraction = (progressLoan - progressBalance) / progressLoan;
    progress = Math.min(1, Math.max(0, fraction));
  }

  return {
    count: mortgages.length,
    totalBalance,
    totalLoan,
    effectiveRate,
    monthlyInterest,
    monthlyAmortization,
    progress,
    paid,
    paymentCount,
  };
}
