// The recorded payments behind a loan, as the Loans sheet lists them —
// shared by the read-only loan view and the payments management modal so
// the two can never disagree on what counts as "one payment".

import type { Loan, Mortgage } from "../types";

export type LoanPaymentRow = { id: string; date: string; amount: number };

// A linked loan's combined charge is recorded as one split per linked
// mortgage, every leg sharing the charge's `sourceHistoryId` — list it
// as ONE row summing the legs (a hand-entered payment with no source
// stays its own row). Unlinked loans list their own payments. Sorted
// newest first.
export function listLoanPayments(
  loan: Loan,
  linkedMortgages: readonly Mortgage[] | null,
): LoanPaymentRow[] {
  let payments: LoanPaymentRow[];
  if (linkedMortgages) {
    const byCharge = new Map<string, LoanPaymentRow>();
    for (const mortgage of linkedMortgages) {
      for (const payment of mortgage.payments) {
        const key = payment.sourceHistoryId ?? `solo:${payment.id}`;
        const existing = byCharge.get(key);
        if (existing) {
          existing.amount += payment.amount;
        } else {
          byCharge.set(key, {
            id: payment.id,
            date: payment.date,
            amount: payment.amount,
          });
        }
      }
    }
    payments = [...byCharge.values()];
  } else {
    payments = loan.payments.map((p) => ({
      id: p.id,
      date: p.date,
      amount: p.amount,
    }));
  }
  return payments.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
}
