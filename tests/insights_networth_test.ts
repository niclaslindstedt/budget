import { describe, expect, it } from "vitest";

import {
  buildNetWorthCategorySeries,
  buildNetWorthSeries,
  computeNetWorthSnapshot,
  type NetWorthCategory,
} from "../src/data/insights/networth";
import { freshUserData } from "../src/storage/local";
import type {
  InsightsNetWorthSettings,
  Loan,
  Property,
  UserData,
} from "../src/data/types";

const TODAY = "2026-06-11";

function property(over: Partial<Property> = {}): Property {
  return {
    id: "prop-1",
    name: "Villa",
    valueHistory: [{ id: "pv1", date: "2026-01-10", value: 3_000_000 }],
    mortgages: [
      {
        id: "m-1",
        name: "Mortgage 1",
        // No amortization terms, so `balanceAt` holds this flat at any
        // date — keeps the expected figures exact.
        currentBalance: 1_000_000,
        payments: [],
      },
    ],
    repairs: [],
    files: [],
    ...over,
  };
}

function standaloneLoan(over: Partial<Loan> = {}): Loan {
  return {
    id: "loan-1",
    name: "Car loan",
    kind: "car",
    startDate: "2026-02-01",
    startSum: 120_000,
    payments: [],
    balanceHistory: [],
    ...over,
  };
}

function linkedLoan(over: Partial<Loan> = {}): Loan {
  return {
    id: "loan-link",
    name: "Villa mortgage",
    kind: "mortgage",
    propertyId: "prop-1",
    mortgageIds: ["m-1"],
    payments: [],
    balanceHistory: [],
    ...over,
  };
}

function workspace(over: Partial<UserData> = {}): UserData {
  return {
    ...freshUserData(),
    accounts: [{ id: "acc-1", name: "Checking", openingBalance: 1_000 }],
    savings: [
      {
        id: "sav-1",
        kind: "savings",
        name: "Buffer",
        balanceHistory: [
          { id: "sb1", date: "2026-01-15", value: 100 },
          { id: "sb2", date: "2026-03-10", value: 200 },
        ],
      },
    ],
    items: [
      {
        id: "item-1",
        name: "Laptop",
        purchasePrice: 500,
        acquiredAt: "2026-04-15",
      },
    ],
    properties: [property()],
    loans: [standaloneLoan(), linkedLoan()],
    ...over,
  };
}

