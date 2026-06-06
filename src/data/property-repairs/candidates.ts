// Candidate finder for the "Add repairs / renovations" picker. A repair on
// a property is sourced from a bank charge the user tagged **Repairs**
// (`preset-type-repairs`) or **Renovations** (`preset-type-renovations`).
// This walk sweeps every account's imported history, resolves each entry's
// effective type the same way the budget tables do (`resolveEntryLabels`),
// and surfaces the outflows tagged with one of those two types that aren't
// already bound to a property's repairs.
//
// Unlike the mortgage finder this is a plain tag filter — no recurrence
// ranking, no amount maths: a repair is a one-off charge, not a standing
// monthly payment, so there's nothing to group or rank. Pure: fed the
// `UserData` plus the resolution tables, it emits the eligible charges.

import { resolveEntryLabels, newRuleMatchCache } from "../budget/synthesis";
import { allTypes } from "../presets/merge";
import {
  PRESET_TYPE_RENOVATIONS_ID,
  PRESET_TYPE_REPAIRS_ID,
} from "../presets/types";
import type { UserData } from "../types";

// One bank charge eligible to become a property repair / renovation.
export type RepairCandidate = {
  accountId: string;
  entryId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // the outflow magnitude (positive)
  description: string; // the entry's effective description (denormalised on add)
  typeId: string; // PRESET_TYPE_REPAIRS_ID | PRESET_TYPE_RENOVATIONS_ID
  hasReceipt: boolean; // whether the source entry already carries a receipt
  // The charge's effective company / tags (resolved override → rule → hint),
  // so the repair editor can seed its company + tags pickers without a second
  // resolution pass. Company / tags are NOT denormalised onto the repair —
  // they stay on the source transaction; these are seed values for the editor.
  companyId: string | null;
  tagIds: string[];
};

// Every Repairs / Renovations outflow across all accounts that isn't
// already bound to a property's repairs. The exclusion is global — a charge
// already used by ANY property is dropped, so the same transaction can't
// back two properties' repairs. Sorted newest-first for the picker.
export function findRepairCandidates(data: UserData): RepairCandidate[] {
  // Every source entry already consumed by a repair, across all properties.
  const used = new Set<string>();
  for (const property of data.properties) {
    for (const repair of property.repairs) used.add(repair.sourceHistoryId);
  }

  // Merged preset + user types so each entry's effective type resolves the
  // same way the budget tables tag it.
  const types = allTypes(data);
  const ruleCache = newRuleMatchCache();
  const candidates: RepairCandidate[] = [];
  for (const [accountId, entries] of Object.entries(data.history)) {
    for (const entry of entries) {
      if (entry.hidden || entry.collapsedIntoTransferId) continue;
      if (entry.amount >= 0) continue; // outflows only
      if (used.has(entry.id)) continue;
      const labels = resolveEntryLabels(
        entry,
        data.merchantHints,
        data.matchRules,
        data.companies,
        types,
        ruleCache,
      );
      if (
        labels.typeId !== PRESET_TYPE_REPAIRS_ID &&
        labels.typeId !== PRESET_TYPE_RENOVATIONS_ID
      )
        continue;
      candidates.push({
        accountId,
        entryId: entry.id,
        date: entry.date,
        amount: Math.abs(entry.amount),
        // Prefer the user's own label (override / rule / hint) and fall back
        // to the raw bank memo — never the type-name fallback, since "Repairs"
        // / "Renovations" is already conveyed by the row's glyph and makes a
        // poor row label next to the recognisable merchant text.
        description: labels.userDescription || entry.description,
        typeId: labels.typeId,
        hasReceipt: Boolean(entry.receiptPath),
        companyId: labels.companyId,
        tagIds: labels.tagIds,
      });
    }
  }

  candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return candidates;
}
