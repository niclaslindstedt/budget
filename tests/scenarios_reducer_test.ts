import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type {
  Scenario,
  ScenariosView,
  Sheet,
  UserData,
} from "../src/data/types";

function scenariosSheet(view: Partial<ScenariosView> = {}): Sheet {
  return {
    id: "sheet-scn",
    name: "Scenarios",
    type: "scenarios",
    glyph: "compass",
    color: "#61afef",
    description: "",
    items: [
      {
        id: "view-1",
        type: "scenariosView",
        baseSheetId: null,
        monitors: [],
        scenarios: [],
        ...view,
      },
    ],
  };
}

function scenario(over: Partial<Scenario> = {}): Scenario {
  return {
    id: "scn-1",
    name: "Lose my job",
    overrides: [],
    addedRows: [],
    ...over,
  };
}

function blob(view: Partial<ScenariosView> = {}): UserData {
  const fresh = freshUserData();
  return { ...fresh, sheets: [...fresh.sheets, scenariosSheet(view)] };
}

function viewOf(state: UserData): ScenariosView {
  const sheet = state.sheets.find((s) => s.id === "sheet-scn");
  const item = sheet?.items[0];
  if (item?.type !== "scenariosView") throw new Error("expected scenariosView");
  return item;
}

const target = { sheetId: "sheet-scn", itemId: "view-1" } as const;

describe("scenarios reducer", () => {
  it("adds, renames, and deletes scenarios", () => {
    let state = blob();
    state = reducer(state, {
      type: "addScenario",
      ...target,
      scenario: scenario(),
    });
    expect(viewOf(state).scenarios).toHaveLength(1);

    state = reducer(state, {
      type: "updateScenario",
      ...target,
      scenarioId: "scn-1",
      patch: { name: "New job" },
    });
    expect(viewOf(state).scenarios[0].name).toBe("New job");

    state = reducer(state, {
      type: "deleteScenario",
      ...target,
      scenarioId: "scn-1",
    });
    expect(viewOf(state).scenarios).toHaveLength(0);
  });

  it("upserts overrides by rowId and removes entries that normalise to nothing", () => {
    let state = blob({ scenarios: [scenario()] });
    state = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: { rowId: "r1", amount: 0 },
    });
    expect(viewOf(state).scenarios[0].overrides).toEqual([
      { rowId: "r1", amount: 0 },
    ]);

    // Upsert replaces in place (no duplicate entries).
    state = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: { rowId: "r1", amount: 500, excluded: true },
    });
    expect(viewOf(state).scenarios[0].overrides).toEqual([
      { rowId: "r1", amount: 500, excluded: true },
    ]);

    // A bare { rowId } normalises to nothing ⇒ the entry is removed
    // (the revert / re-include path).
    state = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: { rowId: "r1" },
    });
    expect(viewOf(state).scenarios[0].overrides).toEqual([]);
  });

  it("returns the same state reference for a redundant override dispatch", () => {
    const state = blob({
      scenarios: [scenario({ overrides: [{ rowId: "r1", amount: 5 }] })],
    });
    const next = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: { rowId: "r1", amount: 5 },
    });
    expect(next).toBe(state);
  });

  it("adds, edits, and deletes scenario-only rows", () => {
    let state = blob({ scenarios: [scenario()] });
    state = reducer(state, {
      type: "addScenarioRow",
      ...target,
      scenarioId: "scn-1",
      row: {
        id: "a1",
        date: "2026-02-25",
        description: "A-kassa",
        amount: 14000,
      },
    });
    expect(viewOf(state).scenarios[0].addedRows).toHaveLength(1);

    state = reducer(state, {
      type: "updateScenarioRow",
      ...target,
      scenarioId: "scn-1",
      rowId: "a1",
      patch: { amount: 15000 },
    });
    expect(viewOf(state).scenarios[0].addedRows[0].amount).toBe(15000);

    state = reducer(state, {
      type: "deleteScenarioRow",
      ...target,
      scenarioId: "scn-1",
      rowId: "a1",
    });
    expect(viewOf(state).scenarios[0].addedRows).toHaveLength(0);
  });

  it("sorts and dedups monitors on set", () => {
    let state = blob();
    state = reducer(state, {
      type: "setScenariosMonitors",
      ...target,
      monitors: ["2026-12-31", "2026-06-30", "2026-12-31", "junk"],
    });
    expect(viewOf(state).monitors).toEqual(["2026-06-30", "2026-12-31"]);
  });

  it("clears every scenario's deltas when the base sheet changes", () => {
    let state = blob({
      baseSheetId: null,
      scenarios: [
        scenario({
          overrides: [{ rowId: "r1", amount: 0 }],
          addedRows: [
            { id: "a1", date: "2026-01-01", description: "X", amount: 1 },
          ],
        }),
      ],
    });
    const budgetSheetId = state.sheets[0].id;
    state = reducer(state, {
      type: "setScenariosBaseSheet",
      ...target,
      baseSheetId: budgetSheetId,
    });
    expect(viewOf(state).baseSheetId).toBe(budgetSheetId);
    expect(viewOf(state).scenarios[0].name).toBe("Lose my job");
    expect(viewOf(state).scenarios[0].overrides).toEqual([]);
    expect(viewOf(state).scenarios[0].addedRows).toEqual([]);
  });

  it("nulls baseSheetId on every scenarios sheet when the base sheet is deleted", () => {
    const fresh = freshUserData();
    const budgetSheetId = fresh.sheets[0].id;
    const state: UserData = {
      ...fresh,
      sheets: [...fresh.sheets, scenariosSheet({ baseSheetId: budgetSheetId })],
    };
    const next = reducer(state, {
      type: "deleteSheet",
      sheetId: budgetSheetId,
    });
    expect(next.sheets).toHaveLength(1);
    expect(viewOf(next).baseSheetId).toBeNull();
  });
});