describe("computeNetWorthSnapshot", () => {
  it("sums assets minus liabilities with default settings", () => {
    const snap = computeNetWorthSnapshot(workspace(), undefined, TODAY);
    expect(snap.perCategory).toEqual({
      accounts: 1_000,
      savings: 200,
      items: 500,
      investments: 0,
      properties: 3_000_000,
      mortgages: -1_000_000,
      loans: -120_000,
    });
    expect(snap.total).toBe(1_000 + 200 + 500 + 3_000_000 - 1_120_000);
  });

  it("never double-counts a linked mortgage loan", () => {
    const snap = computeNetWorthSnapshot(workspace(), undefined, TODAY);
    // The linked loan gets no entity row — its property governs — and
    // the mortgage bucket carries the debt exactly once.
    expect(snap.entities.some((e) => e.id === "loan-link")).toBe(false);
    expect(snap.entities.some((e) => e.id === "loan-1")).toBe(true);
    expect(snap.perCategory.mortgages).toBe(-1_000_000);
  });

  it("still counts an unlinked mortgage-kind loan", () => {
    const data = workspace({
      loans: [
        standaloneLoan({
          id: "loan-2",
          kind: "mortgage",
          startSum: 80_000,
          startDate: "2026-01-01",
        }),
      ],
    });
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    expect(snap.perCategory.loans).toBe(-80_000);
  });

  it("drops an excluded entity from the totals", () => {
    const settings: InsightsNetWorthSettings = {
      overrides: { "acc-1": { excluded: true } },
    };
    const snap = computeNetWorthSnapshot(workspace(), settings, TODAY);
    expect(snap.perCategory.accounts).toBe(0);
    const entity = snap.entities.find((e) => e.id === "acc-1");
    expect(entity?.excluded).toBe(true);
    expect(entity?.effective).toBe(0);
    // The gross figure survives so the settings modal can still show it.
    expect(entity?.gross).toBe(1_000);
  });

  it("applies a property's share to its value AND its mortgages", () => {
    const settings: InsightsNetWorthSettings = {
      overrides: { "prop-1": { sharePct: 50 } },
    };
    const snap = computeNetWorthSnapshot(workspace(), settings, TODAY);
    expect(snap.perCategory.properties).toBe(1_500_000);
    expect(snap.perCategory.mortgages).toBe(-500_000);
    const entity = snap.entities.find((e) => e.id === "prop-1");
    expect(entity?.effective).toBe(1_000_000);
    expect(entity?.liabilityGross).toBe(1_000_000);
  });

  it("applies shares to accounts and loans", () => {
    const settings: InsightsNetWorthSettings = {
      overrides: {
        "acc-1": { sharePct: 50 },
        "loan-1": { sharePct: 25 },
      },
    };
    const snap = computeNetWorthSnapshot(workspace(), settings, TODAY);
    expect(snap.perCategory.accounts).toBe(500);
    expect(snap.perCategory.loans).toBe(-30_000);
  });

  it("treats unknown values as zero-contribution but keeps the row", () => {
    const data = workspace({
      savings: [
        { id: "sav-1", kind: "savings", name: "Buffer", balanceHistory: [] },
      ],
      properties: [property({ valueHistory: [], mortgages: [] })],
    });
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    const saving = snap.entities.find((e) => e.id === "sav-1");
    expect(saving?.gross).toBeNull();
    expect(saving?.effective).toBe(0);
    const prop = snap.entities.find((e) => e.id === "prop-1");
    expect(prop?.gross).toBeNull();
    expect(prop?.liabilityGross).toBeUndefined();
    expect(snap.perCategory.savings).toBe(0);
    expect(snap.perCategory.properties).toBe(0);
  });

  it("skips disposed items", () => {
    const data = workspace({
      items: [
        { id: "item-1", name: "Laptop", purchasePrice: 500 },
        {
          id: "item-2",
          name: "Old phone",
          purchasePrice: 300,
          disposedAt: "2026-01-01",
          soldFor: 100,
        },
      ],
    });
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    expect(snap.entities.some((e) => e.id === "item-2")).toBe(false);
    expect(snap.perCategory.items).toBe(500);
  });

  it("skips a property sold by today, debt and all", () => {
    const data = workspace({
      properties: [property({ soldDate: "2026-05-01", soldAmount: 3_100_000 })],
    });
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    // The sold property gets no breakdown row; its value AND its mortgage
    // debt are gone (the proceeds are cash the accounts already count).
    expect(snap.entities.some((e) => e.id === "prop-1")).toBe(false);
    expect(snap.perCategory.properties).toBe(0);
    expect(snap.perCategory.mortgages).toBe(0);
    expect(snap.total).toBe(1_000 + 200 + 500 - 120_000);
  });

  it("keeps a property whose sale date is still ahead", () => {
    const data = workspace({
      properties: [property({ soldDate: "2026-12-31" })],
    });
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    expect(snap.perCategory.properties).toBe(3_000_000);
    expect(snap.perCategory.mortgages).toBe(-1_000_000);
  });
});

