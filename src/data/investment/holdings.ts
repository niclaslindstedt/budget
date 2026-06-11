import { computeInvestmentNetValue } from "../tax/engine";
import type {
  InvestmentHolding,
  InvestmentValuePoint,
  InvestmentWrapper,
  TaxLocation,
} from "../types";
import type { InvestmentTaxTreatment } from "../tax/types";

// A holding's value over time is its `valueHistory` (manually-recorded
// snapshots) with its purchase folded in as the first value: what the
// user paid (`purchaseAmount`) on the day they bought it (`purchaseDate`)
// IS the holding's first recorded value. Mirrors the property value
// model — the purchase point is synthesised so editing the purchase
// amount moves it in lockstep and the history is never empty for a dated
// purchase.

// The id stamped on the synthesised purchase value point. It is NOT a
// real `valueHistory` entry, so the Update value modal renders it
// read-only — the purchase value is owned by the holding's
// `purchaseAmount` / `purchaseDate`, changed by editing the holding.
export const HOLDING_PURCHASE_VALUE_POINT_ID = "purchase";

export function isHoldingPurchaseValuePoint(
  point: InvestmentValuePoint,
): boolean {
  return point.id === HOLDING_PURCHASE_VALUE_POINT_ID;
}

// The value point implied by a holding's purchase: `purchaseAmount` at
// `purchaseDate`. Undefined unless both are set — a value point needs a
// date to place it on the timeline.
export function holdingPurchaseValuePoint(
  holding: InvestmentHolding,
): InvestmentValuePoint | undefined {
  if (holding.purchaseAmount === undefined || !holding.purchaseDate)
    return undefined;
  return {
    id: HOLDING_PURCHASE_VALUE_POINT_ID,
    date: holding.purchaseDate,
    value: holding.purchaseAmount,
  };
}

// A holding's value history with the purchase folded in as the first
// value. The synthesised purchase point is included only when no recorded
// snapshot already sits on the purchase date. Unsorted — callers that
// render it order it themselves.
export function resolveHoldingValueHistory(
  holding: InvestmentHolding,
): InvestmentValuePoint[] {
  const purchase = holdingPurchaseValuePoint(holding);
  if (!purchase) return holding.valueHistory;
  if (holding.valueHistory.some((pt) => pt.date === purchase.date))
    return holding.valueHistory;
  return [purchase, ...holding.valueHistory];
}

// A holding's market value at `iso` — the latest value on or before that
// date, with the purchase folded in. Undefined when nothing is recorded
// on or before the date (and there's no dated purchase before it).
export function holdingValueAt(
  holding: InvestmentHolding,
  iso: string,
): number | undefined {
  let latest: { date: string; value: number } | undefined;
  for (const point of resolveHoldingValueHistory(holding)) {
    if (point.date > iso) continue;
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
}

// A holding's current market value — the latest value by date, with the
// purchase folded in. Undefined only when there is neither a recorded
// snapshot nor a dated purchase amount.
export function currentHoldingValue(
  holding: InvestmentHolding,
): number | undefined {
  let latest: { date: string; value: number } | undefined;
  for (const point of resolveHoldingValueHistory(holding)) {
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
}

// Which tax treatment a holding's wrapper maps to. Holdings are always
// privately held, so a depå wrapper is the private capital-gains case;
// ISK / KF carry no sale tax.
export function holdingTaxTreatment(
  wrapper: InvestmentWrapper,
): InvestmentTaxTreatment {
  switch (wrapper) {
    case "isk":
      return "isk";
    case "kf":
      return "kf";
    case "depot":
      return "depot-private";
  }
}

// A holding's net value if sold today (or at `value`) — the market value
// less the wrapper's sale tax. ISK / KF return the full value; a depå
// subtracts 30 % of the gain over the cost basis.
export function holdingNetValue(
  holding: InvestmentHolding,
  value: number,
  location: TaxLocation,
): number {
  return computeInvestmentNetValue(location, {
    treatment: holdingTaxTreatment(holding.wrapper),
    value,
    costBasis: holding.purchaseAmount ?? 0,
  }).netValue;
}
