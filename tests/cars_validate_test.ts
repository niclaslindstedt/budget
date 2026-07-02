import { describe, expect, it } from "vitest";

import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { Car, Loan, UserData } from "../src/data/types";

function car(over: Partial<Car> = {}): Car {
  return {
    id: "car-1",
    name: "Volvo",
    ownership: "owned",
    purchaseDate: "2024-08-12",
    purchasePrice: 189000,
    purchaseMileage: 3200,
    depreciation: {
      method: "accelerated",
      initialDrop: 10,
      firstYearRate: 12,
      ratePerYear: 9,
      floor: 25000,
    },
    snapshots: [
      { id: "s1", date: "2025-08-12", mileage: 17800 },
      { id: "s2", date: "2026-03-15", value: 152000, mileage: 26400 },
    ],
    expenses: [
      {
        id: "e1",
        date: "2026-01-10",
        amount: 700,
        description: "Bensin Tanka",
        typeId: "preset-type-fuel",
        accountId: "acc",
        sourceHistoryId: "h1",
      },
    ],
    ...over,
  };
}

function blob(cars: unknown[], over: Partial<UserData> = {}): UserData {
  return { ...freshUserData(), cars: cars as Car[], ...over };
}

describe("validateCar via validateUserData", () => {
  it("round-trips a fully populated car", () => {
    const data = blob([
      car({ glyph: "car", color: "#e06c75", description: "V60 -21" }),
    ]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.cars).toEqual(data.cars);
  });

  it("rejects an unknown ownership and duplicate ids", () => {
    expect(
      validateUserData(blob([car({ ownership: "borrowed" as never })])).ok,
    ).toBe(false);
    expect(validateUserData(blob([car(), car()])).ok).toBe(false);
  });

  it("sweeps a dangling loanId but keeps a resolvable one", () => {
    const r1 = validateUserData(blob([car({ loanId: "gone" })]));
    expect(r1.ok && r1.value.cars[0].loanId).toBeFalsy();

    const loan: Loan = {
      id: "loan-1",
      name: "Car loan",
      kind: "car",
      payments: [],
      balanceHistory: [],
    };
    const r2 = validateUserData(
      blob([car({ loanId: "loan-1" })], { loans: [loan] }),
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.cars[0].loanId).toBe("loan-1");
  });

  it("round-trips a leased car's terms and drops malformed ones", () => {
    const r = validateUserData(
      blob([
        car({
          id: "lease-1",
          ownership: "leased",
          purchaseDate: undefined,
          purchasePrice: undefined,
          purchaseMileage: undefined,
          depreciation: undefined,
          leaseStart: "2025-01-01",
          leaseMonths: 36,
          leaseMonthlyCost: 8000,
          leaseInterestRate: 6,
          leaseStartValue: 400000,
          leaseEndValue: 160000,
        }),
        car({
          id: "lease-2",
          ownership: "leased",
          purchaseDate: undefined,
          purchasePrice: undefined,
          purchaseMileage: undefined,
          depreciation: undefined,
          // A non-positive term is meaningless — dropped.
          leaseMonths: 0 as never,
          leaseStartValue: -1 as never,
        }),
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const [a, b] = r.value.cars;
      expect(a.leaseStart).toBe("2025-01-01");
      expect(a.leaseMonths).toBe(36);
      expect(a.leaseMonthlyCost).toBe(8000);
      expect(a.leaseInterestRate).toBe(6);
      expect(a.leaseStartValue).toBe(400000);
      expect(a.leaseEndValue).toBe(160000);
      expect(b.leaseMonths).toBeUndefined();
      expect(b.leaseStartValue).toBeUndefined();
    }
  });

  it("drops sharePct outside the exclusive (0, 100) range", () => {
    const r = validateUserData(
      blob([
        car({ id: "c1", sharePct: 50 }),
        car({ id: "c2", sharePct: 100 }),
        car({ id: "c3", sharePct: 0 }),
        car({ id: "c4", sharePct: Number.NaN }),
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cars[0].sharePct).toBe(50);
      expect(r.value.cars[1].sharePct).toBeUndefined();
      expect(r.value.cars[2].sharePct).toBeUndefined();
      expect(r.value.cars[3].sharePct).toBeUndefined();
    }
  });

  it("drops snapshots with neither value nor mileage", () => {
    const r = validateUserData(
      blob([
        car({
          snapshots: [
            { id: "s1", date: "2026-01-01" },
            { id: "s2", date: "2026-02-01", value: 150000 },
          ] as Car["snapshots"],
        }),
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cars[0].snapshots).toHaveLength(1);
      expect(r.value.cars[0].snapshots[0].id).toBe("s2");
    }
  });

  it("degrades a half-linked expense to a manual one", () => {
    const r = validateUserData(
      blob([
        car({
          expenses: [
            {
              id: "e1",
              date: "2026-01-10",
              amount: 700,
              description: "Fuel",
              typeId: "preset-type-fuel",
              accountId: "acc",
              // sourceHistoryId missing — the pair is both-or-neither.
            },
          ] as Car["expenses"],
        }),
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.cars[0].expenses[0].accountId).toBeUndefined();
      expect(r.value.cars[0].expenses[0].sourceHistoryId).toBeUndefined();
    }
  });

  it("drops a malformed depreciation rule whole", () => {
    const r = validateUserData(
      blob([
        car({
          depreciation: {
            method: "accelerated",
            initialDrop: Number.NaN,
            firstYearRate: 12,
            ratePerYear: 9,
          },
        }),
      ]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cars[0].depreciation).toBeUndefined();
  });
});
