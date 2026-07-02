import { normaliseDescription } from "../description-normaliser";
import { newId } from "../sheet";
import { applyPatch } from "./patch";
import type { Action } from "../reducer";
import type { Car, CarSnapshot, UserData } from "../types";

// Rewrite one car by id, leaving the rest of the array untouched.
function updateCarById(
  state: UserData,
  carId: string,
  fn: (car: Car) => Car,
): UserData {
  return {
    ...state,
    cars: state.cars.map((c) => (c.id === carId ? fn(c) : c)),
  };
}

// CRUD for the cars catalog (`UserData.cars`), the value / mileage
// snapshots and linked expenses nested under each car, and the two
// "Find car expenses" dismiss lists. Entirely user-curated — no presets
// — so there's no preset-immutability guard here. `deleteCar` has no
// cascade: a car owns no history buckets; its expenses only *reference*
// bank entries via `sourceHistoryId`, so deleting it simply frees those
// charges back into the finder. (The reverse cascade — a deleted loan
// sweeping `car.loanId` — lives in `reducers/loans.ts` next to
// `deleteLoan`.)
export function reduceCars(state: UserData, action: Action): UserData | null {
  if (action.type === "addCar") {
    return { ...state, cars: [...state.cars, action.car] };
  }
  if (action.type === "updateCar") {
    return updateCarById(state, action.carId, (c) =>
      applyPatch(c, action.patch),
    );
  }
  if (action.type === "deleteCar") {
    return {
      ...state,
      cars: state.cars.filter((c) => c.id !== action.carId),
    };
  }
  if (action.type === "addCarSnapshot") {
    return updateCarById(state, action.carId, (c) => ({
      ...c,
      snapshots: [...c.snapshots, action.snapshot],
    }));
  }
  if (action.type === "deleteCarSnapshot") {
    return updateCarById(state, action.carId, (c) => ({
      ...c,
      snapshots: c.snapshots.filter((s) => s.id !== action.snapshotId),
    }));
  }
  if (action.type === "importCarSnapshots") {
    // Car values are market figures — always a non-negative magnitude.
    // The importer can't feed the odometer column, so a date the import
    // covers overwrites the snapshot's VALUE while any mileage recorded
    // on that date survives (and the id is reused so a re-import is
    // idempotent). `mergeImportedPoints` isn't reusable here precisely
    // because of that partial overwrite.
    return updateCarById(state, action.carId, (c) => {
      const importedByDate = new Map<string, number>();
      for (const pt of action.points)
        importedByDate.set(pt.date, Math.abs(pt.value));
      if (importedByDate.size === 0) return c;
      const next: CarSnapshot[] = [];
      const consumedDates = new Set<string>();
      for (const snapshot of c.snapshots) {
        const value = importedByDate.get(snapshot.date);
        if (value === undefined || consumedDates.has(snapshot.date)) {
          next.push(snapshot);
          continue;
        }
        consumedDates.add(snapshot.date);
        next.push({ ...snapshot, value });
      }
      for (const [date, value] of importedByDate) {
        if (consumedDates.has(date)) continue;
        next.push({ id: newId(), date, value });
      }
      next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      return { ...c, snapshots: next };
    });
  }
  if (action.type === "addCarExpenses") {
    return updateCarById(state, action.carId, (c) => {
      // Defensive dedupe: an expense whose source entry is already
      // attributed to this car (e.g. a double-submitted picker) is
      // silently skipped.
      const consumed = new Set<string>();
      for (const expense of c.expenses) {
        if (expense.sourceHistoryId !== undefined)
          consumed.add(expense.sourceHistoryId);
      }
      const added = action.expenses.filter(
        (e) =>
          e.sourceHistoryId === undefined || !consumed.has(e.sourceHistoryId),
      );
      return { ...c, expenses: [...c.expenses, ...added] };
    });
  }
  if (action.type === "updateCarExpense") {
    return updateCarById(state, action.carId, (c) => ({
      ...c,
      expenses: c.expenses.map((e) =>
        e.id === action.expenseId ? applyPatch(e, action.patch) : e,
      ),
    }));
  }
  if (action.type === "removeCarExpense") {
    return updateCarById(state, action.carId, (c) => ({
      ...c,
      expenses: c.expenses.filter((e) => e.id !== action.expenseId),
    }));
  }
  if (action.type === "ignoreCarExpenseEntry") {
    if (state.ignoredCarExpenseEntryIds.includes(action.entryId)) return state;
    return {
      ...state,
      ignoredCarExpenseEntryIds: [
        ...state.ignoredCarExpenseEntryIds,
        action.entryId,
      ],
    };
  }
  if (action.type === "clearIgnoredCarExpenseEntries") {
    if (state.ignoredCarExpenseEntryIds.length === 0) return state;
    return { ...state, ignoredCarExpenseEntryIds: [] };
  }
  if (action.type === "excludeSimilarCarExpenses") {
    const key = normaliseDescription(action.description);
    if (key === "" || state.carExpenseExclusionPatterns.includes(key))
      return state;
    return {
      ...state,
      carExpenseExclusionPatterns: [...state.carExpenseExclusionPatterns, key],
    };
  }
  if (action.type === "clearCarExpenseExclusions") {
    if (state.carExpenseExclusionPatterns.length === 0) return state;
    return { ...state, carExpenseExclusionPatterns: [] };
  }
  return null;
}
