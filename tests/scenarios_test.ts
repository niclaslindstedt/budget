import { describe, expect, it } from "vitest";

import {
  applyScenario,
  diffScenario,
  findBaseBudget,
  isNoopModulation,
  isScenarioAddedRowId,
  modulateAmount,
  scenarioAddedRowId,
} from "../src/data/scenarios/apply";
import {
  balanceAtDate,
  buildScenarioChartPoints,
  computeScenarioState,
  epochMsToMonthKey,
  monthKeyToEpochMs,
  monthlyEndBalances,
} from "../src/data/scenarios/series";
import { freshUserData } from "../src/storage/local";
import type {
  AccountBudget,
  Column,
  Scenario,
  Sheet,
  UserRow,
} from "../src/data/types";

const COLUMNS: Column[] = [
  { id: "c-date", type: "date", label: "Date" },
  { id: "c-desc", type: "description", label: "Description" },
  { id: "c-amount", type: "amount", label: "Amount" },
  { id: "c-bal", type: "balance", label: "Balance" },
];

function row(
  id: string,
  date: string,
  description: string,
  amount: number,
  extra: Partial<UserRow> = {},
): UserRow {
  return {
    kind: "user",
    id,
    cells: { "c-date": date, "c-desc": description, "c-amount": amount },
    ...extra,
  };
}

