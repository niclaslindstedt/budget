import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type { Car, Loan, UserData } from "../src/data/types";

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

function state(over: Partial<UserData> = {}): UserData {
  return { ...freshUserData(), ...over };
}

describe("car CRUD", () => {
  it("adds, edits and deletes a car", () => {
    const added = reducer(state(), { type: "addCar", car: car() });
    expect(added.cars).toHaveLength(1);

    const edited = reducer(added, {
      type: "updateCar",
      carId: "car-1",
      patch: { name: "Volvo V60", purchasePrice: 189000 },
    });
    expect(edited.cars[0].name).toBe("Volvo V60");
    expect(edited.cars[0].purchasePrice).toBe(189000);

    const deleted = reducer(edited, { type: "deleteCar", carId: "car-1" });
    expect(deleted.cars).toHaveLength(0);
  });

  it("deletes a key when the patch carries an explicit undefined", () => {
    const prev = state({ cars: [car({ purchasePrice: 189000 })] });
    const next = reducer(prev, {
      type: "updateCar",
      carId: "car-1",
      patch: { purchasePrice: undefined },
    });
    expect("purchasePrice" in next.cars[0]).toBe(false);
  });
});

describe("car snapshots", () => {
  it("appends and deletes snapshots", () => {
    const prev = state({ cars: [car()] });
    const added = reducer(prev, {
      type: "addCarSnapshot",
      carId: "car-1",
      snapshot: { id: "s1", date: "2026-03-15", value: 152000, mileage: 26400 },
    });
    expect(added.cars[0].snapshots).toHaveLength(1);
    const deleted = reducer(added, {
      type: "deleteCarSnapshot",
      carId: "car-1",
      snapshotId: "s1",
    });
    expect(deleted.cars[0].snapshots).toHaveLength(0);
  });

  it("import overwrites values but preserves same-date mileage", () => {
    const prev = state({
      cars: [
        car({
          snapshots: [
            { id: "s1", date: "2026-01-01", value: 160000, mileage: 20000 },
            { id: "s2", date: "2026-02-01", mileage: 21000 },
          ],
        }),
      ],
    });
    const next = reducer(prev, {
      type: "importCarSnapshots",
      carId: "car-1",
      points: [
        { date: "2026-01-01", value: -158000 },
        { date: "2026-03-01", value: 150000 },
      ],
    });
    const snapshots = next.cars[0].snapshots;
    expect(snapshots).toHaveLength(3);
    // Same-date snapshot keeps its id + mileage; the value is replaced
    // (magnitude — the importer clamps the sign).
    expect(snapshots[0]).toEqual({
      id: "s1",
      date: "2026-01-01",
      value: 158000,
      mileage: 20000,
    });
    // Untouched mileage-only snapshot survives.
    expect(snapshots[1]).toEqual({
      id: "s2",
      date: "2026-02-01",
      mileage: 21000,
    });
    // New date mints a new value-only snapshot.
    expect(snapshots[2]).toMatchObject({ date: "2026-03-01", value: 150000 });
  });
});

describe("car expenses", () => {
  const linked = {
    id: "e1",
    date: "2026-01-10",
    amount: 700,
    description: "Bensin Tanka",
    typeId: "preset-type-fuel",
    accountId: "acc",
    sourceHistoryId: "h1",
  };

  it("bulk-adds and dedupes on the source entry", () => {
    const prev = state({ cars: [car({ expenses: [linked] })] });
    const next = reducer(prev, {
      type: "addCarExpenses",
      carId: "car-1",
      expenses: [
        { ...linked, id: "e2" }, // same sourceHistoryId — skipped
        {
          id: "e3",
          date: "2026-02-01",
          amount: 60,
          description: "Parkering",
          typeId: "preset-type-parking",
        },
      ],
    });
    expect(next.cars[0].expenses.map((e) => e.id)).toEqual(["e1", "e3"]);
  });

  it("updates and removes an expense", () => {
    const prev = state({ cars: [car({ expenses: [linked] })] });
    const edited = reducer(prev, {
      type: "updateCarExpense",
      carId: "car-1",
      expenseId: "e1",
      patch: { amount: 750 },
    });
    expect(edited.cars[0].expenses[0].amount).toBe(750);
    const removed = reducer(edited, {
      type: "removeCarExpense",
      carId: "car-1",
      expenseId: "e1",
    });
    expect(removed.cars[0].expenses).toHaveLength(0);
  });
});

describe("finder dismiss lists", () => {
  it("persists and clears ignored entries", () => {
    const ignored = reducer(state(), {
      type: "ignoreCarExpenseEntry",
      entryId: "h1",
    });
    expect(ignored.ignoredCarExpenseEntryIds).toEqual(["h1"]);
    // Idempotent — the same id isn't appended twice.
    expect(
      reducer(ignored, { type: "ignoreCarExpenseEntry", entryId: "h1" })
        .ignoredCarExpenseEntryIds,
    ).toEqual(["h1"]);
    const cleared = reducer(ignored, {
      type: "clearIgnoredCarExpenseEntries",
    });
    expect(cleared.ignoredCarExpenseEntryIds).toEqual([]);
  });

  it("normalises and clears exclusion patterns", () => {
    const excluded = reducer(state(), {
      type: "excludeSimilarCarExpenses",
      description: "Parkering P-hus City 0142",
    });
    expect(excluded.carExpenseExclusionPatterns).toHaveLength(1);
    const cleared = reducer(excluded, { type: "clearCarExpenseExclusions" });
    expect(cleared.carExpenseExclusionPatterns).toEqual([]);
  });
});

describe("deleteLoan cascade", () => {
  it("sweeps the loan link off financed cars", () => {
    const loan: Loan = {
      id: "loan-1",
      name: "Car loan",
      kind: "car",
      payments: [],
      balanceHistory: [],
    };
    const prev = state({ loans: [loan], cars: [car({ loanId: "loan-1" })] });
    const next = reducer(prev, { type: "deleteLoan", loanId: "loan-1" });
    expect(next.loans).toHaveLength(0);
    expect(next.cars[0].loanId).toBeUndefined();
  });
});
