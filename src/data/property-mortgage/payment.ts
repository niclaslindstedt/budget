// A property's monthly mortgage cost is paid to the bank as a single
// transaction, but it covers every loan against the property. These
// helpers compute each mortgage's amortisation and its interest at the rate
// in effect that month, then split a real combined bank charge so that
// amortisation is settled first (per-loan, exactly) and only the leftover
// interest is shared out by interest weight — so the per-mortgage payment
// records add up to exactly what was paid while still being derived, never
// hand-allocated.

import type { Mortgage } from "../types";
import { resolveMonthlyAmortization } from "./amortization";
import { resolveMonthlyInterestAt } from "./interest";

// A mortgage's expected monthly payment on `date` — amortisation plus
// interest at the rate in effect that month. Unknown legs count as 0, so a
// mortgage with no terms recorded contributes nothing (and is left out of
// the split). Never negative.
export function resolveMonthlyPaymentAt(
  mortgage: Mortgage,
  date: string,
): number {
  const amort = resolveMonthlyAmortization(mortgage) ?? 0;
  const interest = resolveMonthlyInterestAt(mortgage, date) ?? 0;
  return Math.max(0, amort + interest);
}

// Split a combined charge of `amount` (paid on `date`) across `mortgages`.
// Amortisation is the deterministic leg (a fixed sum, or a fixed percent of
// the initial loan), so it's settled first: each mortgage is assigned its
// own amortisation in full, and only the leftover (`amount` minus the total
// amortisation) — which is interest — is shared out by interest weight. A
// mortgage with no amortisation therefore receives none of the principal
// and only its share of the interest, while the amortising loans stay
// pinned to their amortisation and the interest-bearing loans absorb the
// whole variance between the charge and the expected total. Fallbacks: when
// the charge doesn't even cover the amortisation there's no interest left
// to share, so the whole charge is split by amortisation weight (never a
// negative interest); when no mortgage charges interest the leftover is
// spread by amortisation weight instead; when no mortgage has any terms the
// charge is split evenly.
//
// Returns a map of mortgage id → amount, omitting any mortgage that gets
// nothing. The parts sum to exactly `amount` (the largest share absorbs
// rounding). An empty mortgage list yields an empty map.
export function splitPaymentAcrossMortgages(
  mortgages: readonly Mortgage[],
  amount: number,
  date: string,
): Map<string, number> {
  const result = new Map<string, number>();
  if (mortgages.length === 0) return result;

  const interests = mortgages.map((m) =>
    Math.max(0, resolveMonthlyInterestAt(m, date) ?? 0),
  );
  const amorts = mortgages.map((m) =>
    Math.max(0, resolveMonthlyAmortization(m) ?? 0),
  );
  const totalInterest = interests.reduce((s, v) => s + v, 0);
  const totalAmort = amorts.reduce((s, v) => s + v, 0);

  // Each mortgage's target share of the charge, as a float (reconciled to
  // exact cents below).
  let shares: number[];
  if (totalInterest <= 0 && totalAmort <= 0) {
    // No terms anywhere ⇒ split evenly.
    shares = mortgages.map(() => amount / mortgages.length);
  } else if (amount <= totalAmort) {
    // The charge doesn't cover the amortisation — there's no interest left
    // to share. Split it by amortisation weight (totalAmort > 0 here, since
    // amount > 0 and the all-zero case is handled above).
    shares = amorts.map((a) => (amount * a) / totalAmort);
  } else {
    // Settle amortisation per-loan in full, then share the leftover interest.
    const remainder = amount - totalAmort;
    shares = mortgages.map((_, i) =>
      totalInterest > 0
        ? amorts[i] + (remainder * interests[i]) / totalInterest
        : // No interest charged anywhere ⇒ spread the leftover by
          // amortisation weight (totalAmort > 0 since amount > totalAmort).
          amorts[i] + (remainder * amorts[i]) / totalAmort,
    );
  }

  // Work in integer cents so the parts sum back to `amount` exactly. The
  // mortgage with the largest share absorbs the rounding remainder.
  const totalCents = Math.round(amount * 100);
  let largestIdx = 0;
  for (let i = 1; i < shares.length; i += 1) {
    if (shares[i] > shares[largestIdx]) largestIdx = i;
  }

  let assigned = 0;
  const cents = shares.map((s, i) => {
    if (i === largestIdx) return 0; // filled in after the rest
    const c = Math.round(s * 100);
    assigned += c;
    return c;
  });
  cents[largestIdx] = totalCents - assigned;

  mortgages.forEach((m, i) => {
    if (cents[i] !== 0) result.set(m.id, cents[i] / 100);
  });
  return result;
}
