// Source-transaction helpers for property repairs. A `PropertyRepair` groups
// one **primary** source transaction (the `accountId` / `sourceHistoryId`
// pair on the repair, which also hosts the receipt and the row's company /
// tags) plus any number of **additional** sources (`additionalSources`) — the
// bank charges that together paid one invoice. These helpers flatten that
// split into one uniform list so callers don't special-case the primary.

import type { PropertyRepair, RepairSource } from "../types";

// The `${accountId}:${entryId}` identity of a source, matching the key the
// candidate finder and the receipt-status maps use throughout the page.
export function repairSourceKey(source: RepairSource): string {
  return `${source.accountId}:${source.entryId}`;
}

// Every transaction backing a repair, primary first, as a uniform
// `RepairSource` list (the primary's `sourceHistoryId` becomes `entryId`).
// The primary always leads so callers that need the receipt / metadata anchor
// can read `repairSources(repair)[0]`. A **manual** repair has no backing
// transaction (`accountId` / `sourceHistoryId` absent), so this returns an
// empty list for it.
export function repairSources(repair: PropertyRepair): RepairSource[] {
  const sources: RepairSource[] = [];
  if (repair.accountId && repair.sourceHistoryId) {
    sources.push({
      accountId: repair.accountId,
      entryId: repair.sourceHistoryId,
    });
  }
  if (repair.additionalSources) sources.push(...repair.additionalSources);
  return sources;
}

// How many transactions a repair groups (1 for a single-charge repair, 0 for a
// manual repair with no backing transaction).
export function repairSourceCount(repair: PropertyRepair): number {
  return repairSources(repair).length;
}

// The key a repair's resolved company / tags live under in the page's
// `repairMetadata` map. Transaction-backed repairs key on their primary
// source (`${accountId}:${entryId}`, matching the candidate finder and the
// receipt-status maps); a **manual** repair has no source, so it keys on its
// own id under a `manual:` prefix that can't collide with a source key.
export function repairMetaKey(repair: PropertyRepair): string {
  return repair.accountId && repair.sourceHistoryId
    ? `${repair.accountId}:${repair.sourceHistoryId}`
    : `manual:${repair.id}`;
}
