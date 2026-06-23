// Builds the single line behind the property "Visualize value" chart from a
// property's recorded value snapshots, its repairs, and its saved sale
// estimate. Pure and presentation-free (the data layer must not reach into
// components): it emits `{ x, y }` points and the modal maps them to a themed
// colour + translated label.
//
// One curve, sampled at the value-snapshot dates (the only dates a market
// value is known for). The two toggles transform the curve in place rather
// than adding extra lines:
//
//  - base — the recorded market value at each date.
//  - `showNetValue` — replace the base with the full net sale profit per
//    snapshot (sale price less broker fee, advertising, the deductible repair
//    spend, the purchase price, and capital-gains tax), via
//    `computePropertySale`. This is where repairs are *deducted*.
//  - `includeRepairs` — add the cumulative repair spend up to each date on top,
//    so repairs *raise* the curve (the money you've invested shows in the
//    value). When both toggles are on the added repairs counterbalance the
//    repair deduction inside the net calc — the toggles point opposite ways on
//    purpose.
//  - `includeInterest` — subtract the cumulative interest paid on the
//    property's own mortgages up to each date, so the curve reflects the money
//    spent on interest that never comes back (it grows over time as more
//    interest is paid).
//  - `includeAssociationInterest` — additionally subtract the cumulative
//    interest on the property's share of the housing association's debt (the
//    bostadsrätt case, where that interest rides the monthly fee). Only ever
//    set alongside `includeInterest`; the modal gates the toggle on it.

import {
  cumulativeAssociationInterestAt,
  cumulativeMortgageInterestAt,
} from "./interest";
import { computePropertySale } from "../tax/engine";
import type { Property, Settings } from "../types";
import { resolveValueHistory } from "./value";

export type SeriesPoint = { x: number; y: number };

export type PropertyValueSeriesOptions = {
  includeRepairs: boolean;
  showNetValue: boolean;
  includeInterest: boolean;
  includeAssociationInterest: boolean;
};

// Parse an ISO yyyy-mm-dd date to epoch ms (UTC midnight, round-trips back to
// the same date string). Returns null for a malformed value so a bad snapshot
// is skipped rather than charting NaN.
function isoToMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function buildPropertyValueSeries(
  property: Property,
  settings: Settings,
  options: PropertyValueSeriesOptions,
): SeriesPoint[] {
  // Use the resolved history (the purchase folded in as the first value), so
  // the chart matches the current-value figure on the card and a freshly
  // bought property already has its purchase point to anchor the line.
  const snapshots = resolveValueHistory(property)
    .map((p) => ({ ms: isoToMs(p.date), value: p.value }))
    .filter((p): p is { ms: number; value: number } => p.ms !== null)
    .sort((a, b) => a.ms - b.ms);

  const repairs = property.repairs
    .map((r) => ({ ms: isoToMs(r.date), amount: r.amount }))
    .filter((r): r is { ms: number; amount: number } => r.ms !== null)
    .sort((a, b) => a.ms - b.ms);

  // Cumulative repair spend up to (and including) a given instant. Repairs are
  // pre-sorted, so the running sum can short-circuit once it passes the date.
  const cumulativeRepairsAt = (ms: number): number => {
    let sum = 0;
    for (const r of repairs) {
      if (r.ms <= ms) sum += r.amount;
      else break;
    }
    return sum;
  };

  return snapshots.map((s) => {
    const iso = new Date(s.ms).toISOString().slice(0, 10);
    const cumulativeRepairs = cumulativeRepairsAt(s.ms);
    const base = options.showNetValue
      ? computePropertySale(settings.location, {
          sellPrice: s.value,
          purchasePrice: property.purchaseAmount ?? 0,
          repairs: cumulativeRepairs,
          advertisementCost: property.saleEstimate?.advertisementCost ?? 0,
          broker: property.saleEstimate?.broker ?? { mode: "none" },
        }).netProfit
      : s.value;
    let y = options.includeRepairs ? base + cumulativeRepairs : base;
    // Interest paid is sunk cost: deduct it so the curve drops by the running
    // total of interest spent up to this snapshot.
    if (options.includeInterest) {
      y -= cumulativeMortgageInterestAt(property, iso);
      if (options.includeAssociationInterest)
        y -= cumulativeAssociationInterestAt(property, iso);
    }
    return { x: s.ms, y };
  });
}
