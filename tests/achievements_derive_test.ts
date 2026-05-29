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
    version: 47,
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
