import { depreciatedValue } from "../items/value";
import type { Car, CarSnapshot } from "../types";

// Pure value / mileage math for the Cars sheet. No React, no network —
// runs locally so the Cars page and the net-worth roll-up read a single
// current-value figure per car. Mirrors the items catalog's value model
// (`computeItemCurrentValue`), with the odometer axis alongside.

// The id stamped on the synthesised purchase snapshot. It is NOT a real
// `snapshots` entry, so the Update value modal renders it read-only —
// the purchase figures are owned by the car's `purchasePrice` /
// `purchaseMileage` / `purchaseDate`, changed by editing the car, not by
// deleting a snapshot. Mirrors the item / property value models.
export const CAR_PURCHASE_SNAPSHOT_ID = "purchase";

// Whether a snapshot is the synthesised purchase point rather than a
// real, user-recorded one.
export function isCarPurchaseSnapshot(snapshot: CarSnapshot): boolean {
  return snapshot.id === CAR_PURCHASE_SNAPSHOT_ID;
}

// The snapshot implied by a car's purchase: `purchasePrice` and/or
// `purchaseMileage` at `purchaseDate`. Undefined unless the date and at
// least one figure are set — a snapshot needs a date to place it on the
// timeline and a figure to be worth showing.
export function carPurchaseSnapshot(car: Car): CarSnapshot | undefined {
  if (!car.purchaseDate) return undefined;
  if (car.purchasePrice === undefined && car.purchaseMileage === undefined)
    return undefined;
  return {
    id: CAR_PURCHASE_SNAPSHOT_ID,
    date: car.purchaseDate,
    ...(car.purchasePrice === undefined ? {} : { value: car.purchasePrice }),
    ...(car.purchaseMileage === undefined
      ? {}
      : { mileage: car.purchaseMileage }),
  };
}

// A car's snapshot history with the purchase folded in as the first
// point, for display in the Update value modal and the value chart. The
// synthesised purchase point is included only when no recorded snapshot
// already sits on the purchase date. Unsorted — callers that render it
// order it themselves. Mirrors `resolveItemValueHistory`.
export function resolveCarSnapshots(car: Car): CarSnapshot[] {
  const recorded = car.snapshots;
  const purchase = carPurchaseSnapshot(car);
  if (!purchase) return recorded;
  if (recorded.some((s) => s.date === purchase.date)) return recorded;
  return [purchase, ...recorded];
}

// The latest user-recorded value on or before `iso`, or undefined when
// none has landed yet. Scans only the stored `snapshots` — the
// synthesised purchase point is deliberately NOT considered here, so a
// car with a depreciation curve keeps decaying until the user records
// an explicit value (otherwise the folded purchase point would
// short-circuit the curve from day one).
function latestRecordedValueAt(car: Car, iso: string): number | undefined {
  let latest: CarSnapshot | undefined;
  for (const snapshot of car.snapshots) {
    if (snapshot.value === undefined) continue;
    if (snapshot.date > iso) continue;
    if (!latest || snapshot.date > latest.date) latest = snapshot;
  }
  return latest?.value;
}

// Whether a car still counts as owned capital — i.e. the user holds a
// stake in it ("owned" / "shared") and hasn't sold it. Leased and
// car-pool cars are pure running cost; they never contribute value.
export function isCarOwned(car: Car): boolean {
  if (car.ownership !== "owned" && car.ownership !== "shared") return false;
  return car.soldAt === undefined && car.soldFor === undefined;
}

// The car's estimated value at `iso`, in the user's currency units.
//
// Resolution order, most-authoritative first (mirrors
// `computeItemCurrentValue`):
//   1. A leased / car-pool car has no value of the user's — undefined.
//   2. A sold car is worth its proceeds (0 when none were recorded).
//   3. The latest recorded value snapshot on or before the date — the
//      user's own market lookup wins over any computed figure.
//   4. A depreciation rule decays the purchase price from
//      `purchaseDate`, never below its floor.
//   5. Otherwise the purchase price stands (no decay).
//   6. With none of the above, the car has no known value: undefined.
export function computeCarCurrentValue(
  car: Car,
  iso: string,
): number | undefined {
  if (car.ownership === "leased" || car.ownership === "pool") return undefined;
  if (car.soldAt !== undefined || car.soldFor !== undefined) {
    return car.soldFor ?? 0;
  }

  const recorded = latestRecordedValueAt(car, iso);
  if (recorded !== undefined) return recorded;

  const base = car.purchasePrice;
  if (base === undefined) return undefined;

  if (car.depreciation && car.purchaseDate !== undefined) {
    return depreciatedValue(base, car.depreciation, car.purchaseDate, iso);
  }

  return base;
}

// Value lost since purchase as of `iso` — the depreciation leg of the
// cost view. Purchase price minus the resolved current value, clamped
// at 0 so an appreciating snapshot never turns the leg into income.
// Undefined without a purchase price or a resolvable value (leased /
// pool cars in particular).
export function carDepreciationToDate(
  car: Car,
  iso: string,
): number | undefined {
  if (car.purchasePrice === undefined) return undefined;
  const value = computeCarCurrentValue(car, iso);
  if (value === undefined) return undefined;
  return Math.max(0, car.purchasePrice - value);
}

// The latest known odometer reading on or before `iso` — the latest
// recorded mileage snapshot, falling back to the purchase reading.
// Undefined when the user has never recorded any.
export function currentCarMileage(car: Car, iso: string): number | undefined {
  let latest: CarSnapshot | undefined;
  for (const snapshot of car.snapshots) {
    if (snapshot.mileage === undefined) continue;
    if (snapshot.date > iso) continue;
    if (!latest || snapshot.date > latest.date) latest = snapshot;
  }
  if (latest?.mileage !== undefined) return latest.mileage;
  return car.purchaseMileage;
}

// Distance driven by the user as of `iso`: the latest odometer reading
// minus the reading at purchase (0 when unrecorded — a car bought new).
// Clamped at 0 so a corrected-downward odometer never goes negative.
// Undefined without any recorded mileage snapshot — the purchase
// reading alone says nothing about distance driven since.
export function carDistanceDriven(car: Car, iso: string): number | undefined {
  const hasRecorded = car.snapshots.some(
    (s) => s.mileage !== undefined && s.date <= iso,
  );
  if (!hasRecorded) return undefined;
  const current = currentCarMileage(car, iso);
  if (current === undefined) return undefined;
  return Math.max(0, current - (car.purchaseMileage ?? 0));
}
