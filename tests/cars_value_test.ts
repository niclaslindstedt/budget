import { describe, expect, it } from "vitest";

import {
  CAR_PURCHASE_SNAPSHOT_ID,
  carContributesToNetWorth,
  carDepreciationToDate,
  carDistanceDriven,
  carNetWorthContribution,
  computeCarCurrentValue,
  currentCarMileage,
  hasLeaseTerms,
  isCarOwned,
  leaseBalanceAt,
  leasedCarEquity,
  leasedCarMarketValue,
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

describe("carDistanceDriven for a car pool", () => {
  const pool = car({
    ownership: "pool",
    expenses: [
      {
        id: "e1",
        date: "2026-01-05",
        amount: 199,
        description: "Fee",
        typeId: "preset-type-car-pool",
      },
      {
        id: "e2",
        date: "2026-01-19",
        amount: 340,
        description: "Trip",
        typeId: "preset-type-car-pool",
        distance: 78,
      },
      {
        id: "e3",
        date: "2026-02-08",
        amount: 210,
        description: "Trip",
        typeId: "preset-type-car-pool",
        distance: 42,
      },
    ],
  });

  it("sums the per-usage distances on or before the date", () => {
    // Both trips counted; the fee (no distance) contributes nothing.
    expect(carDistanceDriven(pool, "2026-03-01")).toBe(78 + 42);
    // Only the first trip has landed by mid-January.
    expect(carDistanceDriven(pool, "2026-01-31")).toBe(78);
  });

  it("ignores odometer snapshots — distance comes from expenses alone", () => {
    // A pool car never gets range snapshots, but even if one leaked in it
    // must not feed the pool distance.
    const withSnapshot = car({
      ownership: "pool",
      snapshots: [{ id: "s", date: "2026-01-01", mileage: 99999 }],
      expenses: [
        {
          id: "e",
          date: "2026-01-10",
          amount: 100,
          description: "Trip",
          typeId: "preset-type-car-pool",
          distance: 12,
        },
      ],
    });
    expect(carDistanceDriven(withSnapshot, "2026-06-01")).toBe(12);
  });

  it("is undefined until a usage carries a distance", () => {
    const noDistance = car({
      ownership: "pool",
      expenses: [
        {
          id: "e",
          date: "2026-01-05",
          amount: 199,
          description: "Fee",
          typeId: "preset-type-car-pool",
        },
      ],
    });
    expect(carDistanceDriven(noDistance, "2026-06-01")).toBeUndefined();
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

// A 3-year lease: 400k at the start, 160k residual at the end, 6%/year.
function leased(over: Partial<Car> = {}): Car {
  return car({
    ownership: "leased",
    leaseStart: "2025-01-01",
    leaseMonths: 36,
    leaseStartValue: 400000,
    leaseEndValue: 160000,
    leaseInterestRate: 6,
    leaseMonthlyCost: 8000,
    ...over,
  });
}

const LEASE_START = "2025-01-01";
const LEASE_MID = "2026-07-01"; // month 18 of 36
const LEASE_END = "2028-01-01"; // month 36

describe("hasLeaseTerms", () => {
  it("needs a leased car with the full term set", () => {
    expect(hasLeaseTerms(leased())).toBe(true);
    expect(hasLeaseTerms(leased({ leaseEndValue: undefined }))).toBe(false);
    expect(hasLeaseTerms(leased({ leaseMonths: undefined }))).toBe(false);
    expect(hasLeaseTerms(leased({ leaseStart: undefined }))).toBe(false);
    // Same numbers but the wrong ownership never model a lease.
    expect(hasLeaseTerms(leased({ ownership: "owned" }))).toBe(false);
  });
});

describe("leaseBalanceAt", () => {
  it("runs from the start value to the residual across the term", () => {
    expect(leaseBalanceAt(leased(), LEASE_START)).toBeCloseTo(400000, 2);
    expect(leaseBalanceAt(leased(), LEASE_END)).toBeCloseTo(160000, 2);
  });

  it("amortises slowly early — mid-term balance is above the linear line", () => {
    // Linear midpoint would be 280 000; interest front-loading keeps the
    // real balance higher.
    const bal = leaseBalanceAt(leased(), LEASE_MID);
    expect(bal).toBeDefined();
    expect(bal as number).toBeGreaterThan(280000);
  });

  it("falls back to straight-line amortisation at 0% interest", () => {
    const flat = leased({ leaseInterestRate: undefined });
    expect(leaseBalanceAt(flat, LEASE_MID)).toBeCloseTo(280000, 2);
  });

  it("is undefined outside the lease window or without terms", () => {
    expect(leaseBalanceAt(leased(), "2024-12-01")).toBeUndefined();
    expect(leaseBalanceAt(leased(), "2028-02-01")).toBeUndefined();
    expect(leaseBalanceAt(leased({ leaseMonths: undefined }), LEASE_MID)).toBe(
      undefined,
    );
  });
});

describe("leasedCarMarketValue", () => {
  it("decays front-loaded from start value to residual", () => {
    expect(leasedCarMarketValue(leased(), LEASE_START)).toBeCloseTo(400000, 2);
    expect(leasedCarMarketValue(leased(), LEASE_END)).toBeCloseTo(160000, 2);
    // Front-loaded: the mid-term value is below the 280 000 linear line.
    const mid = leasedCarMarketValue(leased(), LEASE_MID);
    expect(mid).toBeDefined();
    expect(mid as number).toBeLessThan(280000);
  });
});

describe("leasedCarEquity", () => {
  it("is ~0 at the ends and negative (underwater) in between", () => {
    expect(leasedCarEquity(leased(), LEASE_START)).toBeCloseTo(0, 2);
    expect(leasedCarEquity(leased(), LEASE_END)).toBeCloseTo(0, 2);
    const mid = leasedCarEquity(leased(), LEASE_MID);
    expect(mid).toBeDefined();
    expect(mid as number).toBeLessThan(0);
  });

  it("is undefined outside the term or with incomplete terms", () => {
    expect(leasedCarEquity(leased(), "2024-01-01")).toBeUndefined();
    expect(
      leasedCarEquity(leased({ leaseStartValue: undefined }), LEASE_MID),
    ).toBeUndefined();
  });
});

describe("carContributesToNetWorth / carNetWorthContribution", () => {
  it("counts owned and leased-with-terms cars, not pool or termless leases", () => {
    expect(carContributesToNetWorth(car({ purchasePrice: 100000 }))).toBe(true);
    expect(carContributesToNetWorth(leased())).toBe(true);
    expect(carContributesToNetWorth(car({ ownership: "pool" }))).toBe(false);
    expect(carContributesToNetWorth(leased({ leaseEndValue: undefined }))).toBe(
      false,
    );
  });

  it("scales an owned car's value by its share and returns lease equity", () => {
    const shared = car({
      ownership: "shared",
      purchasePrice: 200000,
      sharePct: 50,
    });
    expect(carNetWorthContribution(shared, "2026-01-01")).toBeCloseTo(
      100000,
      2,
    );
    expect(
      carNetWorthContribution(car({ ownership: "pool" }), "2026-01-01"),
    ).toBe(undefined);
    // Leased contribution equals its lease equity.
    expect(carNetWorthContribution(leased(), LEASE_MID)).toBe(
      leasedCarEquity(leased(), LEASE_MID),
    );
  });
});
