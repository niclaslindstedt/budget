import type { Item, ItemDepreciation, ItemValuePoint } from "../types";

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

// The id stamped on the synthesised purchase value point. It is NOT a real
// `valueHistory` entry, so the Update value modal renders it read-only —
// the purchase value is owned by the item's `purchasePrice` / `acquiredAt`,
// changed by editing the item, not by deleting a snapshot. Mirrors the
// property / holding value models.
export const ITEM_PURCHASE_VALUE_POINT_ID = "purchase";

// Whether a value point is the synthesised purchase point rather than a
// real, user-recorded snapshot.
export function isItemPurchaseValuePoint(point: ItemValuePoint): boolean {
  return point.id === ITEM_PURCHASE_VALUE_POINT_ID;
}

// The value point implied by an item's purchase: `purchasePrice` at
// `acquiredAt`. Undefined unless both are set — a value point needs a date
// to place it on the timeline.
export function itemPurchaseValuePoint(item: Item): ItemValuePoint | undefined {
  if (item.purchasePrice === undefined || !item.acquiredAt) return undefined;
  return {
    id: ITEM_PURCHASE_VALUE_POINT_ID,
    date: item.acquiredAt,
    value: item.purchasePrice,
  };
}

// An item's value history with the purchase folded in as the first value,
// for display in the Update value modal. The synthesised purchase point is
// included only when no recorded snapshot already sits on the purchase
// date. Unsorted — callers that render it order it themselves. Mirrors
// `resolveHoldingValueHistory`.
export function resolveItemValueHistory(item: Item): ItemValuePoint[] {
  const recorded = item.valueHistory ?? [];
  const purchase = itemPurchaseValuePoint(item);
  if (!purchase) return recorded;
  if (recorded.some((pt) => pt.date === purchase.date)) return recorded;
  return [purchase, ...recorded];
}

// The latest user-recorded value point on or before `iso`, or undefined
// when none has landed yet. Scans only the stored `valueHistory` — the
// synthesised purchase point is deliberately NOT considered here, so an
// item with a depreciation curve keeps decaying until the user records an
// explicit value (otherwise the folded purchase point would short-circuit
// the curve from day one).
function latestRecordedValueAt(item: Item, iso: string): number | undefined {
  let latest: ItemValuePoint | undefined;
  for (const point of item.valueHistory ?? []) {
    if (point.date > iso) continue;
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
}

// The item's estimated value at `todayIso`, in the user's currency units.
//
// Resolution order, most-authoritative first:
//   1. A disposed item is worth its `soldFor` proceeds (0 for a
//      give-away) — it is no longer owned capital. `disposedAt` alone
//      (no proceeds recorded) counts as 0.
//   2. The latest dated value snapshot on or before the date wins over any
//      computed figure — it is the user's own appraisal at a point in
//      time, and is what lets an appreciating item rise across the
//      net-worth series instead of sitting flat at its purchase price.
//   3. A manual `resaleValue` override (undated) — the user's estimate of
//      what they could get for it today.
//   4. A depreciation rule decays the purchase price from `acquiredAt`
//      (see `decayedValue` for the per-method curves), never below
//      `floor`.
//   5. Otherwise the purchase price stands (no decay).
//   6. With none of the above, the item has no known value: 0.
export function computeItemCurrentValue(item: Item, todayIso: string): number {
  if (item.disposedAt !== undefined || item.soldFor !== undefined) {
    return item.soldFor ?? 0;
  }

  const recorded = latestRecordedValueAt(item, todayIso);
  if (recorded !== undefined) return recorded;

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
