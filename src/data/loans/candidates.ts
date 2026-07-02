// Candidate scan for the loan "Import payments" modal: bank entries the
// user has tagged with the loan kind's preset type (directly, via a match
// rule, or via merchant memory) plus entries matching the loan's learned
// payment patterns — minus everything already recorded as a payment.
// `findSimilarLoanPaymentCandidates` widens that set: entries sharing a
// normalised bank-description key with a direct candidate whose amount
// sits within a percentage tolerance, so tagging ONE charge is enough to
// surface the loan's whole history.

import type { HistoryEntry, Loan, UserData } from "../types";
import { newRuleMatchCache, resolveEntryLabels } from "../synthesis";
import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import { LOAN_PRESET_TYPE_BY_KIND } from "./presets";
import { resolveLinkedMortgages } from "./balance";
import { matchesPaymentPattern } from "./patterns";

export type LoanPaymentCandidate = {
  // The history bucket (account or savings account) the entry lives in.
  accountId: string;
  entry: HistoryEntry;
};

// Ids of the bank entries already consumed as payments — the loan's own
// records, or every linked mortgage's when the loan is a live link (a
// combined charge records one split per mortgage, all pointing at the
// same bank entry, so the union dedupes naturally).
export function consumedHistoryIds(loan: Loan, state: UserData): Set<string> {
  const linked = resolveLinkedMortgages(loan, state.properties);
  const ids = new Set<string>();
  const paymentLists = linked
    ? linked.mortgages.map((m) => m.payments)
    : [loan.payments];
  for (const payments of paymentLists) {
    for (const payment of payments) {
      if (payment.sourceHistoryId !== undefined)
        ids.add(payment.sourceHistoryId);
    }
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
  out.sort(byDateDesc);
  return out;
}

function byDateDesc(a: LoanPaymentCandidate, b: LoanPaymentCandidate): number {
  return a.entry.date < b.entry.date ? 1 : a.entry.date > b.entry.date ? -1 : 0;
}

// Similar-payment suggestions for the same modal: outflow entries that
// share a normalised bank-description key with one of the `direct`
// candidates AND whose magnitude falls within ±`tolerancePct`% of that
// anchor's. Catches the common case where the user typed ONE charge with
// the loan's preset type — the rest of the autogiro history has the same
// description and a near-identical amount (it only drifts when the lender
// adjusts the instalment). The amount guard keeps a same-merchant charge
// for something else (an extra amortisation, a one-off fee) out of the
// default-ticked set. Disjoint from `direct`; same exclusions; sorted
// date-descending like the direct scan.
export function findSimilarLoanPaymentCandidates(
  loan: Loan,
  state: UserData,
  direct: readonly LoanPaymentCandidate[],
  tolerancePct: number,
): LoanPaymentCandidate[] {
  if (direct.length === 0) return [];
  // Anchor key → the |amount|s seen under it among the direct candidates.
  const anchors = new Map<string, number[]>();
  for (const { entry } of direct) {
    const key = normaliseDescription(entry.description);
    if (!isNormalisedKeyMeaningful(key)) continue;
    const amounts = anchors.get(key);
    if (amounts) amounts.push(Math.abs(entry.amount));
    else anchors.set(key, [Math.abs(entry.amount)]);
  }
  if (anchors.size === 0) return [];
  const consumed = consumedHistoryIds(loan, state);
  const directIds = new Set(direct.map((c) => c.entry.id));
  const tolerance = Math.max(0, tolerancePct) / 100;
  const out: LoanPaymentCandidate[] = [];
  for (const [accountId, entries] of Object.entries(state.history)) {
    for (const entry of entries) {
      if (entry.hidden) continue;
      if (entry.collapsedIntoTransferId !== undefined) continue;
      if (entry.amount >= 0) continue;
      if (consumed.has(entry.id)) continue;
      if (directIds.has(entry.id)) continue;
      const anchorAmounts = anchors.get(
        normaliseDescription(entry.description),
      );
      if (anchorAmounts === undefined) continue;
      const amount = Math.abs(entry.amount);
      const close = anchorAmounts.some(
        (anchor) => Math.abs(amount - anchor) <= anchor * tolerance,
      );
      if (!close) continue;
      out.push({ accountId, entry });
    }
  }
  out.sort(byDateDesc);
  return out;
}