describe("buildNetWorthSeries", () => {
  it("samples monthly from the earliest dated data through today", () => {
    const data = workspace();
    const points = buildNetWorthSeries(data, undefined, TODAY);
    // Earliest relevant date is the property value point (2026-01-10),
    // so the window is Jan..Jun = 6 monthly samples.
    expect(points).toHaveLength(6);
    // Saving: 100 until March, then 200. Item enters at its April
    // acquisition; the loan at its February start date. Account /
    // property / mortgage figures are flat across the window.
    const base = 1_000 + 3_000_000 - 1_000_000;
    expect(points.map((p) => p.y)).toEqual([
      base + 100,
      base + 100 - 120_000,
      base + 200 - 120_000,
      base + 200 + 500 - 120_000,
      base + 200 + 500 - 120_000,
      base + 200 + 500 - 120_000,
    ]);
  });

  it("ends exactly at the snapshot total", () => {
    const data = workspace();
    const points = buildNetWorthSeries(data, undefined, TODAY);
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    expect(points[points.length - 1].x).toBe(Date.parse(TODAY));
    expect(points[points.length - 1].y).toBe(snap.total);
  });

  it("respects exclusions and shares", () => {
    const settings: InsightsNetWorthSettings = {
      overrides: {
        "acc-1": { excluded: true },
        "prop-1": { sharePct: 50 },
      },
    };
    const data = workspace();
    const points = buildNetWorthSeries(data, settings, TODAY);
    const snap = computeNetWorthSnapshot(data, settings, TODAY);
    expect(points[points.length - 1].y).toBe(snap.total);
    expect(snap.total).toBe(200 + 500 + 1_500_000 - 500_000 - 120_000);
  });

  it("keeps a property's mortgage out of samples before its first value", () => {
    const data = workspace({
      items: [],
      loans: [],
      properties: [
        property({
          valueHistory: [{ id: "pv1", date: "2026-03-01", value: 3_000_000 }],
        }),
      ],
    });
    const points = buildNetWorthSeries(data, undefined, TODAY);
    // Window opens at the saving's January point; the property AND its
    // mortgage both enter at the March value point — the mortgage never
    // weighs on a sample its asset hasn't reached.
    expect(points.map((p) => p.y)).toEqual([
      1_000 + 100,
      1_000 + 100,
      1_000 + 200 + 3_000_000 - 1_000_000,
      1_000 + 200 + 3_000_000 - 1_000_000,
      1_000 + 200 + 3_000_000 - 1_000_000,
      1_000 + 200 + 3_000_000 - 1_000_000,
    ]);
  });

  it("drops a sold property's value and debt from the sale date", () => {
    const data = workspace({
      items: [],
      loans: [],
      properties: [property({ soldDate: "2026-04-15" })],
    });
    const points = buildNetWorthSeries(data, undefined, TODAY);
    // The window still opens at the sold property's January value point —
    // its history stays on the chart. The property and its mortgage
    // contribute while owned (Jan–Mar) and vanish from the April sample
    // on, since the month-end sample falls after the mid-April sale.
    const owned = 1_000 + 3_000_000 - 1_000_000;
    expect(points.map((p) => p.y)).toEqual([
      owned + 100,
      owned + 100,
      owned + 200,
      1_000 + 200,
      1_000 + 200,
      1_000 + 200,
    ]);
  });

  it("collapses to a single point at today with no dated data", () => {
    const data = workspace({
      accounts: [{ id: "acc-1", name: "Checking", openingBalance: 1_000 }],
      savings: [],
      items: [],
      properties: [],
      loans: [],
      history: {},
      transfers: [],
    });
    const points = buildNetWorthSeries(data, undefined, TODAY);
    expect(points).toHaveLength(1);
    expect(points[0].y).toBe(1_000);
  });
});

describe("buildNetWorthCategorySeries", () => {
  const CATEGORIES: readonly NetWorthCategory[] = [
    "accounts",
    "savings",
    "items",
    "investments",
    "properties",
    "mortgages",
    "loans",
  ];

  it("returns one band per category over the shared sample window", () => {
    const series = buildNetWorthCategorySeries(
      workspace(),
      undefined,
      TODAY,
      CATEGORIES,
    );
    expect(series.map((s) => s.category)).toEqual(CATEGORIES);
    // Every band shares the same 6-sample x array (Jan..Jun).
    const xs = series[0].points.map((p) => p.x);
    expect(xs).toHaveLength(6);
    for (const band of series) {
      expect(band.points.map((p) => p.x)).toEqual(xs);
    }
  });

  it("stacks liabilities negative and sums to the net-worth line", () => {
    const data = workspace();
    const series = buildNetWorthCategorySeries(
      data,
      undefined,
      TODAY,
      CATEGORIES,
    );
    const byCategory = new Map(series.map((s) => [s.category, s.points]));
    // Last sample: assets positive, mortgages and loans negative.
    const last = (category: NetWorthCategory) =>
      byCategory.get(category)!.at(-1)!.y;
    expect(last("accounts")).toBe(1_000);
    expect(last("properties")).toBe(3_000_000);
    expect(last("mortgages")).toBe(-1_000_000);
    expect(last("loans")).toBe(-120_000);

    // The per-sample algebraic sum matches the single net-worth line.
    const total = buildNetWorthSeries(data, undefined, TODAY);
    total.forEach((point, i) => {
      const sum = series.reduce((acc, s) => acc + s.points[i].y, 0);
      expect(sum).toBeCloseTo(point.y, 6);
    });
  });

  it("honours exclusions and shares per category", () => {
    const settings: InsightsNetWorthSettings = {
      overrides: {
        "acc-1": { excluded: true },
        "prop-1": { sharePct: 50 },
      },
    };
    const series = buildNetWorthCategorySeries(
      workspace(),
      settings,
      TODAY,
      CATEGORIES,
    );
    const byCategory = new Map(series.map((s) => [s.category, s.points]));
    expect(byCategory.get("accounts")!.at(-1)!.y).toBe(0);
    expect(byCategory.get("properties")!.at(-1)!.y).toBe(1_500_000);
    expect(byCategory.get("mortgages")!.at(-1)!.y).toBe(-500_000);
  });
});
