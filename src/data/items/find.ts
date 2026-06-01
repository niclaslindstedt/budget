// Pure scanner for the Items sheet's "Find items" flow. Walks every
// account's imported bank history and surfaces the transactions that look
// like item purchases — large outflows the user might want to turn into
// owned `Item`s via line-item links.
//
// Pure: no React, no localStorage, no side effects. Fed the whole
// `UserData` plus the resolved `Settings`, it emits a sorted list of
// candidates the modal walks one at a time. The "ignore" allowlist
// (`UserData.ignoredItemEntryIds`) is read here so an entry the user
// decided isn't an item purchase never resurfaces.

import { resolveEntryLabels } from "../budget/synthesis";
import type { Settings, UserData } from "../types";

export type ItemPurchaseCandidate = {
  // The account the entry was imported into — needed so the modal can
  // route a line-item link back to the right `UserData.history[accountId]`
  // bucket via `linkLineItemsToHistoryEntry`.
  accountId: string;
  // The `HistoryEntry.id`.
  entryId: string;
  date: string;
  // The resolved display label (per-entry override → rule → hint → bank
  // text), via `resolveEntryLabels` — never the raw bank text alone.
  description: string;
  // Signed amount, in the user's currency units. `|amount|` clears the
  // configured threshold.
  amount: number;
  // The resolved type id, if any — used both for the type-allow-list gate
  // and to show a type chip in the modal.
  typeId?: string;
  // How many line items the entry already carries. The modal surfaces
  // this so a partly-catalogued purchase reads as such; it doesn't
  // exclude the entry (a 20 000 purchase may have one item linked and
  // more to add).
  existingLineItemCount: number;
};

// Find the bank transactions that look like item purchases under the
// user's current threshold + type filter. A purchase is money leaving
// the account, so only outflows (negative amounts) qualify — a large
// inflow (selling the apartment, a tax refund) is never an item
// purchase. Skips entries the user shelved (`hidden`), already collapsed
// into a transfer, flagged as a transfer, or previously ignored. Sorted
// by descending year first (this year before last year, …) then by
// descending absolute amount within a year, so the most recent
// big-ticket purchases — the ones most worth cataloguing — come first.
export function findItemPurchaseCandidates(
  data: UserData,
  settings: Settings,
): ItemPurchaseCandidate[] {
  const threshold = settings.itemFindThreshold;
  const typeFilter =
    settings.itemFindTypeIds.length > 0
      ? new Set(settings.itemFindTypeIds)
      : null;
  const ignored = new Set(data.ignoredItemEntryIds);

  const out: ItemPurchaseCandidate[] = [];
  for (const [accountId, entries] of Object.entries(data.history)) {
    for (const entry of entries) {
      if (entry.hidden) continue;
      if (entry.collapsedIntoTransferId) continue;
      if (entry.isTransfer) continue;
      if (ignored.has(entry.id)) continue;
      // Outflows only — money you spent. A positive amount is an inflow
      // (a sale, a refund), never a purchase.
      if (entry.amount >= 0) continue;
      if (Math.abs(entry.amount) < threshold) continue;

      const { description, typeId } = resolveEntryLabels(
        entry,
        data.merchantHints,
        data.matchRules,
        data.companies,
        data.types,
      );
      if (typeFilter && (typeId === null || !typeFilter.has(typeId))) {
        continue;
      }

      const candidate: ItemPurchaseCandidate = {
        accountId,
        entryId: entry.id,
        date: entry.date,
        description,
        amount: entry.amount,
        existingLineItemCount: entry.lineItems?.length ?? 0,
      };
      if (typeId !== null) candidate.typeId = typeId;
      out.push(candidate);
    }
  }

  out.sort((a, b) => {
    // Descending year (more recent first); ISO dates sort lexically, so
    // the 4-char year prefix compares directly.
    const yearA = a.date.slice(0, 4);
    const yearB = b.date.slice(0, 4);
    if (yearA !== yearB) return yearB.localeCompare(yearA);
    // Within a year, biggest-ticket purchases first.
    return Math.abs(b.amount) - Math.abs(a.amount);
  });
  return out;
}
