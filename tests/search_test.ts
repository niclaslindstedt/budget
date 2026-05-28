import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { buildSearchIndex, runSearch } from "../src/data/search";
import type {
  AccountBudget,
  Category,
  Column,
  Company,
  EntryType,
  Row,
  Sheet,
  UserData,
} from "../src/data/types";
import { tFor, type TFunction } from "../src/i18n";

// User-added types and categories carry their own name verbatim, so
// the resolver is irrelevant for those — `tFor("en", ...)` is enough
// to cover the preset-name fallback path when one of the tests
// happens to use a preset id.
const t = ((key, params) =>
  tFor("en", key, params as Record<string, string | number>)) as TFunction;

const cols: Column[] = [
  { id: "d", type: "date", label: "Date" },
  { id: "x", type: "description", label: "Description" },
  { id: "a", type: "amount", label: "Amount" },
];

function withItem(
  rows: Row[],
  options: {
    types?: EntryType[];
    categories?: Category[];
    companies?: Company[];
  } = {},
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
    companies: options.companies ?? [],
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
    const idx = buildSearchIndex(data, t);
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
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "groc");
    // r2's description starts with "Groceries"; r1 only matches via
    // typeName. Description hits outrank typeName hits.
    expect(out[0].entry.rowId).toBe("r2");
  });

  it("matches against the row's company name", () => {
    const hm: Company = { id: "hm", name: "H&M" };
    const data = withItem(
      [
        {
          id: "r1",
          cells: { d: "2026-05-01", x: "Sunglasses", a: -299 },
          companyId: "hm",
        },
        { id: "r2", cells: { d: "2026-05-02", x: "Lunch", a: -120 } },
      ],
      { companies: [hm] },
    );
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "H&M");
    expect(out).toHaveLength(1);
    expect(out[0].entry.rowId).toBe("r1");
    expect(out[0].match.field).toBe("companyName");
  });

  it("description hits outrank company hits at the same position", () => {
    const ica: Company = { id: "ica", name: "ICA" };
    const data = withItem(
      [
        {
          id: "r1",
          cells: { d: "2026-05-01", x: "Lunch", a: -120 },
          companyId: "ica",
        },
        { id: "r2", cells: { d: "2026-05-02", x: "ICA Maxi", a: -250 } },
      ],
      { companies: [ica] },
    );
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "ica");
    // r1 matches via companyName ("ICA") and r2 via description ("ICA
    // Maxi"); description is the higher-priority field so r2 ranks
    // ahead of r1 even though both hits land at offset 0.
    expect(out[0].entry.rowId).toBe("r2");
    expect(out[0].match.field).toBe("description");
    expect(out[1].entry.rowId).toBe("r1");
    expect(out[1].match.field).toBe("companyName");
  });

  it("company hits outrank type-name hits at the same position", () => {
    const groc: EntryType = {
      id: "t1",
      name: "Spotify",
      color: "#fff",
      glyph: "music",
      categoryId: "cat",
    };
    const cat: Category = { id: "cat", name: "Entertainment", color: "#fff" };
    const spotify: Company = { id: "sp", name: "Spotify" };
    const data = withItem(
      [
        {
          id: "r1",
          cells: { d: "2026-05-01", x: "Music sub", a: -119 },
          companyId: "sp",
        },
        {
          id: "r2",
          cells: { d: "2026-05-02", x: "Misc", a: -50 },
          typeId: "t1",
        },
      ],
      { companies: [spotify], types: [groc], categories: [cat] },
    );
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "spotify");
    // Both rows match "spotify" at offset 0, r1 via companyName and
    // r2 via typeName. Company is higher priority than type, so r1
    // ranks first.
    expect(out[0].entry.rowId).toBe("r1");
    expect(out[0].match.field).toBe("companyName");
    expect(out[1].entry.rowId).toBe("r2");
    expect(out[1].match.field).toBe("typeName");
  });

  it("matches a preset type by its translated name, not its baseline", () => {
    // `preset-type-pharmacy` ships with `name: "Apoteket"` (Swedish
    // baseline) but renders as "Pharmacy" in English via the i18n
    // catalog. The search index has to mirror what the user sees, so
    // a query for "pharmacy" must surface rows tagged with that
    // preset even though the EntryType's `.name` field never contains
    // the English string.
    const data = withItem([
      {
        id: "r1",
        cells: { d: "2026-05-01", x: "Prescription", a: -85 },
        typeId: "preset-type-pharmacy",
      },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "pharmacy");
    expect(out).toHaveLength(1);
    expect(out[0].entry.rowId).toBe("r1");
    expect(out[0].match.field).toBe("typeName");
  });

  it("returns nothing for empty queries", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
    ]);
    expect(runSearch(buildSearchIndex(data, t), "")).toEqual([]);
    expect(runSearch(buildSearchIndex(data, t), "   ")).toEqual([]);
  });
});

describe("runSearch — sort overrides", () => {
  it("date-desc orders the relevance-trimmed list newest first", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-01-10", x: "Spotify", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify family", a: -119 } },
      { id: "r3", cells: { d: "2026-03-15", x: "Spotify duo", a: -119 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "spotify", "date-desc");
    expect(out.map((r) => r.entry.rowId)).toEqual(["r2", "r3", "r1"]);
  });

  it("date-asc orders the relevance-trimmed list oldest first", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-01-10", x: "Spotify", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify family", a: -119 } },
      { id: "r3", cells: { d: "2026-03-15", x: "Spotify duo", a: -119 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "spotify", "date-asc");
    expect(out.map((r) => r.entry.rowId)).toEqual(["r1", "r3", "r2"]);
  });

  it("amount-desc orders by magnitude, biggest spend first", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify family", a: -250 } },
      { id: "r3", cells: { d: "2026-05-03", x: "Spotify duo", a: -50 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "spotify", "amount-desc");
    expect(out.map((r) => r.entry.rowId)).toEqual(["r2", "r1", "r3"]);
  });

  it("amount-asc orders by magnitude, smallest spend first", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify family", a: -250 } },
      { id: "r3", cells: { d: "2026-05-03", x: "Spotify duo", a: -50 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "spotify", "amount-asc");
    expect(out.map((r) => r.entry.rowId)).toEqual(["r3", "r1", "r2"]);
  });

  it("amount-desc ranks by magnitude across income and expense", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify refund", a: 800 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify family", a: -944 } },
      { id: "r3", cells: { d: "2026-05-03", x: "Spotify duo", a: -744 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "spotify", "amount-desc");
    expect(out.map((r) => r.entry.rowId)).toEqual(["r2", "r1", "r3"]);
  });

  it("rows with no date sink to the bottom regardless of direction", () => {
    const data = withItem([
      { id: "r1", cells: { d: "", x: "Spotify draft", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify family", a: -119 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const desc = runSearch(idx, "spotify", "date-desc");
    expect(desc.map((r) => r.entry.rowId)).toEqual(["r2", "r1"]);
    const asc = runSearch(idx, "spotify", "date-asc");
    expect(asc.map((r) => r.entry.rowId)).toEqual(["r2", "r1"]);
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
    const idx = buildSearchIndex(data, t);
    // Simulate a 5-keystroke type-ahead — "s", "sp", "spo", "spot", "spoti".
    const queries = ["s", "sp", "spo", "spot", "spoti"];
    const t0 = performance.now();
    for (const q of queries) runSearch(idx, q);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(200);
  });
});