function baseItem(rows: UserRow[]): AccountBudget {
  return {
    id: "item-base",
    type: "accountBudget",
    accountId: null,
    columns: COLUMNS,
    rows,
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

function compute(item: AccountBudget, scn: Scenario | null, opening = 1000) {
  const data = freshUserData();
  return computeScenarioState({
    baseItem: item,
    scenario: scn,
    openingBalance: opening,
    data,
    settings: data.settings,
    history: [],
    typesById: new Map(),
    synthesizedRows: [],
  });
}

describe("applyScenario", () => {
  it("returns the base untouched for the baseline and for an empty scenario", () => {
    const item = baseItem([row("r1", "2026-01-10", "Rent", -8000)]);
    expect(applyScenario(item, null)).toBe(item);
    expect(applyScenario(item, scenario())).toBe(item);
  });

  it("rewrites the amount cell and strips the formula on an amount override", () => {
    const item = baseItem([
      row("r1", "2026-01-25", "Salary", 30000, { amountFormula: "income" }),
    ]);
    const applied = applyScenario(
      item,
      scenario({ overrides: [{ rowId: "r1", amount: 0 }] }),
    );
    expect(applied.rows[0].cells["c-amount"]).toBe(0);
    expect(applied.rows[0].amountFormula).toBeUndefined();
    // The base is never mutated.
    expect(item.rows[0].cells["c-amount"]).toBe(30000);
    expect(item.rows[0].amountFormula).toBe("income");
  });

  it("rewrites the amount cell from the base amount on a modulation", () => {
    const item = baseItem([
      row("r1", "2026-01-25", "Salary", 30000),
      row("r2", "2026-01-10", "Gas", -500),
      row("r3", "2026-01-12", "Rent", -8000),
    ]);
    const applied = applyScenario(
      item,
      scenario({
        overrides: [
          { rowId: "r1", modulation: { op: "add", value: 5000 } },
          { rowId: "r2", modulation: { op: "percent", value: 300 } },
          { rowId: "r3", modulation: { op: "multiply", value: 1.5 } },
        ],
      }),
    );
    expect(applied.rows[0].cells["c-amount"]).toBe(35000);
    expect(applied.rows[1].cells["c-amount"]).toBe(-2000);
    expect(applied.rows[2].cells["c-amount"]).toBe(-12000);
    // The base is never mutated — a later base edit re-modulates.
    expect(item.rows[0].cells["c-amount"]).toBe(30000);
    const raised = baseItem([row("r1", "2026-01-25", "Salary", 32000)]);
    const reapplied = applyScenario(
      raised,
      scenario({
        overrides: [{ rowId: "r1", modulation: { op: "add", value: 5000 } }],
      }),
    );
    expect(reapplied.rows[0].cells["c-amount"]).toBe(37000);
  });

  it("leaves formula rows alone on a modulation — the static cell is not the real amount", () => {
    const item = baseItem([
      row("r1", "2026-01-25", "Salary", 30000, { amountFormula: "income" }),
    ]);
    const applied = applyScenario(
      item,
      scenario({
        overrides: [{ rowId: "r1", modulation: { op: "multiply", value: 2 } }],
      }),
    );
    expect(applied.rows[0].cells["c-amount"]).toBe(30000);
    expect(applied.rows[0].amountFormula).toBe("income");
  });

  it("keeps an excluded row in place but zeroes its amount", () => {
    const item = baseItem([
      row("r1", "2026-01-10", "Streaming", -200),
      row("r2", "2026-01-12", "Food", -3000),
    ]);
    const applied = applyScenario(
      item,
      scenario({ overrides: [{ rowId: "r1", excluded: true }] }),
    );
    expect(applied.rows).toHaveLength(2);
    expect(applied.rows[0].id).toBe("r1");
    expect(applied.rows[0].cells["c-amount"]).toBe(0);
    expect(applied.rows[1].cells["c-amount"]).toBe(-3000);
  });

  it("appends added rows with deterministic scn: ids and the standard cell trio", () => {
    const item = baseItem([row("r1", "2026-01-25", "Salary", 30000)]);
    const applied = applyScenario(
      item,
      scenario({
        addedRows: [
          {
            id: "a1",
            date: "2026-02-25",
            description: "A-kassa",
            amount: 14000,
          },
        ],
      }),
    );
    expect(applied.rows).toHaveLength(2);
    const added = applied.rows[1];
    expect(added.id).toBe(scenarioAddedRowId("a1"));
    expect(isScenarioAddedRowId(added.id)).toBe(true);
    expect(added.kind).toBe("user");
    expect(added.cells).toEqual({
      "c-date": "2026-02-25",
      "c-desc": "A-kassa",
      "c-amount": 14000,
    });
    // Two applications mint the same ids — stable across recomputes.
    const again = applyScenario(
      item,
      scenario({
        addedRows: [
          {
            id: "a1",
            date: "2026-02-25",
            description: "A-kassa",
            amount: 14000,
          },
        ],
      }),
    );
    expect(again.rows[1].id).toBe(added.id);
  });

  it("carries a recurring added row's seriesId onto the clone", () => {
    const item = baseItem([row("r1", "2026-01-25", "Salary", 30000)]);
    const applied = applyScenario(
      item,
      scenario({
        addedRows: [
          {
            id: "a1",
            date: "2026-02-01",
            description: "Gym",
            amount: -400,
            seriesId: "ser-1",
          },
          { id: "a2", date: "2026-03-01", description: "One-off", amount: -1 },
        ],
      }),
    );
    expect(applied.rows[1].seriesId).toBe("ser-1");
    expect(applied.rows[2].seriesId).toBeUndefined();
  });

  it("ignores overrides whose base row no longer exists", () => {
    const item = baseItem([row("r1", "2026-01-10", "Rent", -8000)]);
    const applied = applyScenario(
      item,
      scenario({ overrides: [{ rowId: "gone", amount: 1 }] }),
    );
    expect(applied.rows).toHaveLength(1);
    expect(applied.rows[0].cells["c-amount"]).toBe(-8000);
  });
});

describe("modulateAmount", () => {
  it("applies the three ops and rounds to cents", () => {
    expect(modulateAmount(30000, { op: "add", value: 5000 })).toBe(35000);
    expect(modulateAmount(-500, { op: "multiply", value: 3 })).toBe(-1500);
    expect(modulateAmount(-500, { op: "percent", value: 300 })).toBe(-2000);
    expect(modulateAmount(-500, { op: "percent", value: -50 })).toBe(-250);
    expect(modulateAmount(-333, { op: "multiply", value: 1.333 })).toBe(
      -443.89,
    );
  });

  it("knows which modulations cannot change anything", () => {
    expect(isNoopModulation({ op: "multiply", value: 1 })).toBe(true);
    expect(isNoopModulation({ op: "add", value: 0 })).toBe(true);
    expect(isNoopModulation({ op: "percent", value: 0 })).toBe(true);
    expect(isNoopModulation({ op: "multiply", value: 0 })).toBe(false);
    expect(isNoopModulation({ op: "add", value: -1 })).toBe(false);
  });
});

describe("findBaseBudget", () => {
  it("resolves the first accountBudget item of the bound sheet", () => {
    const item = baseItem([]);
    const sheets: Sheet[] = [
      {
        id: "s1",
        name: "Budget",
        type: "budget",
        glyph: "wallet",
        color: "#aaa",
        description: "",
        items: [item],
      },
    ];
    expect(findBaseBudget(sheets, "s1")?.item).toBe(item);
    expect(findBaseBudget(sheets, null)).toBeNull();
    expect(findBaseBudget(sheets, "missing")).toBeNull();
  });
});

describe("monthlyEndBalances", () => {
  it("reports the last running balance of each fiscal month", () => {
    const item = baseItem([
      row("r1", "2026-01-25", "Salary", 30000),
      row("r2", "2026-01-27", "Rent", -8000),
      row("r3", "2026-02-25", "Salary", 30000),
    ]);
    const balances = monthlyEndBalances(compute(item, null));
    expect(balances.get("2026-01")).toBe(1000 + 30000 - 8000);
    expect(balances.get("2026-02")).toBe(1000 + 30000 - 8000 + 30000);
  });

  it("reflects scenario overrides and exclusions in the balances", () => {
    const item = baseItem([
      row("r1", "2026-01-25", "Salary", 30000),
      row("r2", "2026-01-27", "Rent", -8000),
    ]);
    const scn = scenario({
      overrides: [
        { rowId: "r1", amount: 0 },
        { rowId: "r2", excluded: true },
      ],
      addedRows: [
        { id: "a1", date: "2026-01-28", description: "A-kassa", amount: 14000 },
      ],
    });
    const balances = monthlyEndBalances(compute(item, scn));
    expect(balances.get("2026-01")).toBe(1000 + 0 - 0 + 14000);
  });

  it("groups by fiscal month when startOfMonth is not 1", () => {
    const item = baseItem([
      row("r1", "2026-01-24", "Late in old month", -100),
      row("r2", "2026-01-26", "Early in new month", -200),
    ]);
    const data = freshUserData();
    const state = computeScenarioState({
      baseItem: item,
      scenario: null,
      openingBalance: 1000,
      data,
      settings: { ...data.settings, startOfMonth: 25 },
      history: [],
      typesById: new Map(),
      synthesizedRows: [],
    });
    const balances = monthlyEndBalances(state);
    // Day 24 belongs to the previous fiscal month; day 26 to January's.
    expect(balances.get("2025-12")).toBe(900);
    expect(balances.get("2026-01")).toBe(700);
  });
});

describe("buildScenarioChartPoints", () => {
  it("aligns variants on a shared month axis with carry-forward fill", () => {
    const byVariant = new Map<string, Map<string, number>>([
      [
        "baseline",
        new Map([
          ["2026-01", 1500],
          ["2026-03", 1800],
        ]),
      ],
      ["scn-1", new Map([["2026-02", 400]])],
    ]);
    const points = buildScenarioChartPoints(byVariant, 1000);
    const baseline = points.get("baseline")!;
    expect(baseline.map((p) => p.y)).toEqual([1500, 1500, 1800]);
    expect(baseline.map((p) => epochMsToMonthKey(p.x))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    // Months before the variant's first data point sit at the opening
    // balance; later empty months carry forward.
    const scn = points.get("scn-1")!;
    expect(scn.map((p) => p.y)).toEqual([1000, 400, 400]);
  });

  it("returns empty point lists when no variant has any month", () => {
    const points = buildScenarioChartPoints(
      new Map([["baseline", new Map<string, number>()]]),
      1000,
    );
    expect(points.get("baseline")).toEqual([]);
  });

  it("pins the axis to an explicit range, seeding from pre-range months", () => {
    const byVariant = new Map<string, Map<string, number>>([
      [
        "baseline",
        new Map([
          ["2025-11", 700],
          ["2026-01", 1500],
        ]),
      ],
      ["scn-1", new Map<string, number>()],
    ]);
    const points = buildScenarioChartPoints(byVariant, 1000, {
      from: "2026-01",
      to: "2026-03",
    });
    const baseline = points.get("baseline")!;
    expect(baseline.map((p) => epochMsToMonthKey(p.x))).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    // Months past the last dated row carry the final balance forward.
    expect(baseline.map((p) => p.y)).toEqual([1500, 1500, 1500]);
    // A variant with no data flatlines at the opening balance across
    // the pinned range instead of coming back empty.
    expect(points.get("scn-1")!.map((p) => p.y)).toEqual([1000, 1000, 1000]);
  });

  it("seeds a range starting after the data with the latest prior balance", () => {
    const byVariant = new Map<string, Map<string, number>>([
      [
        "baseline",
        new Map([
          ["2025-11", 700],
          ["2026-01", 1500],
        ]),
      ],
    ]);
    const points = buildScenarioChartPoints(byVariant, 1000, {
      from: "2026-02",
      to: "2026-03",
    });
    expect(points.get("baseline")!.map((p) => p.y)).toEqual([1500, 1500]);
  });

  it("round-trips month keys through epoch ms", () => {
    expect(epochMsToMonthKey(monthKeyToEpochMs("2026-12"))).toBe("2026-12");
    expect(epochMsToMonthKey(monthKeyToEpochMs("2027-01"))).toBe("2027-01");
  });
});

describe("balanceAtDate", () => {
  const item = baseItem([
    row("r1", "2026-01-25", "Salary", 30000),
    row("r2", "2026-02-01", "Rent", -8000),
  ]);

  it("returns the opening balance before the first row", () => {
    expect(balanceAtDate(compute(item, null), "2026-01-01", 1000)).toBe(1000);
  });

  it("is inclusive of rows dated on the monitor date", () => {
    expect(balanceAtDate(compute(item, null), "2026-01-25", 1000)).toBe(31000);
  });

  it("returns the final balance after the last row", () => {
    expect(balanceAtDate(compute(item, null), "2026-12-31", 1000)).toBe(23000);
  });
});

describe("diffScenario", () => {
  it("emits override, excluded, and added entries sorted by date", () => {
    const item = baseItem([
      row("r1", "2026-03-25", "Salary", 30000),
      row("r2", "2026-01-10", "Streaming", -200),
    ]);
    const scn = scenario({
      overrides: [
        { rowId: "r1", amount: 0 },
        { rowId: "r2", excluded: true },
        { rowId: "gone", amount: 5 },
      ],
      addedRows: [
        { id: "a1", date: "2026-02-25", description: "A-kassa", amount: 14000 },
      ],
    });
    const diff = diffScenario(item, scn);
    expect(diff.map((e) => e.kind)).toEqual(["excluded", "added", "override"]);
    const excluded = diff[0];
    if (excluded.kind !== "excluded") throw new Error("expected excluded");
    expect(excluded.description).toBe("Streaming");
    expect(excluded.baseAmount).toBe(-200);
    const override = diff[2];
    if (override.kind !== "override") throw new Error("expected override");
    expect(override.baseAmount).toBe(30000);
    expect(override.amount).toBe(0);
  });

  it("computes a modulated entry's new amount and carries the modulation", () => {
    const item = baseItem([row("r1", "2026-01-10", "Gas", -500)]);
    const scn = scenario({
      overrides: [{ rowId: "r1", modulation: { op: "percent", value: 300 } }],
    });
    const diff = diffScenario(item, scn);
    expect(diff).toHaveLength(1);
    const override = diff[0];
    if (override.kind !== "override") throw new Error("expected override");
    expect(override.baseAmount).toBe(-500);
    expect(override.amount).toBe(-2000);
    expect(override.modulation).toEqual({ op: "percent", value: 300 });
  });

  it("skips overrides that re-state the base values", () => {
    const item = baseItem([
      row("r1", "2026-01-10", "Streaming", -200),
      row("r2", "2026-01-25", "Salary", 30000),
      // A modulation on a zero base can be a no-op too (×n of 0).
      row("r3", "2026-01-30", "Placeholder", 0),
    ]);
    const scn = scenario({
      overrides: [
        // An amount equal to the base emits nothing.
        { rowId: "r1", amount: -200 },
        { rowId: "r2", amount: 0 },
        { rowId: "r3", modulation: { op: "multiply", value: 3 } },
      ],
    });
    const diff = diffScenario(item, scn);
    expect(diff).toHaveLength(1);
    const override = diff[0];
    if (override.kind !== "override") throw new Error("expected override");
    expect(override.rowId).toBe("r2");
    expect(override.amount).toBe(0);
  });
});
