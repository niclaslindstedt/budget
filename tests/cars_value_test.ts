import { describe, expect, it } from "vitest";

import {
  CAR_PURCHASE_SNAPSHOT_ID,
  carDepreciationToDate,
  carDistanceDriven,
  computeCarCurrentValue,
  currentCarMileage,
  isCarOwned,
  resolveCarSnapshots,
} from "../src/data/cars/value";
import type { Car } from "../src/data/types";

function car(over: Partial<Car> = {}): Car {
  return {
    id: "car-1",
    name: "Volvo",
    ownership: "owned",
    snapshots: [],
    expenses: [],
    ...over,
  };
}

describe("computeCarCurrentValue", () => {
  it("returns undefined for leased and pool cars", () => {
    expect(
      computeCarCurrentValue(
        car({ ownership: "leased", purchasePrice: 100000 }),
        "2026-01-01",
      ),
    ).toBeUndefined();
    expect(
      computeCarCurrentValue(car({ ownership: "pool" }), "2026-01-01"),
    ).toBeUndefined();
  });

  it("returns the sale proceeds for a sold car", () => {
    const sold = car({
      purchasePrice: 100000,
      soldAt: "2025-06-01",
      soldFor: 80000,
    });
    expect(computeCarCurrentValue(sold, "2026-01-01")).toBe(80000);
    // Sold date alone (no proceeds recorded) counts as 0.
    expect(
      computeCarCurrentValue(
        car({ purchasePrice: 100000, soldAt: "2025-06-01" }),
        "2026-01-01",
      ),
    ).toBe(0);
  });

  it("lets the latest recorded value snapshot win over the curve", () => {
    const c = car({
      purchaseDate: "2024-01-01",
      purchasePrice: 200000,
      depreciation: { method: "percentPerYear", ratePerYear: 20 },
      snapshots: [
        { id: "s1", date: "2025-01-01", value: 170000 },
        { id: "s2", date: "2025-06-01", value: 160000 },
      ],
    });
    expect(computeCarCurrentValue(c, "2026-01-01")).toBe(160000);
    // Before any snapshot landed, the curve applies (one year at 20%).
    expect(computeCarCurrentValue(c, "2024-12-31")).toBeCloseTo(
      200000 * 0.8,
      -2,
    );
  });

  it("ignores mileage-only snapshots when resolving value", () => {
    const c = car({
      purchaseDate: "2024-01-01",
      purchasePrice: 100000,
      snapshots: [{ id: "s1", date: "2025-01-01", mileage: 15000 }],
    });
    // No value snapshot and no curve — the purchase price stands.
    expect(computeCarCurrentValue(c, "2026-01-01")).toBe(100000);
  });

  it("applies the depreciation floor", () => {
    const c = car({
      purchaseDate: "2000-01-01",
      purchasePrice: 100000,
      depreciation: { method: "percentPerYear", ratePerYear: 50, floor: 9000 },
    });
    expect(computeCarCurrentValue(c, "2026-01-01")).toBe(9000);
  });

  it("returns undefined without a purchase price or snapshot", () => {
    expect(computeCarCurrentValue(car(), "2026-01-01")).toBeUndefined();
  });
});

describe("carDepreciationToDate", () => {
  it("is purchase price minus resolved value, clamped at zero", () => {
    const c = car({
      purchaseDate: "2024-01-01",
      purchasePrice: 200000,
      snapshots: [{ id: "s1", date: "2025-01-01", value: 150000 }],
    });
    expect(carDepreciationToDate(c, "2026-01-01")).toBe(50000);
    // An appreciating snapshot never turns the leg negative.
    const up = car({
      purchaseDate: "2024-01-01",
      purchasePrice: 200000,
      snapshots: [{ id: "s1", date: "2025-01-01", value: 230000 }],
    });
    expect(carDepreciationToDate(up, "2026-01-01")).toBe(0);
  });

  it("is undefined for a leased car", () => {
    expect(
      carDepreciationToDate(car({ ownership: "leased" }), "2026-01-01"),
    ).toBeUndefined();
  });
});

describe("mileage", () => {
  const c = car({
    purchaseDate: "2024-08-12",
    purchasePrice: 189000,
    purchaseMileage: 3200,
    snapshots: [
      { id: "s1", date: "2025-08-12", mileage: 17800 },
      { id: "s2", date: "2026-03-15", value: 152000, mileage: 26400 },
    ],
  });

  it("resolves the latest recorded reading at a date", () => {
    expect(currentCarMileage(c, "2026-06-01")).toBe(26400);
    expect(currentCarMileage(c, "2025-12-01")).toBe(17800);
    // Before any snapshot, the purchase reading stands.
    expect(currentCarMileage(c, "2024-12-01")).toBe(3200);
  });

  it("computes distance driven from the purchase baseline", () => {
    expect(carDistanceDriven(c, "2026-06-01")).toBe(26400 - 3200);
  });

  it("is undefined without any recorded mileage snapshot", () => {
    const bare = car({ purchaseMileage: 3200 });
    expect(carDistanceDriven(bare, "2026-06-01")).toBeUndefined();
  });
});

describe("resolveCarSnapshots", () => {
  it("folds the purchase in as a synthesised read-only point", () => {
    const c = car({
      purchaseDate: "2024-08-12",
      purchasePrice: 189000,
      purchaseMileage: 3200,
      snapshots: [{ id: "s1", date: "2026-03-15", value: 152000 }],
    });
    const resolved = resolveCarSnapshots(c);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({
      id: CAR_PURCHASE_SNAPSHOT_ID,
      date: "2024-08-12",
      value: 189000,
      mileage: 3200,
    });
  });

  it("omits the purchase point when a snapshot sits on its date", () => {
    const c = car({
      purchaseDate: "2024-08-12",
      purchasePrice: 189000,
      snapshots: [{ id: "s1", date: "2024-08-12", value: 185000 }],
    });
    expect(resolveCarSnapshots(c)).toHaveLength(1);
  });
});

describe("isCarOwned", () => {
  it("counts owned and shared cars until sold", () => {
    expect(isCarOwned(car())).toBe(true);
    expect(isCarOwned(car({ ownership: "shared" }))).toBe(true);
    expect(isCarOwned(car({ soldAt: "2025-01-01" }))).toBe(false);
    expect(isCarOwned(car({ soldFor: 50000 }))).toBe(false);
    expect(isCarOwned(car({ ownership: "leased" }))).toBe(false);
    expect(isCarOwned(car({ ownership: "pool" }))).toBe(false);
  });
});
