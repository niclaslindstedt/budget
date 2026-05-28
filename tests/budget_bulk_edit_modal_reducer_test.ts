import { describe, expect, it } from "vitest";

import type { Settings } from "../src/data/types";
import {
  budgetBulkEditModalReducer,
  initialBulkEditState,
  type BulkEditSeed,
  type BulkEditState,
} from "../src/components/budget/budget-bulk-edit-modal-reducer";

const SETTINGS = {
  decimalSeparator: ".",
  thousandSeparator: ",",
} as unknown as Settings;

function seed(overrides: Partial<BulkEditSeed> = {}): BulkEditSeed {
  return {
    seedDate: "2026-03-15",
    sharedAmount: null,
    settings: SETTINGS,
    ...overrides,
  };
}

function makeInitial(overrides: Partial<BulkEditSeed> = {}): BulkEditState {
  return initialBulkEditState(seed(overrides));
}

describe("initialBulkEditState", () => {
  it("starts with every field disabled and seeds the date from the seed", () => {
    const state = makeInitial();
    expect(state.typeEnabled).toBe(false);
    expect(state.typeId).toBeNull();
    expect(state.dateEnabled).toBe(false);
    expect(state.dateValue).toBe("2026-03-15");
    expect(state.amountEnabled).toBe(false);
    expect(state.amountText).toBe("");
    expect(state.transferEnabled).toBe(false);
    expect(state.transferValue).toBe(true);
    expect(state.recurringEnabled).toBe(false);
    expect(state.recurringDates).toEqual([]);
    expect(state.recurrenceResetKey).toBe(0);
  });

  it("leaves dateValue blank when no seed date is supplied", () => {
    expect(makeInitial({ seedDate: "" }).dateValue).toBe("");
  });

  it("seeds the amount text from a positive shared amount", () => {
    expect(makeInitial({ sharedAmount: 1234.5 }).amountText).toBe("1234.5");
  });

  it("seeds the amount text with a leading minus for a negative shared amount", () => {
    expect(makeInitial({ sharedAmount: -1234.5 }).amountText).toBe("-1234.5");
  });
});

describe("budgetBulkEditModalReducer", () => {
  it("re-seeds on reset and increments recurrenceResetKey monotonically", () => {
    let state = makeInitial();
    state = budgetBulkEditModalReducer(state, {
      kind: "setTypeEnabled",
      value: true,
    });
    state = budgetBulkEditModalReducer(state, {
      kind: "setRecurringDates",
      value: ["2026-04-01"],
    });

    state = budgetBulkEditModalReducer(state, {
      kind: "reset",
      seed: seed({ seedDate: "2026-06-01", sharedAmount: 500 }),
    });
    expect(state.typeEnabled).toBe(false);
    expect(state.recurringDates).toEqual([]);
    expect(state.dateValue).toBe("2026-06-01");
    expect(state.amountText).toBe("500");
    expect(state.recurrenceResetKey).toBe(1);

    state = budgetBulkEditModalReducer(state, { kind: "reset", seed: seed() });
    expect(state.recurrenceResetKey).toBe(2);
  });

  it("updates only the targeted field for each setter", () => {
    const base = makeInitial();
    expect(
      budgetBulkEditModalReducer(base, { kind: "setTypeId", value: "t1" }),
    ).toMatchObject({ ...base, typeId: "t1" });
    expect(
      budgetBulkEditModalReducer(base, {
        kind: "setDateValue",
        value: "2026-09-09",
      }),
    ).toMatchObject({ ...base, dateValue: "2026-09-09" });
    expect(
      budgetBulkEditModalReducer(base, {
        kind: "setAmountText",
        value: "42",
      }),
    ).toMatchObject({ ...base, amountText: "42" });
    expect(
      budgetBulkEditModalReducer(base, {
        kind: "setTransferValue",
        value: false,
      }),
    ).toMatchObject({ ...base, transferValue: false });
    expect(
      budgetBulkEditModalReducer(base, {
        kind: "setRecurringDates",
        value: ["2026-01-01"],
      }),
    ).toMatchObject({ ...base, recurringDates: ["2026-01-01"] });
  });
});
