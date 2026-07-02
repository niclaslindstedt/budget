// Candidate finder for the Cars sheet's "Find car expenses" picker. A
// car's cost is sourced from bank charges resolving to a Transport
// preset type (fuel, parking, insurance, vehicle / congestion tax,
// leasing, service, taxi, public transport). This walk sweeps every
// account's imported history, resolves each entry's effective type the
// same way the budget tables do (`resolveEntryLabels`), and surfaces
// the outflows tagged with one of those types that aren't already
// attributed to a car — or dismissed via the persisted ignore /
// exclude-similar lists.
//
// Like the repairs finder this is a plain tag filter — no recurrence
// ranking, no amount maths: which fuel receipts belong to which car is
// the user's call, not a statistical one. Pure: fed the `UserData`, it
// emits the eligible charges.

import { resolveEntryLabels, newRuleMatchCache } from "../synthesis";
import { normaliseDescription } from "../description-normaliser";
import { allTypes } from "../presets/merge";
import { CAR_EXPENSE_TYPE_IDS } from "../presets/types";
import type { UserData } from "../types";
import { carExpenseKey } from "./costs";

// One bank charge eligible to become a car expense.
export type CarExpenseCandidate = {
  accountId: string;
  entryId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // the outflow magnitude (positive)
  description: string; // the entry's effective description (denormalised on add)
  typeId: string; // one of CAR_EXPENSE_TYPE_IDS
};

// Every transport-typed outflow across all accounts that isn't already
// attributed to a car. The already-linked exclusion is global and spans
// every car — a charge attributed to ANY car is dropped, so the same
// tank of fuel can't be double-counted across two cars. Sorted
// newest-first for the picker.
export function findCarExpenseCandidates(
  data: UserData,
): CarExpenseCandidate[] {
  const used = new Set<string>();
  for (const car of data.cars) {
    for (const expense of car.expenses) {
      const key = carExpenseKey(expense);
      if (key !== undefined) used.add(key);
    }
  }
  const ignored = new Set(data.ignoredCarExpenseEntryIds);
  // Normalised-description keys the user excluded via "Exclude similar".
  // An empty list short-circuits the per-entry normalise call below.
  const excludedPatterns =
    data.carExpenseExclusionPatterns.length > 0
      ? new Set(data.carExpenseExclusionPatterns)
      : null;

  // Merged preset + user types so each entry's effective type resolves
  // the same way the budget tables tag it.
  const types = allTypes(data);
  const ruleCache = newRuleMatchCache();
  const candidates: CarExpenseCandidate[] = [];
  for (const [accountId, entries] of Object.entries(data.history)) {
    for (const entry of entries) {
      if (entry.hidden || entry.collapsedIntoTransferId) continue;
      if (entry.isTransfer) continue;
      if (entry.amount >= 0) continue; // outflows only
      if (ignored.has(entry.id)) continue;
      if (used.has(`${accountId}:${entry.id}`)) continue;
      const labels = resolveEntryLabels(
        entry,
        data.merchantHints,
        data.matchRules,
        data.companies,
        types,
        ruleCache,
      );
      const typeId = labels.typeId ?? "";
      if (!CAR_EXPENSE_TYPE_IDS.has(typeId)) continue;
      // Prefer the user's own label (override / rule / hint) and fall
      // back to the raw bank memo — the type name is already conveyed
      // by the row's glyph.
      const description = labels.userDescription || entry.description;
      if (excludedPatterns?.has(normaliseDescription(description))) continue;
      candidates.push({
        accountId,
        entryId: entry.id,
        date: entry.date,
        amount: Math.abs(entry.amount),
        description,
        typeId,
      });
    }
  }

  candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return candidates;
}
