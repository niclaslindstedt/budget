import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { buildSearchIndex, runSearch } from "../src/data/search";
import type {
  AccountBudget,
  Category,
  Column,
  EntryType,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";

const cols: Column[] = [
  { id: "d", type: "date", label: "Date" },
  { id: "x", type: "description", label: "Description" },
  { id: "a", type: "amount", label: "Amount" },
];

function withItem(
  rows: Row[],
  options: { types?: EntryType[]; categories?: Category[] } = {},
): UserData {
  const item: AccountBudget = {
    id: "ab",
    type: "accountBudget",
    accountId: null,
    columns: cols,
    rows,
  };
  const sheet: Sheet = {
    id: "s",
    name: "Main",
    type: "budget",
    glyph: "wallet",
    color: "var(--color-blue)",
    description: "",
    items: [item],
  };
  return {
    version: 44,
    sheets: [sheet],
    activeSheetId: "s",
    accounts: [],
    companies: [],
    categories: options.categories ?? [],
    types: options.types ?? [],
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

describe("runSearch — text matches", () => {
  it("matches case-insensitively against the description field", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Netflix", a: -100 } },
    ]);
    const idx = buildSearchIndex(data);
    const out = runSearch(idx, "SPOT");
    expect(out).toHaveLength(1);
    expect(out[0].entry.rowId).toBe("r1");
    expect(out[0].match.field).toBe("description");
  });

  it("description beats typeName at the same position", () => {
    const groc: EntryType = {
      id: "t1",
      name: "Groceries",
      color: "#fff",
      glyph: "utensils",
      categoryId: "cat",
    };
    const cat: Category = { id: "cat", name: "Groceries", color: "#fff" };
    const data = withItem(
      [
        {
          id: "r1",
          cells: { d: "2026-05-01", x: "ICA Maxi", a: -50 },
          typeId: "t1",
        },
        {
          id: "r2",
          cells: { d: "2026-05-02", x: "Groceries restock", a: -50 },
        },
      ],
      { types: [groc], categories: [cat] },
    );
    const idx = buildSearchIndex(data);
    const out = runSearch(idx, "groc");
    // r2's description starts with "Groceries"; r1 only matches via
    // typeName. Description hits outrank typeName hits.
    expect(out[0].entry.rowId).toBe("r2");
  });

  it("returns nothing for empty queries", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
    ]);
    expect(runSearch(buildSearchIndex(data), "")).toEqual([]);
    expect(runSearch(buildSearchIndex(data), "   ")).toEqual([]);
  });
});

describe("runSearch — performance", () => {
  it("filters a 5000-row index per keystroke without re-lowercasing", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 5000; i += 1) {
      rows.push({
        id: `r${i}`,
        cells: {
          d: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`,
          x: `Merchant ${i} Spotify`,
          a: -100,
        },
      });
    }
    const data = withItem(rows);
    const idx = buildSearchIndex(data);
    // Simulate a 5-keystroke type-ahead — "s", "sp", "spo", "spot", "spoti".
    const queries = ["s", "sp", "spo", "spot", "spoti"];
    const t0 = performance.now();
    for (const q of queries) runSearch(idx, q);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});
