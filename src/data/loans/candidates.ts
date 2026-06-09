// Candidate scan for the loan "Import payments" modal: bank entries the
// user has tagged with the loan kind's preset type (directly, via a match
// rule, or via merchant memory) plus entries matching the loan's learned
// payment patterns — minus everything already recorded as a payment.

import type { HistoryEntry, Loan, UserData } from "../types";
import { newRuleMatchCache, resolveEntryLabels } from "../budget/synthesis";
import { LOAN_PRESET_TYPE_BY_KIND } from "./presets";
import { resolveLinkedMortgage } from "./balance";
import { matchesPaymentPattern } from "./patterns";

export type LoanPaymentCandidate = {
  // The history bucket (account or savings account) the entry lives in.
  accountId: string;
  entry: HistoryEntry;
};

// Ids of the bank entries already consumed as payments — the loan's own
// records, or the linked mortgage's when the loan is a live link.
export function consumedHistoryIds(
  loan: Loan,
  state: UserData,
): Set<string> {
  const linked = resolveLinkedMortgage(loan, state.properties);
  const payments = linked ? linked.mortgage.payments : loan.payments;
  const ids = new Set<string>();
  for (const payment of payments) {
    if (payment.sourceHistoryId !== undefined) ids.add(payment.sourceHistoryId);
  }
  return ids;
}

// Scan every history bucket for entries that look like payments on `loan`.
// Outflows only; hidden and transfer-collapsed entries are skipped. Sorted
// by date descending so the freshest charges sit at the top of the modal.
export function findLoanPaymentCandidates(
  loan: Loan,
  state: UserData,
): LoanPaymentCandidate[] {
  const anchorTypeId = LOAN_PRESET_TYPE_BY_KIND[loan.kind];
  const consumed = consumedHistoryIds(loan, state);
  const ruleCache = newRuleMatchCache();
  const out: LoanPaymentCandidate[] = [];
  for (const [accountId, entries] of Object.entries(state.history)) {
    for (const entry of entries) {
      if (entry.hidden) continue;
      if (entry.collapsedIntoTransferId !== undefined) continue;
      if (entry.amount >= 0) continue;
      if (consumed.has(entry.id)) continue;
      const matchesPattern = matchesPaymentPattern(
        loan.paymentPatterns,
        entry.description,
      );
      if (!matchesPattern) {
        const labels = resolveEntryLabels(
          entry,
          state.merchantHints,
          state.matchRules,
          undefined,
          undefined,
          ruleCache,
        );
        if (labels.typeId !== anchorTypeId) continue;
      }
      out.push({ accountId, entry });
    }
  }
  out.sort((a, b) =>
    a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : 0,
  );
  return out;
}
