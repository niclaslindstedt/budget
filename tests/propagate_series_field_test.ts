import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { findColumnByType, newId } from "../src/data/sheet";
import { freshUserData } from "../src/storage/local";
import type { AccountBudget, Row, UserData } from "../src/data/types";

// End-to-end coverage for `propagateCellToFuture` through the top-level
// reducer. The point of the refactor it guards is that the propagation
// sweep reuses the same write routing as the live `updateCell` edit:
// the `type` column lands on `row.typeId` (not `cells`), and company —
// which has no backing column — rides its own `field: "company"` path.
// A date edit can't copy verbatim, so it rides `field: "dateShift"`,
// sliding every later occurrence by the same day delta while the anchor
// keeps the exact date the inline edit already wrote.

function item(state: UserData): AccountBudget {
  return state.sheets[0].items[0] as AccountBudget;
}

function colId(state: UserData, type: "date" | "description" | "type"): string {
  return findColumnByType(item(state).columns, type)!.id;
}

// Three consecutive occurrences of one series, oldest first.
function seedSeries(): UserData {
  let state = freshUserData();
  const dateId = colId(state, "date");
  const rows: Row[] = [
    { id: newId(), seriesId: "rent", cells: { [dateId]: "2026-01-15" } },
    { id: newId(), seriesId: "rent", cells: { [dateId]: "2026-02-15" } },
    { id: newId(), seriesId: "rent", cells: { [dateId]: "2026-03-15" } },
  ];
  item(state).rows = rows;
  // Re-pack so `state` reflects the injected rows.
  state = { ...state };
  return state;
}

function rowsOf(state: UserData): Row[] {
  return item(state).rows;
}

describe("propagateCellToFuture", () => {
  it("propagates a description cell to the anchor and later occurrences", () => {
    const state = seedSeries();
    const descId = colId(state, "description");
    const anchor = rowsOf(state)[1]; // Feb
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: descId,
      value: "Rent",
      untilIso: null,
    });
    const out = rowsOf(next);
    expect(out[0].cells[descId]).toBeUndefined(); // Jan untouched
    expect(out[1].cells[descId]).toBe("Rent");
    expect(out[2].cells[descId]).toBe("Rent");
  });

  it("routes a `type` column propagation into row.typeId, not cells", () => {
    const state = seedSeries();
    const typeId = colId(state, "type");
    const anchor = rowsOf(state)[0]; // Jan — sweeps all three
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: typeId,
      value: "type-rent",
      untilIso: null,
    });
    for (const r of rowsOf(next)) {
      expect(r.typeId).toBe("type-rent");
      expect(r.typeIdLocked).toBe(true);
      expect(r.cells[typeId]).toBeUndefined(); // never written to cells
    }
  });

  it("propagates a company assignment via the `company` field", () => {
    const state = seedSeries();
    const anchor = rowsOf(state)[1]; // Feb — sweeps Feb + Mar
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: "",
      value: "company-landlord",
      field: "company",
      untilIso: null,
    });
    const out = rowsOf(next);
    expect(out[0].companyId).toBeUndefined(); // Jan untouched
    expect(out[1].companyId).toBe("company-landlord");
    expect(out[2].companyId).toBe("company-landlord");
  });

  it("clears the company across the sweep when value is null", () => {
    let state = seedSeries();
    for (const r of rowsOf(state)) r.companyId = "company-landlord";
    state = { ...state };
    const anchor = rowsOf(state)[0];
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: "",
      value: null,
      field: "company",
      untilIso: null,
    });
    for (const r of rowsOf(next)) expect(r.companyId).toBeUndefined();
  });

  it("propagates the omit-company flag via the `noCompany` field", () => {
    let state = seedSeries();
    // Every occurrence starts tagged with a company.
    for (const r of rowsOf(state)) r.companyId = "company-landlord";
    state = { ...state };
    const anchor = rowsOf(state)[1]; // Feb — sweeps Feb + Mar
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: "",
      value: true,
      field: "noCompany",
      untilIso: null,
    });
    const out = rowsOf(next);
    // Jan untouched — keeps its company, no omit flag.
    expect(out[0].companyId).toBe("company-landlord");
    expect(out[0].noCompany).toBeUndefined();
    // Feb + Mar gain the omit flag and drop the company (mutually
    // exclusive).
    expect(out[1].noCompany).toBe(true);
    expect(out[1].companyId).toBeUndefined();
    expect(out[2].noCompany).toBe(true);
    expect(out[2].companyId).toBeUndefined();
  });

  it("clears the omit-company flag across the sweep when value is false", () => {
    let state = seedSeries();
    for (const r of rowsOf(state)) r.noCompany = true;
    state = { ...state };
    const anchor = rowsOf(state)[0]; // Jan — sweeps all three
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: "",
      value: false,
      field: "noCompany",
      untilIso: null,
    });
    for (const r of rowsOf(next)) expect(r.noCompany).toBeUndefined();
  });

  it("slides later occurrences by the day delta on a date-shift", () => {
    const state = seedSeries();
    const dateId = colId(state, "date");
    const anchor = rowsOf(state)[1]; // Feb 15
    // The inline edit writes the anchor's new date first …
    const moved = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: dateId,
      value: "2026-02-13",
    });
    // … then the user confirms "apply to all following".
    const next = reducer(moved, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: dateId,
      value: -2,
      field: "dateShift",
      untilIso: null,
    });
    const out = rowsOf(next);
    expect(out[0].cells[dateId]).toBe("2026-01-15"); // Jan untouched
    expect(out[1].cells[dateId]).toBe("2026-02-13"); // anchor keeps exact date
    expect(out[2].cells[dateId]).toBe("2026-03-13"); // Mar slid by −2
  });

  it("clamps the date slide to untilIso", () => {
    const state = seedSeries();
    const dateId = colId(state, "date");
    const anchor = rowsOf(state)[0]; // Jan 15
    const moved = reducer(state, {
      type: "updateCell",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: dateId,
      value: "2026-01-20",
    });
    const next = reducer(moved, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: dateId,
      value: 5,
      field: "dateShift",
      untilIso: "2026-02-28",
    });
    const out = rowsOf(next);
    expect(out[0].cells[dateId]).toBe("2026-01-20"); // anchor keeps exact date
    expect(out[1].cells[dateId]).toBe("2026-02-20"); // Feb slid by +5
    expect(out[2].cells[dateId]).toBe("2026-03-15"); // past the bound, untouched
  });

  it("respects the inclusive untilIso bound", () => {
    const state = seedSeries();
    const descId = colId(state, "description");
    const anchor = rowsOf(state)[0]; // Jan
    const next = reducer(state, {
      type: "propagateCellToFuture",
      sheetId: state.sheets[0].id,
      itemId: item(state).id,
      rowId: anchor.id,
      columnId: descId,
      value: "Rent",
      untilIso: "2026-02-28",
    });
    const out = rowsOf(next);
    expect(out[0].cells[descId]).toBe("Rent");
    expect(out[1].cells[descId]).toBe("Rent");
    expect(out[2].cells[descId]).toBeUndefined(); // Mar past the bound
  });
});
