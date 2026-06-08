import type { Property, PropertyValuePoint } from "../types";

// A property's value over time is its `valueHistory` (manually-recorded
// snapshots) with its purchase folded in as the first value: what the user
// paid (`purchaseAmount`) on the day they bought it (`purchaseDate`) IS the
// property's first recorded value. Rather than store that twice — once as the
// purchase fields, again as a `valueHistory` entry — the purchase point is
// synthesised here, so editing the purchase amount moves it in lockstep and
// the value history is never empty for a property with a dated purchase.

// The id stamped on the synthesised purchase value point. It is NOT a real
// `valueHistory` entry, so the Update value modal renders it read-only — the
// purchase value is owned by the property's `purchaseAmount` / `purchaseDate`,
// changed by editing the property, not by deleting a snapshot.
export const PURCHASE_VALUE_POINT_ID = "purchase";

// Whether a value point is the synthesised purchase point rather than a real,
// user-recorded snapshot.
export function isPurchaseValuePoint(point: PropertyValuePoint): boolean {
  return point.id === PURCHASE_VALUE_POINT_ID;
}

// The value point implied by a property's purchase: `purchaseAmount` at
// `purchaseDate`. Undefined unless both are set — a value point needs a date
// to place it on the timeline.
export function purchaseValuePoint(
  property: Property,
): PropertyValuePoint | undefined {
  if (property.purchaseAmount === undefined || !property.purchaseDate)
    return undefined;
  return {
    id: PURCHASE_VALUE_POINT_ID,
    date: property.purchaseDate,
    value: property.purchaseAmount,
  };
}

// A property's value history with the purchase folded in as the first value.
// The synthesised purchase point is included only when no recorded snapshot
// already sits on the purchase date, so data that stored an explicit
// purchase-date snapshot (older budgets, an imported property) doesn't show it
// twice. Unsorted — callers that render it order it themselves.
export function resolveValueHistory(property: Property): PropertyValuePoint[] {
  const purchase = purchaseValuePoint(property);
  if (!purchase) return property.valueHistory;
  if (property.valueHistory.some((pt) => pt.date === purchase.date))
    return property.valueHistory;
  return [purchase, ...property.valueHistory];
}

// A property's current value — the latest value by date, with the purchase
// folded in (so a freshly-created property shows its purchase price as the
// current value until a newer snapshot lands). Undefined only when there is
// neither a recorded snapshot nor a dated purchase amount.
export function currentPropertyValue(property: Property): number | undefined {
  let latest: { date: string; value: number } | undefined;
  for (const point of resolveValueHistory(property)) {
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
}
