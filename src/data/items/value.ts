import type { Item, ItemDepreciation } from "../types";

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

// The share of value retained after losing `percent` % — clamped at 0 so
// a rate ≥ 100 % decays to zero instead of producing a negative factor
// (which would NaN under a fractional `Math.pow` exponent).
function retained(percent: number): number {
  const factor = 1 - percent / 100;
  return factor > 0 ? factor : 0;
}

// What a depreciation rule says the purchase price has decayed to after
// `years` of ownership, before the floor is applied.
//
//   - `percentPerYear`: steady declining balance — the same share of the
//     remaining value is shed every year.
//   - `accelerated`: front-loaded — `initialDrop` % comes off the moment
//     the item is acquired (no longer new), the first year sheds
//     `firstYearRate` % of what's left, and every year after that sheds
//     `ratePerYear` % (declining balance).
function decayedValue(
  base: number,
  dep: ItemDepreciation,
  years: number,
): number {
  if (dep.method === "accelerated") {
    const afterDrop = base * retained(dep.initialDrop);
    const firstYear = retained(dep.firstYearRate);
    if (years <= 1) return afterDrop * Math.pow(firstYear, years);
    return (
      afterDrop * firstYear * Math.pow(retained(dep.ratePerYear), years - 1)
    );
  }
  return base * Math.pow(retained(dep.ratePerYear), years);
}

// The item's estimated value today, in the user's currency units.
//
// Resolution order, most-authoritative first:
//   1. A disposed item is worth its `soldFor` proceeds (0 for a
//      give-away) — it is no longer owned capital. `disposedAt` alone
//      (no proceeds recorded) counts as 0.
//   2. A manual `resaleValue` override wins over any computed figure —
//      it is the user's own estimate of what they could get for it.
//   3. A depreciation rule decays the purchase price from `acquiredAt`
//      (see `decayedValue` for the per-method curves), never below
//      `floor`.
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
    const decayed = decayedValue(base, dep, years);
    return dep.floor !== undefined ? Math.max(decayed, dep.floor) : decayed;
  }

  return base;
}

// Whether an item still counts as owned capital — i.e. not yet sold or
// given away. The Items sheet hides disposed items from its table by
// default; this is the single predicate that decides membership.
export function isItemOwned(item: Item): boolean {
  return item.disposedAt === undefined && item.soldFor === undefined;
}
