import { describe, expect, it } from "vitest";

import {
  budgetEditEntryFullModalReducer,
  initialEditFullState,
  type EditFullState,
} from "../src/components/budget/budget-edit-entry-full-modal-reducer";
import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";
import type { Column, Row, SeriesMetadata } from "../src/data/types";

const DATE_COL: Column = {
  id: "c-date",
  type: "date",
  label: "Date",
  width: 100,
};
const DESC_COL: Column = {
  id: "c-desc",
  type: "description",
  label: "Description",
  width: 200,
};
const AMOUNT_COL: Column = {
  id: "c-amount",
  type: "amount",
  label: "Amount",
  width: 100,
};
const COMPLETED_COL: Column = {
  id: "c-completed",
  type: "completed",
  label: "Completed",
  width: 50,
};
const COLUMNS: Column[] = [DATE_COL, DESC_COL, AMOUNT_COL, COMPLETED_COL];

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    kind: "user",
    id: "r1",
    cells: {
      [DATE_COL.id]: "2026-03-15",
      [DESC_COL.id]: "Rent",
      [AMOUNT_COL.id]: -1500,
      [COMPLETED_COL.id]: false,
    },
    typeId: "t-rent",
    companyId: "co-1",
    isTransfer: false,
    ...overrides,
  };
}

describe("initialEditFullState", () => {
  it("snapshots a typical row into the initial state", () => {
    const state = initialEditFullState(
      makeRow(),
      COLUMNS,
      DEFAULT_SETTINGS,
      undefined,
      null,
    );
    expect(state.description).toBe("Rent");
    expect(state.amount).not.toBe("");
    expect(state.negative).toBe(true);
    expect(state.date).toBe("2026-03-15");
    expect(state.typeId).toBe("t-rent");
    expect(state.companyId).toBe("co-1");
    expect(state.isTransfer).toBe(false);
    expect(state.completed).toBe(false);
    expect(state.isPrimaryIncome).toBe(false);
    expect(state.anchorDayText).toBe("25");
    expect(state.scopeKind).toBe("just-this");
    expect(state.untilEnabled).toBe(false);
    expect(state.untilDate).toBe("2026-03-15");
    expect(state.shiftDaysText).toBe("0");
  });

  it("seeds `untilDate` from `lastSeriesDate` when provided", () => {
    const state = initialEditFullState(
      makeRow(),
      COLUMNS,
      DEFAULT_SETTINGS,
      undefined,
      "2026-12-31",
    );
    expect(state.untilDate).toBe("2026-12-31");
  });

  it("defaults a positive amount's sign toggle to positive", () => {
    const state = initialEditFullState(
      makeRow({ cells: { ...makeRow().cells, [AMOUNT_COL.id]: 1200 } }),
      COLUMNS,
      DEFAULT_SETTINGS,
      undefined,
      null,
    );
    expect(state.negative).toBe(false);
  });

  it("falls back to defaults when row is null", () => {
    const state = initialEditFullState(
      null,
      COLUMNS,
      DEFAULT_SETTINGS,
      undefined,
      null,
    );
    expect(state.description).toBe("");
    expect(state.amount).toBe("");
    expect(state.negative).toBe(true);
    expect(state.date).toBe("");
    expect(state.typeId).toBeNull();
    expect(state.companyId).toBeNull();
    expect(state.isTransfer).toBe(false);
    expect(state.completed).toBe(false);
  });

  it("seeds primary-income state from `seriesMetadata`", () => {
    const meta: SeriesMetadata = {
      seriesId: "s1",
      isPrimaryIncome: true,
      anchorDayOfMonth: 28,
    };
    const state = initialEditFullState(
      makeRow({ seriesId: "s1" }),
      COLUMNS,
      DEFAULT_SETTINGS,
      meta,
      null,
    );
    expect(state.isPrimaryIncome).toBe(true);
    expect(state.anchorDayText).toBe("28");
  });
});

function makeInitial(): EditFullState {
  return initialEditFullState(
    makeRow(),
    COLUMNS,
    DEFAULT_SETTINGS,
    undefined,
    null,
  );
}

describe("budgetEditEntryFullModalReducer", () => {
  it("replaces the whole slice atomically on `reset`", () => {
    const init = makeInitial();
    const next: EditFullState = {
      ...init,
      description: "Groceries",
      amount: "250",
      negative: false,
      date: "2026-04-01",
      scopeKind: "all",
    };
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "reset",
      state: next,
    });
    expect(after).toEqual(next);
  });

  it("flips the sign on `toggleNegative`", () => {
    const init = makeInitial();
    expect(init.negative).toBe(true);
    const flipped = budgetEditEntryFullModalReducer(init, {
      kind: "toggleNegative",
    });
    expect(flipped.negative).toBe(false);
    const back = budgetEditEntryFullModalReducer(flipped, {
      kind: "toggleNegative",
    });
    expect(back.negative).toBe(true);
  });

  it("updates one field without disturbing the others", () => {
    const init = makeInitial();
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "setDescription",
      value: "Renamed",
    });
    expect(after.description).toBe("Renamed");
    expect(after.amount).toBe(init.amount);
    expect(after.date).toBe(init.date);
    expect(after.typeId).toBe(init.typeId);
    expect(after.companyId).toBe(init.companyId);
  });

  it("`pickCompany` with an `autoTypeId` updates both companyId and typeId atomically", () => {
    const init: EditFullState = { ...makeInitial(), typeId: null };
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "pickCompany",
      companyId: "co-2",
      autoTypeId: "t-auto",
    });
    expect(after.companyId).toBe("co-2");
    expect(after.typeId).toBe("t-auto");
  });

  it("`pickCompany` with an undefined `autoTypeId` leaves typeId alone", () => {
    const init: EditFullState = { ...makeInitial(), typeId: "t-locked" };
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "pickCompany",
      companyId: "co-2",
      autoTypeId: undefined,
    });
    expect(after.companyId).toBe("co-2");
    expect(after.typeId).toBe("t-locked");
  });

  it("`pickCompany` clearing the company does not touch the typeId", () => {
    const init: EditFullState = { ...makeInitial(), typeId: "t-existing" };
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "pickCompany",
      companyId: null,
      autoTypeId: undefined,
    });
    expect(after.companyId).toBeNull();
    expect(after.typeId).toBe("t-existing");
  });

  it("`setScopeKind` switches the scope and leaves until-state intact", () => {
    const init: EditFullState = {
      ...makeInitial(),
      scopeKind: "just-this",
      untilEnabled: true,
      untilDate: "2026-08-01",
    };
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "setScopeKind",
      value: "future",
    });
    expect(after.scopeKind).toBe("future");
    expect(after.untilEnabled).toBe(true);
    expect(after.untilDate).toBe("2026-08-01");
  });

  it("`setShiftDaysText` accepts arbitrary user input (including transient `-`)", () => {
    const init = makeInitial();
    const after = budgetEditEntryFullModalReducer(init, {
      kind: "setShiftDaysText",
      value: "-",
    });
    expect(after.shiftDaysText).toBe("-");
  });
});
