// Builds the line series behind the property "Visualize value" chart from a
// property's recorded value snapshots, its repairs, and its saved sale
// estimate. Pure and presentation-free (the data layer must not reach into
// components): it emits `{ x, y }` points keyed by logical line, and the modal
// maps each line to a themed colour + translated label.
//
// Three lines, all sampled at the value-snapshot dates (the only dates a market
// value is known for):
//
//  - `marketValue` — the recorded value over time. Always built.
//  - `withRepairs` — value PLUS the cumulative repair spend up to each date,
//    so the line reads as the property's value including the money invested in
//    it. Built only when `includeRepairs` is on.
//  - `netProfit` — the full net sale profit per snapshot (sale price less
//    broker fee, advertising, the deductible repair spend, the purchase price,
//    and capital-gains tax), via `computePropertySale`. Built only when
//    `showNetValue` is on. This is where repairs are *deducted* — the
//    `withRepairs` line adds them, so the two toggles point opposite ways on
//    purpose.

import { computePropertySale } from "../tax/engine";
import type { Property, Settings } from "../types";
import { resolveValueHistory } from "./value";

export type SeriesPoint = { x: number; y: number };

export type PropertyValueSeriesOptions = {
  includeRepairs: boolean;
  showNetValue: boolean;
};

export type PropertyValueSeries = {
  marketValue: SeriesPoint[];
  withRepairs: SeriesPoint[] | null;
  netProfit: SeriesPoint[] | null;
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
): PropertyValueSeries {
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

  const marketValue: SeriesPoint[] = snapshots.map((s) => ({
    x: s.ms,
    y: s.value,
  }));

  const withRepairs = options.includeRepairs
    ? snapshots.map((s) => ({
        x: s.ms,
        y: s.value + cumulativeRepairsAt(s.ms),
      }))
    : null;

  const netProfit = options.showNetValue
    ? snapshots.map((s) => {
        const result = computePropertySale(settings.location, {
          sellPrice: s.value,
          purchasePrice: property.purchaseAmount ?? 0,
          repairs: cumulativeRepairsAt(s.ms),
          advertisementCost: property.saleEstimate?.advertisementCost ?? 0,
          broker: property.saleEstimate?.broker ?? { mode: "none" },
        });
        return { x: s.ms, y: result.netProfit };
      })
    : null;

  return { marketValue, withRepairs, netProfit };
}
