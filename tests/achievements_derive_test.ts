import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { deriveUnlocks } from "../src/data/achievements/derive";
import type {
  AccountBudget,
  Column,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";

const cols: Column[] = [
  { id: "d", type: "date", label: "Date" },
  { id: "x", type: "description", label: "Description" },
  { id: "a", type: "amount", label: "Amount" },
];

function withItem(rows: Row[]): UserData {
  const item: AccountBudget = {
    id: "ab",
    type: "accountBudget",
    accountId: null,
    columns: cols,
    rows,
  };
  const sheet: Sheet = {
    id: "s",
    name: "S",
    type: "budget",
    glyph: "wallet",
    color: "var(--color-blue)",
    description: "",
    items: [item],
  };
  return {
    version: 50,
    sheets: [sheet],
    activeSheetId: "s",
    accounts: [],
    companies: [],
    tags: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
  };
}

describe("deriveUnlocks", () => {
  it("fires firstSteps when a row appears for the first time", () => {
    const prev = withItem([]);
    const next = withItem([{ id: "r1", cells: { d: "2026-05-22" } }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("firstSteps");
  });

  it("does not refire firstSteps if already unlocked", () => {
    const prev = withItem([]);
    const next = withItem([{ id: "r1", cells: {} }]);
    const fresh = deriveUnlocks(prev, next, { firstSteps: 1 });
    expect(fresh).not.toContain("firstSteps");
  });

  it("fires label when a row gains a typeId", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([{ id: "r1", cells: {}, typeId: "t1" }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("label");
  });

  it("fires itemized when a row gains a line-item link", () => {
    const prev = withItem([{ id: "r1", cells: { a: -20000 } }]);
    const next = withItem([
      {
        id: "r1",
        cells: { a: -20000 },
        lineItems: [{ id: "l1", itemId: "i1" }],
      },
    ]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("itemized");
  });

  it("does not refire itemized if already unlocked", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([
      {
        id: "r1",
        cells: {},
        lineItems: [{ id: "l1", itemId: "i1" }],
      },
    ]);
    const fresh = deriveUnlocks(prev, next, { itemized: 1 });
    expect(fresh).not.toContain("itemized");
  });

  it("fires tagger when a row gains its first tag", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([{ id: "r1", cells: {}, tagIds: ["tag1"] }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("tagger");
  });

  it("does not fire tagger when an empty tagIds array is present", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([{ id: "r1", cells: {}, tagIds: [] }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).not.toContain("tagger");
  });

  it("fires companies when the first company is created", () => {
    const prev = withItem([]);
    const next = withItem([]);
    next.companies = [{ id: "c1", name: "H&M" }];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("companies");
  });

  it("fires estimateRange when a row gains an estimate range", () => {
    const prev = withItem([{ id: "r1", cells: {}, amountMin: 100 }]);
    const next = withItem([
      { id: "r1", cells: {}, amountMin: 100, amountMax: 500 },
    ]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("estimateRange");
  });

  it("does not fire estimateRange when only one bound is present", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([{ id: "r1", cells: {}, amountMin: 100 }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).not.toContain("estimateRange");
  });

  it("fires checkPlease when a row's completed cell flips to true", () => {
    const prev = withItem([{ id: "r1", cells: { d: "2026-05-22" } }]);
    const next = withItem([{ id: "r1", cells: { d: "2026-05-22", c: true } }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("checkPlease");
  });

  it("fires bookKeeper when the first account is created", () => {
    const prev = withItem([]);
    const next = withItem([]);
    next.accounts = [{ id: "a1", name: "Checking" }];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("bookKeeper");
  });

  it("fires homeOwner when the first property is added", () => {
    const prev = withItem([]);
    prev.properties = [];
    const next = withItem([]);
    next.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [],
        repairs: [],
      },
    ];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("homeOwner");
  });

  it("fires borrower when the first loan is added", () => {
    const prev = withItem([]);
    prev.loans = [];
    const next = withItem([]);
    next.loans = [{ id: "l1", name: "Car loan", kind: "car", payments: [] }];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("borrower");
  });

  it("fires debtCollector only for bank-imported loan payments", () => {
    const prev = withItem([]);
    prev.loans = [{ id: "l1", name: "Car loan", kind: "car", payments: [] }];
    const handEntered = withItem([]);
    handEntered.loans = [
      {
        id: "l1",
        name: "Car loan",
        kind: "car",
        payments: [{ id: "p1", date: "2026-05-27", amount: 2500 }],
      },
    ];
    expect(deriveUnlocks(prev, handEntered, {})).not.toContain("debtCollector");
    const imported = withItem([]);
    imported.loans = [
      {
        id: "l1",
        name: "Car loan",
        kind: "car",
        payments: [
          {
            id: "p1",
            date: "2026-05-27",
            amount: 2500,
            sourceHistoryId: "h1",
          },
        ],
      },
    ];
    expect(deriveUnlocks(prev, imported, {})).toContain("debtCollector");
  });

  it("fires loanRanger when a mortgage records its first payment", () => {
    const prev = withItem([]);
    prev.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [{ id: "m1", name: "Loan", payments: [] }],
        repairs: [],
      },
    ];
    const next = withItem([]);
    next.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [
          {
            id: "m1",
            name: "Loan",
            payments: [{ id: "pay1", date: "2026-01-28", amount: 5500 }],
          },
        ],
        repairs: [],
      },
    ];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("loanRanger");
  });

  it("fires mortgageFree when a mortgage's balance reaches zero", () => {
    const prev = withItem([]);
    prev.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [
          {
            id: "m1",
            name: "Loan",
            loanAmount: 1_000_000,
            currentBalance: 50_000,
            payments: [],
          },
        ],
        repairs: [],
      },
    ];
    const next = withItem([]);
    next.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [
          {
            id: "m1",
            name: "Loan",
            loanAmount: 1_000_000,
            currentBalance: 0,
            payments: [],
          },
        ],
        repairs: [],
      },
    ];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("mortgageFree");
  });

  it("fires firstRepair when a property records its first repair", () => {
    const prev = withItem([]);
    prev.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [],
        repairs: [],
      },
    ];
    const next = withItem([]);
    next.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [],
        repairs: [
          {
            id: "r1",
            date: "2026-01-20",
            amount: 6800,
            description: "Plumber",
            typeId: "preset-type-repairs",
            accountId: "a1",
            sourceHistoryId: "h1",
          },
        ],
      },
    ];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("firstRepair");
  });

  it("fires propertySold when a property records its sale date", () => {
    const prev = withItem([]);
    prev.properties = [
      {
        id: "p1",
        name: "Apartment",
        valueHistory: [],
        mortgages: [],
        repairs: [],
      },
    ];
    const next = withItem([]);
    next.properties = [
      {
        id: "p1",
        name: "Apartment",
        soldDate: "2026-06-01",
        soldAmount: 2_500_000,
        valueHistory: [],
        mortgages: [],
        repairs: [],
      },
    ];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("propertySold");
  });

  it("fires groundhogDay when a row becomes recurring", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([{ id: "r1", cells: {}, seriesId: "s1" }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("groundhogDay");
  });

  it("fires earlyBird when a series is flagged primary income", () => {
    const prev = withItem([{ id: "r1", cells: {}, seriesId: "s1" }]);
    const next = withItem([{ id: "r1", cells: {}, seriesId: "s1" }]);
    next.seriesMetadata = {
      s1: { isPrimaryIncome: true, anchorDayOfMonth: 25 },
    };
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("earlyBird");
  });

  it("fires spellbinder when a row gains an amount formula", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([
      { id: "r1", cells: {}, amountFormula: "salary * 0.05" },
    ]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("spellbinder");
  });

  it("fires themeWizard when the theme flips to custom", () => {
    const prev = withItem([]);
    const next = withItem([]);
    next.settings = { ...next.settings, theme: "custom" };
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("themeWizard");
  });

  it("fires watchful when a budget gains its second row", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([
      { id: "r1", cells: {} },
      { id: "r2", cells: {} },
    ]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("watchful");
  });

  it("does not fire watchful with a single row", () => {
    const prev = withItem([]);
    const next = withItem([{ id: "r1", cells: {} }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).not.toContain("watchful");
  });

  it("fires crossWired when a formula references another sheet", () => {
    const prev = withItem([
      { id: "r1", cells: {}, amountFormula: "salary * 0.05" },
    ]);
    const next = withItem([
      {
        id: "r1",
        cells: {},
        amountFormula: 'sheet("wife", endOfMonthBalance)',
      },
    ]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("crossWired");
  });

  it("fires fineSieve when a match rule gains an amount or transfer filter", () => {
    const prev = withItem([]);
    prev.matchRules = [{ id: "m1", pattern: "*ICA*" }];
    const next = withItem([]);
    next.matchRules = [{ id: "m1", pattern: "*ICA*", amountMin: 100 }];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("fineSieve");
  });

  it("does not fire fineSieve for a plain description-only rule", () => {
    const prev = withItem([]);
    const next = withItem([]);
    next.matchRules = [{ id: "m1", pattern: "*ICA*", typeId: "t1" }];
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).not.toContain("fineSieve");
  });

  it("fires whatIf when the first scenario appears on a scenarios sheet", () => {
    const scenariosSheet = (
      scenarios: { id: string; name: string }[],
    ): Sheet => ({
      id: "scn-sheet",
      name: "Scenarios",
      type: "scenarios",
      glyph: "compass",
      color: "var(--color-blue)",
      description: "",
      items: [
        {
          id: "v1",
          type: "scenariosView",
          baseSheetId: null,
          monitors: [],
          scenarios: scenarios.map((s) => ({
            ...s,
            overrides: [],
            addedRows: [],
          })),
        },
      ],
    });
    const prev = withItem([]);
    prev.sheets = [...prev.sheets, scenariosSheet([])];
    const next = withItem([]);
    next.sheets = [
      ...next.sheets,
      scenariosSheet([{ id: "scn-1", name: "Lose my job" }]),
    ];
    // Adding the empty sheet alone is not enough — the first Scenario is.
    expect(deriveUnlocks(withItem([]), prev, {})).not.toContain("whatIf");
    expect(deriveUnlocks(prev, next, {})).toContain("whatIf");
  });

  it("fires recurringDreams when a scenario gains a recurring added row", () => {
    const scenariosSheet = (
      addedRows: { id: string; seriesId?: string }[],
    ): Sheet => ({
      id: "scn-sheet",
      name: "Scenarios",
      type: "scenarios",
      glyph: "compass",
      color: "var(--color-blue)",
      description: "",
      items: [
        {
          id: "v1",
          type: "scenariosView",
          baseSheetId: null,
          monitors: [],
          scenarios: [
            {
              id: "scn-1",
              name: "Lose my job",
              overrides: [],
              addedRows: addedRows.map((r) => ({
                ...r,
                date: "2026-03-01",
                description: "Gym",
                amount: -400,
              })),
            },
          ],
        },
      ],
    });
    const prev = withItem([]);
    prev.sheets = [...prev.sheets, scenariosSheet([{ id: "a1" }])];
    const next = withItem([]);
    next.sheets = [
      ...next.sheets,
      scenariosSheet([{ id: "a1" }, { id: "a2", seriesId: "ser-1" }]),
    ];
    // A one-off added row is not enough — the series is.
    expect(deriveUnlocks(withItem([]), prev, {})).not.toContain(
      "recurringDreams",
    );
    expect(deriveUnlocks(prev, next, {})).toContain("recurringDreams");
  });

  it("ignores unchanged state", () => {
    const prev = withItem([{ id: "r1", cells: {} }]);
    const next = withItem([{ id: "r1", cells: {} }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toEqual([]);
  });

  it("returns multiple unlocks in a single transition", () => {
    const prev = withItem([]);
    const next = withItem([{ id: "r1", cells: {}, typeId: "t1" }]);
    const fresh = deriveUnlocks(prev, next, {});
    expect(fresh).toContain("firstSteps");
    expect(fresh).toContain("label");
  });
});
