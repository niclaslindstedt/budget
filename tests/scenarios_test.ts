import { describe, expect, it } from "vitest";

import {
  applyScenario,
  diffScenario,
  findBaseBudget,
  isScenarioAddedRowId,
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

  it("rewrites the description cell on a description override", () => {
    const item = baseItem([row("r1", "2026-01-25", "Salary", 30000)]);
    const applied = applyScenario(
      item,
      scenario({ overrides: [{ rowId: "r1", description: "A-kassa" }] }),
    );
    expect(applied.rows[0].cells["c-desc"]).toBe("A-kassa");
    expect(applied.rows[0].cells["c-amount"]).toBe(30000);
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
        { rowId: "r1", amount: 0, description: "No salary" },
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
    expect(override.newDescription).toBe("No salary");
  });

  it("skips overrides and fields that re-state the base values", () => {
    const item = baseItem([
      row("r1", "2026-01-10", "Streaming", -200),
      row("r2", "2026-01-25", "Salary", 30000),
    ]);
    const scn = scenario({
      overrides: [
        // A full no-op (both fields equal the base) emits nothing.
        { rowId: "r1", amount: -200, description: "Streaming" },
        // A mixed override only reports the field that actually differs.
        { rowId: "r2", amount: 0, description: "Salary" },
      ],
    });
    const diff = diffScenario(item, scn);
    expect(diff).toHaveLength(1);
    const override = diff[0];
    if (override.kind !== "override") throw new Error("expected override");
    expect(override.rowId).toBe("r2");
    expect(override.amount).toBe(0);
    expect(override.newDescription).toBeUndefined();
  });
});
