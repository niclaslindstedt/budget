import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { synthesizeHistoryRow } from "../src/data/budget/synthesis";
import { reducer } from "../src/data/reducer";
import type {
  Column,
  HistoryEntry,
  Row,
  SeriesMatchRule,
  UserData,
} from "../src/data/types";

const COLUMNS: Column[] = [
  { id: "c-date", type: "date", label: "Date" },
  { id: "c-desc", type: "description", label: "Description" },
  { id: "c-amt", type: "amount", label: "Amount" },
];

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "h1",
    date: "2026-05-03",
    description: "SPOTIFY AB",
    amount: -119,
    importedAt: 0,
    ...over,
  };
}

function seriesRow(over: Partial<Row> = {}): Row {
  return {
    kind: "user",
    id: "r1",
    seriesId: "series-A",
    cells: { "c-date": "2026-05-01", "c-desc": "Spotify", "c-amt": -119 },
    ...over,
  } as Row;
}

function baseState(over: Partial<UserData> = {}): UserData {
  return {
    version: 52,
    sheets: [
      {
        id: "s",
        name: "S",
        type: "budget",
        glyph: "wallet",
        color: "var(--color-blue)",
        description: "",
        items: [
          {
            id: "item-1",
            type: "accountBudget",
            accountId: "acct-1",
            columns: COLUMNS,
            rows: [seriesRow()],
          },
        ],
      },
    ],
    activeSheetId: "s",
    accounts: [{ id: "acct-1", name: "Checking" }],
    companies: [],
    tags: [],
    categories: [],
    types: [],
    subtypes: [],
    items: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    companyCategories: [],
    hiddenPresetCompanyCategoryIds: [],
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
    ...over,
  } as UserData;
}

describe("synthesizeHistoryRow series link", () => {
  it("propagates userSeriesId onto the synthesized row's seriesId", () => {
    const rows = synthesizeHistoryRow(
      entry({ userSeriesId: "series-A" }),
      COLUMNS,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].seriesId).toBe("series-A");
  });

  it("leaves seriesId unset when the entry carries no link", () => {
    const rows = synthesizeHistoryRow(entry(), COLUMNS);
    expect(rows[0].seriesId).toBeUndefined();
  });

  it("carries the link onto every split row", () => {
    const rows = synthesizeHistoryRow(
      entry({
        userSeriesId: "series-A",
        splits: [
          { description: "Music", amount: -60 },
          { description: "Family", amount: -59 },
        ],
      }),
      COLUMNS,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].seriesId).toBe("series-A");
    expect(rows[1].seriesId).toBe("series-A");
  });
});

describe("applyReconciliation series link", () => {
  it("stamps userSeriesId from the matched series row onto the entry", () => {
    const state = baseState({ history: { "acct-1": [entry()] } });
    const next = reducer(state, {
      type: "applyReconciliation",
      accountId: "acct-1",
      mergedRowIds: ["r1"],
      entryOverrides: [{ historyEntryId: "h1", userSeriesId: "series-A" }],
      seriesRules: [],
      orphans: [],
    });
    expect(next.history["acct-1"][0].userSeriesId).toBe("series-A");
    // The redundant series row is deleted.
    const item = next.sheets[0].items[0];
    expect(item.type === "accountBudget" && item.rows).toHaveLength(0);
  });

  it("does not overwrite an existing series link (fill-blank only)", () => {
    const state = baseState({
      history: { "acct-1": [entry({ userSeriesId: "series-OLD" })] },
    });
    const next = reducer(state, {
      type: "applyReconciliation",
      accountId: "acct-1",
      mergedRowIds: [],
      entryOverrides: [{ historyEntryId: "h1", userSeriesId: "series-A" }],
      seriesRules: [],
      orphans: [],
    });
    expect(next.history["acct-1"][0].userSeriesId).toBe("series-OLD");
  });
});

describe("importBankHistory silent series link", () => {
  it("stamps userSeriesId on an entry auto-matched by a stored rule", () => {
    const rule: SeriesMatchRule = {
      id: "rule-1",
      seriesId: "series-A",
      pattern: "*SPOTIFY*",
      amountTolerancePct: 0.01,
      dateLagDays: 7,
    };
    const state = baseState({ seriesMatchRules: [rule] });
    const next = reducer(state, {
      type: "importBankHistory",
      accountId: "acct-1",
      entries: [entry()],
      bankParserId: "test",
      filename: "statement.csv",
      now: 1000,
    });
    expect(next.history["acct-1"][0].userSeriesId).toBe("series-A");
    // The predicted series row is silently cancelled by the rule.
    const item = next.sheets[0].items[0];
    expect(item.type === "accountBudget" && item.rows).toHaveLength(0);
  });
});
