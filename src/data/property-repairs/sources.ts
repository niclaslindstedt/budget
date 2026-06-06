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
// can read `repairSources(repair)[0]`.
export function repairSources(repair: PropertyRepair): RepairSource[] {
  const primary: RepairSource = {
    accountId: repair.accountId,
    entryId: repair.sourceHistoryId,
  };
  return repair.additionalSources && repair.additionalSources.length > 0
    ? [primary, ...repair.additionalSources]
    : [primary];
}

// How many transactions a repair groups (1 for a single-charge repair).
export function repairSourceCount(repair: PropertyRepair): number {
  return 1 + (repair.additionalSources?.length ?? 0);
}
