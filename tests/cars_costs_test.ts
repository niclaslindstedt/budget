import { describe, expect, it } from "vitest";

import {
  carCostBreakdown,
  carCostPerDistance,
  carExpenseKey,
  carMonthlyCosts,
  carTotalCostOfOwnership,
} from "../src/data/cars/costs";
import { isoToMonthNum } from "../src/utils/date";
import type { Car, CarExpense, Loan } from "../src/data/types";

function expense(over: Partial<CarExpense> = {}): CarExpense {
  return {
    id: "e-1",
    date: "2026-01-10",
    amount: 700,
    description: "Fuel",
    typeId: "preset-type-fuel",
    ...over,
  };
}

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

describe("carExpenseKey", () => {
  it("keys transaction-backed expenses and skips manual ones", () => {
    expect(
      carExpenseKey(expense({ accountId: "acc", sourceHistoryId: "h1" })),
    ).toBe("acc:h1");
    expect(carExpenseKey(expense())).toBeUndefined();
  });
});

describe("carCostBreakdown / carMonthlyCosts", () => {
  const c = car({
    expenses: [
      expense({ id: "e1", date: "2026-01-10", amount: 700 }),
      expense({ id: "e2", date: "2026-01-20", amount: 300 }),
      expense({
        id: "e3",
        date: "2026-02-03",
        amount: 429,
        typeId: "preset-type-car-insurance",
      }),
    ],
  });

  it("sums per type across the range", () => {
    const totals = carCostBreakdown(c);
    expect(totals.get("preset-type-fuel")).toBe(1000);
    expect(totals.get("preset-type-car-insurance")).toBe(429);
    // Range bounds are inclusive.
    const january = carCostBreakdown(c, "2026-01-01", "2026-01-31");
    expect(january.get("preset-type-fuel")).toBe(1000);
    expect(january.has("preset-type-car-insurance")).toBe(false);
  });

  it("buckets month → type → total", () => {
    const months = carMonthlyCosts(c);
    const jan = months.get(isoToMonthNum("2026-01-01"));
    const feb = months.get(isoToMonthNum("2026-02-01"));
    expect(jan?.get("preset-type-fuel")).toBe(1000);
    expect(feb?.get("preset-type-car-insurance")).toBe(429);
  });
});

describe("carTotalCostOfOwnership", () => {
  const c = car({
    purchaseDate: "2025-01-01",
    purchasePrice: 200000,
    snapshots: [{ id: "s1", date: "2026-01-01", value: 170000 }],
    expenses: [
      expense({ id: "e1", date: "2025-06-10", amount: 700 }),
      expense({ id: "e2", date: "2026-05-20", amount: 300 }),
    ],
  });

  it("keeps the three legs separate", () => {
    const legs = carTotalCostOfOwnership(c, undefined, "2026-06-01");
    expect(legs.expenses).toBe(1000);
    expect(legs.depreciation).toBe(30000);
    // No linked loan ⇒ the leg is unknown, not 0.
    expect(legs.loanInterest).toBeUndefined();
  });

  it("only counts expenses up to the asked date", () => {
    const legs = carTotalCostOfOwnership(c, undefined, "2025-12-31");
    expect(legs.expenses).toBe(700);
  });

  it("accrues interest through the linked loan", () => {
    const loan: Loan = {
      id: "loan-1",
      name: "Car loan",
      kind: "car",
      startDate: "2026-01-01",
      startSum: 120000,
      rate: 6,
      payments: [],
      balanceHistory: [],
    };
    const legs = carTotalCostOfOwnership(c, loan, "2026-04-01");
    // Three months of 0.5%/month on a balance with no payments:
    // 120000 * (1.005^3 - 1) ≈ 1809.
    expect(legs.loanInterest).toBeCloseTo(120000 * (1.005 ** 3 - 1), 0);
  });

  it("reports interest as unknown when the loan lacks a rate", () => {
    const loan: Loan = {
      id: "loan-1",
      name: "Car loan",
      kind: "car",
      startSum: 120000,
      payments: [],
      balanceHistory: [],
    };
    const legs = carTotalCostOfOwnership(c, loan, "2026-04-01");
    expect(legs.loanInterest).toBeUndefined();
  });
});

describe("carCostPerDistance", () => {
  it("divides the known legs by the distance driven", () => {
    const c = car({
      purchaseDate: "2025-01-01",
      purchasePrice: 200000,
      purchaseMileage: 1000,
      snapshots: [
        { id: "s1", date: "2026-01-01", value: 170000, mileage: 21000 },
      ],
      expenses: [expense({ id: "e1", date: "2025-06-10", amount: 10000 })],
    });
    // (10000 expenses + 30000 depreciation) / 20000 km = 2 per km.
    expect(carCostPerDistance(c, undefined, "2026-06-01")).toBe(2);
  });

  it("is undefined without odometer data", () => {
    const c = car({
      purchasePrice: 200000,
      expenses: [expense()],
    });
    expect(carCostPerDistance(c, undefined, "2026-06-01")).toBeUndefined();
  });

  it("uses summed per-usage distance for a car pool", () => {
    const pool = car({
      ownership: "pool",
      expenses: [
        expense({ id: "e1", amount: 199, typeId: "preset-type-car-pool" }),
        expense({
          id: "e2",
          date: "2026-01-19",
          amount: 340,
          typeId: "preset-type-car-pool",
          distance: 78,
        }),
        expense({
          id: "e3",
          date: "2026-02-08",
          amount: 210,
          typeId: "preset-type-car-pool",
          distance: 42,
        }),
      ],
    });
    // No depreciation leg for a pool car — expenses (199+340+210 = 749)
    // over the summed distance (78+42 = 120).
    expect(carCostPerDistance(pool, undefined, "2026-06-01")).toBeCloseTo(
      749 / 120,
    );
  });
});
