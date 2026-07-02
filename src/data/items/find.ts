// Pure scanner for the Items sheet's "Find items" flow. Walks every
// account's imported bank history and surfaces the transactions that look
// like item purchases — large outflows the user might want to turn into
// owned `Item`s via line-item links.
//
// Pure: no React, no localStorage, no side effects. Fed the whole
// `UserData` plus the resolved `Settings`, it emits a sorted list of
// candidates the modal walks one at a time. Three persisted opt-outs are
// honoured here so a dismissed entry never resurfaces: the per-entry
// "ignore" allowlist (`UserData.ignoredItemEntryIds`), the
// normalised-description "exclude similar" patterns
// (`UserData.itemFindExclusionPatterns`), and the hard `NEVER_ITEM_TYPE_IDS`
// type denylist (rent, utilities, subscriptions — never resaleable goods).

import { resolveEntryLabels } from "../synthesis";
import { normaliseDescription } from "../description-normaliser";
import { NEVER_ITEM_TYPE_IDS } from "../presets/types";
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
  // exclude the entry by itself (a 20 000 purchase may have one item
  // linked and more to add) — only a fully-allocated entry, whose
  // linked items' purchase prices cover the whole amount, drops out
  // of the scan.
  existingLineItemCount: number;
};

// Find the bank transactions that look like item purchases under the
// user's current threshold + type filter. A purchase is money leaving
// the account, so only outflows (negative amounts) qualify — a large
// inflow (selling the apartment, a tax refund) is never an item
// purchase. Skips entries the user shelved (`hidden`), already collapsed
// into a transfer, flagged as a transfer, previously ignored, or whose
// line items already account for the full amount. Sorted
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
  // Normalised-description keys the user excluded via "Exclude similar".
  // An empty list short-circuits the per-entry normalise call below.
  const excludedPatterns =
    data.itemFindExclusionPatterns.length > 0
      ? new Set(data.itemFindExclusionPatterns)
      : null;
  // Purchase prices keyed by owned-item id, so an entry whose linked
  // items already cover its full amount drops out of the scan.
  const priceById = new Map<string, number>();
  for (const item of data.items) {
    if (item.purchasePrice !== undefined) {
      priceById.set(item.id, item.purchasePrice);
    }
  }

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
      // Fully catalogued: the linked items' purchase prices already
      // account for the whole amount, so resurfacing the entry is pure
      // noise. A partial allocation keeps the entry in the scan — there
      // may be more items left to add.
      if (entry.lineItems && entry.lineItems.length > 0) {
        let allocated = 0;
        for (const link of entry.lineItems) {
          allocated += priceById.get(link.itemId) ?? 0;
        }
        if (allocated >= Math.abs(entry.amount)) continue;
      }

      const { description, typeId } = resolveEntryLabels(
        entry,
        data.merchantHints,
        data.matchRules,
        data.companies,
        data.types,
      );
      // Hard floor: types that are never a resaleable physical good
      // (rent, utilities, subscriptions, …) are dropped regardless of
      // the allow-list, so they can't clutter a scan-every-type run.
      if (typeId !== null && NEVER_ITEM_TYPE_IDS.has(typeId)) continue;
      if (typeFilter && (typeId === null || !typeFilter.has(typeId))) {
        continue;
      }
      // Drop entries whose resolved description matches a "similar"
      // exclusion the user created (recurring charges, budget transfers).
      if (excludedPatterns?.has(normaliseDescription(description))) continue;

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
