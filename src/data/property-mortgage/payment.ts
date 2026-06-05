// A property's monthly mortgage cost is paid to the bank as a single
// transaction, but it covers every loan against the property. These
// helpers compute each mortgage's amortisation and its interest at the rate
// in effect that month, then split a real combined bank charge so that
// amortisation is settled first (per-loan, exactly) and only the leftover
// interest is shared out by interest weight — so the per-mortgage payment
// records add up to exactly what was paid while still being derived, never
// hand-allocated.

import type { Mortgage, MortgagePayment, Property } from "../types";
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

// How a single recorded payment divides between principal (amortisation)
// and interest — the inverse of `splitPaymentAcrossMortgages`, which always
// settles amortisation first. A recorded share is therefore its mortgage's
// monthly amortisation plus a slice of the interest, so split it back the
// same way: the amortisation is the mortgage's monthly amortisation capped
// at the recorded amount (an under-covered charge records less than the full
// amortisation and never any interest), and the rest is interest. Both legs
// are ≥ 0 and sum to exactly `payment.amount`. Amortisation is date-
// independent, so unlike the interest leg this doesn't need the charge date.
export type PaymentSplit = { amortization: number; interest: number };

export function splitRecordedPayment(
  mortgage: Mortgage,
  payment: MortgagePayment,
): PaymentSplit {
  const amort = Math.max(0, resolveMonthlyAmortization(mortgage) ?? 0);
  const amortization = Math.min(payment.amount, amort);
  return { amortization, interest: payment.amount - amortization };
}

// One mortgage's reconciliation between what's been recorded and the loan's
// own figures. The principal a mortgage has paid down so far is
// `loanAmount - currentBalance` (the drop from the original loan to the
// outstanding balance the user records directly). The recorded payments
// should amortise exactly that much, so `unaccounted` is the gap:
//
//   unaccounted = (loanAmount - currentBalance) - Σ recorded amortisation
//
// A positive figure means the balance fell further than the recorded
// payments explain — a payment is missing (or the recorded balance is too
// low). A negative one means the recorded payments amortise more than the
// balance dropped — the balance / loan figure is off, or a payment is wrong.
export type MortgageReconciliation = {
  mortgage: Mortgage;
  expectedAmortized: number; // loanAmount - currentBalance
  recordedAmortized: number; // Σ amortisation legs of the payments
  unaccounted: number; // expected - recorded
};

// Reconcile each mortgage's recorded amortisation against its loan figures.
// Only mortgages with both `loanAmount` and `currentBalance` can be
// reconciled — without them there's no expected figure — so the rest are
// skipped. The amortisation leg of each payment is derived with
// `splitRecordedPayment` (interest never pays down principal, so it's left
// out of the sum). Returned in the property's mortgage order.
export function reconcileMortgageAmortization(
  property: Property,
): MortgageReconciliation[] {
  const out: MortgageReconciliation[] = [];
  for (const mortgage of property.mortgages) {
    if (
      mortgage.loanAmount === undefined ||
      mortgage.currentBalance === undefined
    ) {
      continue;
    }
    const expectedAmortized = mortgage.loanAmount - mortgage.currentBalance;
    const recordedAmortized = mortgage.payments.reduce(
      (sum, payment) =>
        sum + splitRecordedPayment(mortgage, payment).amortization,
      0,
    );
    out.push({
      mortgage,
      expectedAmortized,
      recordedAmortized,
      unaccounted: expectedAmortized - recordedAmortized,
    });
  }
  return out;
}

// One mortgage's payment within a charge, paired with the mortgage it
// belongs to (payments are stored on `Mortgage.payments`, so the parent is
// otherwise implicit). Carried by `groupPaymentsByCharge` so the payments
// view can render and re-balance a charge without re-walking the property.
export type MortgageChargeItem = {
  mortgage: Mortgage;
  payment: MortgagePayment;
};

// One monthly bank charge across a property's mortgages — the records that
// were split from a single combined transaction (so share a
// `sourceHistoryId`) or, for hand-entered payments without one, that fall on
// the same date. `total` is the sum of the parts (= what the bank charged),
// `date` the representative (earliest) date in the group.
// `sourceHistoryId` is the bank transaction the split came from, when the
// charge was discovered (absent for hand-entered payments) — the payments
// view resolves it back to the original `HistoryEntry` for the popover.
export type MortgageChargeGroup = {
  key: string;
  date: string;
  total: number;
  sourceHistoryId?: string;
  items: MortgageChargeItem[];
};

// Group every recorded payment on a property into the charges they came
// from, so the payments view can show each monthly charge with its split
// across the mortgages. Payments sharing a `sourceHistoryId` are one charge;
// a hand-entered payment without one is grouped by its date. Within a group
// the items follow the property's mortgage order; groups are sorted by date,
// most recent first (key as a stable tiebreak).
export function groupPaymentsByCharge(
  property: Property,
): MortgageChargeGroup[] {
  const groups = new Map<string, MortgageChargeGroup>();
  for (const mortgage of property.mortgages) {
    for (const payment of mortgage.payments) {
      const key = payment.sourceHistoryId ?? `date:${payment.date}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          date: payment.date,
          total: 0,
          sourceHistoryId: payment.sourceHistoryId,
          items: [],
        };
        groups.set(key, group);
      }
      group.items.push({ mortgage, payment });
      group.total += payment.amount;
      // Representative date = the earliest in the group (a manual edit can
      // move one part's date; the charge keeps its original month).
      if (payment.date < group.date) group.date = payment.date;
    }
  }
  return [...groups.values()].sort((a, b) =>
    a.date > b.date ? -1 : a.date < b.date ? 1 : a.key < b.key ? -1 : 1,
  );
}
