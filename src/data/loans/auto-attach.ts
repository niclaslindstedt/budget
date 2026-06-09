// The silent half of loan payment import: when a bank-statement import
// adds entries matching a loan's learned payment patterns, record them as
// payments right inside the `importBankHistory` reducer pass — no modal,
// one undo entry, deduped by source entry id. Mirrors how the same branch
// stamps primary income and folds savings balances.

import type { HistoryEntry, Loan, LoanPayment, Property } from "../types";
import { newId } from "../sheet";
import { resolveLinkedMortgages } from "./balance";
import { matchesPaymentPattern } from "./patterns";

// Attach matching `newEntries` (the genuinely-new rows of an import) to
// every loan whose patterns match. Linked mortgage loans are skipped — the
// mortgage's payments belong to the Properties flow. Returns the input
// array referentially when nothing matched so the reducer's return object
// stays cheap to diff.
export function attachImportedLoanPayments(
  loans: Loan[],
  newEntries: readonly HistoryEntry[],
  properties: readonly Property[],
): Loan[] {
  if (loans.length === 0 || newEntries.length === 0) return loans;
  let touched = false;
  const next = loans.map((loan) => {
    if (loan.paymentPatterns === undefined || loan.paymentPatterns.length === 0)
      return loan;
    if (resolveLinkedMortgages(loan, properties) !== null) return loan;
    const consumed = new Set<string>();
    for (const payment of loan.payments) {
      if (payment.sourceHistoryId !== undefined)
        consumed.add(payment.sourceHistoryId);
    }
    const added: LoanPayment[] = [];
    for (const entry of newEntries) {
      if (entry.hidden) continue;
      if (entry.amount >= 0) continue;
      if (consumed.has(entry.id)) continue;
      if (!matchesPaymentPattern(loan.paymentPatterns, entry.description))
        continue;
      consumed.add(entry.id);
      added.push({
        id: newId(),
        date: entry.date,
        amount: Math.abs(entry.amount),
        sourceHistoryId: entry.id,
      });
    }
    if (added.length === 0) return loan;
    touched = true;
    return { ...loan, payments: [...loan.payments, ...added] };
  });
  return touched ? next : loans;
}
