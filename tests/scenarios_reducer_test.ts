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

  it("stores modulations, drops no-ops, and lets a fixed amount win", () => {
    let state = blob({ scenarios: [scenario()] });
    state = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: { rowId: "r1", modulation: { op: "add", value: 5000 } },
    });
    expect(viewOf(state).scenarios[0].overrides).toEqual([
      { rowId: "r1", modulation: { op: "add", value: 5000 } },
    ]);

    // Fixed amount and modulation are mutually exclusive — fixed wins.
    state = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: {
        rowId: "r1",
        amount: 7,
        modulation: { op: "add", value: 5000 },
      },
    });
    expect(viewOf(state).scenarios[0].overrides).toEqual([
      { rowId: "r1", amount: 7 },
    ]);

    // A no-op modulation (×1) normalises to nothing ⇒ entry removed.
    state = reducer(state, {
      type: "setScenarioOverride",
      ...target,
      scenarioId: "scn-1",
      override: { rowId: "r1", modulation: { op: "multiply", value: 1 } },
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

  describe("propagateScenarioOverrideToFuture", () => {
    // A base budget whose first sheet carries a recurring series
    // (`ser-1`, monthly at -100 except March's -49) plus one
    // out-of-series row, with the scenarios sheet bound to it.
    function seriesBlob(scenarios: Scenario[]): UserData {
      const fresh = freshUserData();
      const budget = fresh.sheets[0];
      const item = budget.items.find((i) => i.type === "accountBudget");
      if (!item) throw new Error("expected accountBudget");
      const colId = (type: string) =>
        item.columns.find((c) => c.type === type)?.id ?? "";
      const mk = (id: string, date: string, amount: number, series = true) => ({
        kind: "user" as const,
        id,
        cells: {
          [colId("date")]: date,
          [colId("description")]: "Spotify",
          [colId("amount")]: amount,
        },
        ...(series ? { seriesId: "ser-1" } : {}),
      });
      const rows = [
        mk("r1", "2026-01-05", -100),
        mk("r2", "2026-02-05", -100),
        mk("r3", "2026-03-05", -49),
        mk("r4", "2026-04-05", -100),
        mk("solo", "2026-02-10", -100, false),
      ];
      return {
        ...fresh,
        sheets: [
          { ...budget, items: [{ ...item, rows }] },
          scenariosSheet({ baseSheetId: budget.id, scenarios }),
        ],
      };
    }

    it("fans an amount override out to the anchor and future series rows", () => {
      const state = reducer(seriesBlob([scenario()]), {
        type: "propagateScenarioOverrideToFuture",
        ...target,
        scenarioId: "scn-1",
        rowId: "r2",
        change: { kind: "amount", amount: -49 },
        untilIso: null,
      });
      // r1 is earlier than the anchor and `solo` is not in the series;
      // r3's base already IS -49 so no no-op override is stored for it.
      expect(viewOf(state).scenarios[0].overrides).toEqual([
        { rowId: "r2", amount: -49 },
        { rowId: "r4", amount: -49 },
      ]);
    });

    it("clamps the sweep to untilIso", () => {
      const state = reducer(seriesBlob([scenario()]), {
        type: "propagateScenarioOverrideToFuture",
        ...target,
        scenarioId: "scn-1",
        rowId: "r1",
        change: { kind: "amount", amount: -120 },
        untilIso: "2026-02-28",
      });
      expect(viewOf(state).scenarios[0].overrides).toEqual([
        { rowId: "r1", amount: -120 },
        { rowId: "r2", amount: -120 },
      ]);
    });

    it("sweeping the base value back clears the existing overrides", () => {
      const state = reducer(
        seriesBlob([
          scenario({
            overrides: [
              { rowId: "r2", amount: -49 },
              { rowId: "r4", amount: -49 },
            ],
          }),
        ]),
        {
          type: "propagateScenarioOverrideToFuture",
          ...target,
          scenarioId: "scn-1",
          rowId: "r2",
          change: { kind: "amount", amount: -100 },
          untilIso: null,
        },
      );
      // r2 / r4 swept back to their own base ⇒ entries removed; r3's
      // base is -49, so -100 is a real change there.
      expect(viewOf(state).scenarios[0].overrides).toEqual([
        { rowId: "r3", amount: -100 },
      ]);
    });

    it("fans a modulation out and displaces fixed amounts on the targets", () => {
      const state = reducer(
        seriesBlob([scenario({ overrides: [{ rowId: "r4", amount: -49 }] })]),
        {
          type: "propagateScenarioOverrideToFuture",
          ...target,
          scenarioId: "scn-1",
          rowId: "r2",
          change: {
            kind: "modulation",
            modulation: { op: "multiply", value: 3 },
          },
          untilIso: null,
        },
      );
      // The same modulation lands on every series row from the anchor
      // on; r4's prior fixed amount is dropped (mutually exclusive).
      expect(viewOf(state).scenarios[0].overrides).toEqual([
        { rowId: "r4", modulation: { op: "multiply", value: 3 } },
        { rowId: "r2", modulation: { op: "multiply", value: 3 } },
        { rowId: "r3", modulation: { op: "multiply", value: 3 } },
      ]);
    });

    it("sweeping a fixed amount displaces existing modulations", () => {
      const state = reducer(
        seriesBlob([
          scenario({
            overrides: [{ rowId: "r2", modulation: { op: "add", value: -20 } }],
          }),
        ]),
        {
          type: "propagateScenarioOverrideToFuture",
          ...target,
          scenarioId: "scn-1",
          rowId: "r2",
          change: { kind: "amount", amount: -77 },
          untilIso: null,
        },
      );
      expect(viewOf(state).scenarios[0].overrides).toEqual([
        { rowId: "r2", amount: -77 },
        { rowId: "r3", amount: -77 },
        { rowId: "r4", amount: -77 },
      ]);
    });

    it("degrades to the anchor for a non-series row; no-ops when unbound", () => {
      const state = reducer(seriesBlob([scenario()]), {
        type: "propagateScenarioOverrideToFuture",
        ...target,
        scenarioId: "scn-1",
        rowId: "solo",
        change: { kind: "amount", amount: -1 },
        untilIso: null,
      });
      expect(viewOf(state).scenarios[0].overrides).toEqual([
        { rowId: "solo", amount: -1 },
      ]);

      const unbound = blob({ scenarios: [scenario()] });
      expect(
        reducer(unbound, {
          type: "propagateScenarioOverrideToFuture",
          ...target,
          scenarioId: "scn-1",
          rowId: "r1",
          change: { kind: "amount", amount: -1 },
          untilIso: null,
        }),
      ).toBe(unbound);
    });
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
