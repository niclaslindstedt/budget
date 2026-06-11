// Builds the single line behind the Investment sheet's "Visualize value"
// chart: the combined value of every holding and every private stock
// position, sampled monthly. Pure and presentation-free (the data layer
// must not reach into components): it emits `{ x, y }` points and the
// modal maps them to a themed colour + translated label.
//
// The `showNetValue` toggle swaps each item's gross market value for its
// net-after-sale-tax value (ISK / KF untaxed, depå 30 %, company 20.6 %),
// so the curve answers "what's the whole portfolio worth if I sell it?".
// Sampling mirrors `buildNetWorthSeries`: monthly from the earliest known
// date through today, each item contributing its as-of value (a step
// function — the last value on or before the sample date).

import type { InvestmentHolding, StockPosition, Settings } from "../types";
import { isoToMonthNum, monthNumToIsoEnd } from "../../utils/date";
import { holdingNetValue, holdingValueAt } from "./holdings";
import { resolveStockPosition, stockNetValue } from "./stock";

export type SeriesPoint = { x: number; y: number };

export type InvestmentValueSeriesOptions = {
  showNetValue: boolean;
};

// The earliest dated value across every holding and stock position, on or
// before `today`. Drives the series window so the chart starts where the
// data does instead of prepending months of zero.
function earliestRelevantDate(
  holdings: readonly InvestmentHolding[],
  stocks: readonly StockPosition[],
  today: string,
): string | undefined {
  let earliest: string | undefined;
  const consider = (date: string | undefined) => {
    if (date === undefined || date === "" || date > today) return;
    if (earliest === undefined || date < earliest) earliest = date;
  };
  for (const holding of holdings) {
    consider(holding.purchaseDate);
    for (const point of holding.valueHistory) consider(point.date);
  }
  for (const position of stocks) {
    for (const tx of position.transactions) consider(tx.date);
    for (const point of position.priceHistory) consider(point.date);
  }
  return earliest;
}

// A holding's contribution at `iso` — its as-of value, net or gross.
function holdingContribution(
  holding: InvestmentHolding,
  iso: string,
  settings: Settings,
  showNetValue: boolean,
): number {
  const value = holdingValueAt(holding, iso);
  if (value === undefined) return 0;
  return showNetValue
    ? holdingNetValue(holding, value, settings.location)
    : value;
}

// A position's contribution at `iso` — its as-of value, net or gross.
function stockContribution(
  position: StockPosition,
  iso: string,
  settings: Settings,
  showNetValue: boolean,
): number {
  const resolved = resolveStockPosition(position, iso);
  if (resolved.value === undefined) return 0;
  if (!showNetValue) return resolved.value;
  return stockNetValue(position, resolved, settings.location) ?? 0;
}

// The combined portfolio value sampled monthly from the earliest relevant
// date through today. Each month samples at its last day, except the
// current month which samples at `todayIso` — so the line's last point
// equals the sum of the cards' current values. A portfolio with no dated
// data collapses to a single point at today.
export function buildInvestmentTotalSeries(
  holdings: readonly InvestmentHolding[],
  stocks: readonly StockPosition[],
  settings: Settings,
  todayIso: string,
  options: InvestmentValueSeriesOptions,
): SeriesPoint[] {
  const earliest = earliestRelevantDate(holdings, stocks, todayIso);
  const startMonth = isoToMonthNum(earliest ?? todayIso);
  const endMonth = isoToMonthNum(todayIso);
  const points: SeriesPoint[] = [];
  for (let month = startMonth; month <= endMonth; month++) {
    const monthEnd = monthNumToIsoEnd(month);
    const iso = monthEnd < todayIso ? monthEnd : todayIso;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    let total = 0;
    for (const holding of holdings)
      total += holdingContribution(
        holding,
        iso,
        settings,
        options.showNetValue,
      );
    for (const position of stocks)
      total += stockContribution(position, iso, settings, options.showNetValue);
    points.push({ x: ms, y: total });
  }
  return points;
}
