import type { Item } from "../types";

// Pure helpers for the owned-items catalog rendered by the Items sheet.
// No React, no network — the value math runs locally so the Items page
// (and any future savings / net-worth roll-up) can read a single
// current-value figure per item.

// Whole years (fractional) elapsed between two ISO dates, clamped at 0
// so a future acquisition date never inflates the value above the
// purchase price. Approximate — 365.25 days/year is plenty for a
// declining-balance estimate the user can override manually anyway.
function yearsBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const years = (to - from) / (365.25 * 24 * 60 * 60 * 1000);
  return years > 0 ? years : 0;
}

// The item's estimated value today, in the user's currency units.
//
// Resolution order, most-authoritative first:
//   1. A disposed item is worth its `soldFor` proceeds (0 for a
//      give-away) — it is no longer owned capital. `disposedAt` alone
//      (no proceeds recorded) counts as 0.
//   2. A manual `resaleValue` override wins over any computed figure —
//      it is the user's own estimate of what they could get for it.
//   3. A declining-balance depreciation rule decays the purchase price
//      by `ratePerYear` % of the remaining value each year from
//      `acquiredAt`, never below `floor`.
//   4. Otherwise the purchase price stands (no decay).
//   5. With none of the above, the item has no known value: 0.
export function computeItemCurrentValue(item: Item, todayIso: string): number {
  if (item.disposedAt !== undefined || item.soldFor !== undefined) {
    return item.soldFor ?? 0;
  }
  if (item.resaleValue !== undefined) return item.resaleValue;

  const base = item.purchasePrice;
  if (base === undefined) return 0;

  const dep = item.depreciation;
  if (dep && item.acquiredAt !== undefined) {
    const years = yearsBetween(item.acquiredAt, todayIso);
    const rate = dep.ratePerYear / 100;
    const decayed = base * Math.pow(1 - rate, years);
    const floored =
      dep.floor !== undefined ? Math.max(decayed, dep.floor) : decayed;
    // Guard against a rate ≥ 100 % driving the value negative.
    return floored > 0 ? floored : (dep.floor ?? 0);
  }

  return base;
}

// Whether an item still counts as owned capital — i.e. not yet sold or
// given away. The Items sheet hides disposed items from its table by
// default; this is the single predicate that decides membership.
export function isItemOwned(item: Item): boolean {
  return item.disposedAt === undefined && item.soldFor === undefined;
}
