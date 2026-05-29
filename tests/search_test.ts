import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import {
  buildSearchIndex,
  EMPTY_FILTER,
  indexBounds,
  isFilterActive,
  runSearch,
  searchBounds,
  type SearchFilter,
} from "../src/data/search";
import type {
  Account,
  AccountBudget,
  Category,
  Column,
  Company,
  EntryType,
  HistoryEntry,
  Row,
  Sheet,
  Tag,
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
    tags?: Tag[];
    accounts?: Account[];
    accountId?: string | null;
    history?: Record<string, HistoryEntry[]>;
  } = {},
): UserData {
  const item: AccountBudget = {
    id: "ab",
    type: "accountBudget",
    accountId: options.accountId ?? null,
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
    version: 46,
    sheets: [sheet],
    activeSheetId: "s",
    accounts: options.accounts ?? [],
    companies: options.companies ?? [],
    tags: options.tags ?? [],
    categories: options.categories ?? [],
    types: options.types ?? [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: options.history ?? {},
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

  it("matches against the row's tag names", () => {
    const vacation: Tag = {
      id: "vac",
      name: "Vacation 2026",
      color: "#fa7c33",
    };
    const data = withItem(
      [
        {
          id: "r1",
          cells: { d: "2026-05-01", x: "Hotel", a: -899 },
          tagIds: ["vac"],
        },
        { id: "r2", cells: { d: "2026-05-02", x: "Lunch", a: -120 } },
      ],
      { tags: [vacation] },
    );
    const idx = buildSearchIndex(data, t);
    const out = runSearch(idx, "Vacation");
    expect(out).toHaveLength(1);
    expect(out[0].entry.rowId).toBe("r1");
    expect(out[0].match.field).toBe("tagNames");
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

  it("matches the raw bank text on a synthesized history row", () => {
    // The visible description on the synthesized row is the user
    // override ("Meds"), so a search for "Apoteket" wouldn't find it
    // via any of the visible-field haystacks. The bank-description
    // index lets the user still locate the row by what the bank
    // reported on the original statement line.
    const account: Account = { id: "acc-1", name: "Checking" };
    const entry: HistoryEntry = {
      id: "hist-1",
      date: "2026-05-22",
      description: "APOTEKET HJARTAT GOTEBORG",
      amount: -744,
      importedAt: 0,
      userDescription: "Meds",
    };
    const data = withItem([], {
      accounts: [account],
      accountId: "acc-1",
      history: { "acc-1": [entry] },
    });
    const out = runSearch(buildSearchIndex(data, t), "apoteket");
    expect(out).toHaveLength(1);
    expect(out[0].entry.description).toBe("Meds");
    expect(out[0].entry.bankDescription).toBe("APOTEKET HJARTAT GOTEBORG");
    expect(out[0].match.field).toBe("bankDescription");
  });

  it("description hits outrank bank-text hits on the same row", () => {
    // When the same query matches both the user-typed description
    // and the underlying bank text, the visible field wins — the
    // user is looking at what they typed, not at the hidden memo.
    const account: Account = { id: "acc-1", name: "Checking" };
    const entry: HistoryEntry = {
      id: "hist-1",
      date: "2026-05-22",
      description: "Apoteket Hjartat",
      amount: -744,
      importedAt: 0,
      userDescription: "Apoteket refill",
    };
    const data = withItem([], {
      accounts: [account],
      accountId: "acc-1",
      history: { "acc-1": [entry] },
    });
    const out = runSearch(buildSearchIndex(data, t), "apoteket");
    expect(out).toHaveLength(1);
    expect(out[0].match.field).toBe("description");
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

function filter(overrides: Partial<SearchFilter>): SearchFilter {
  return { ...EMPTY_FILTER, ...overrides };
}

describe("runSearch — filters", () => {
  // Data with a user row, a transfer-flagged user row, and a
  // synthesized history row, so the kind / transfer filters have one
  // of each to act on. Browsed with an empty query so the filter is
  // what does all the work.
  function mixed(): UserData {
    const account: Account = { id: "acc-1", name: "Checking" };
    const hist: HistoryEntry = {
      id: "hist-1",
      date: "2026-05-03",
      description: "ICA",
      amount: -200,
      importedAt: 0,
    };
    return withItem(
      [
        { id: "r1", cells: { d: "2026-05-01", x: "Groceries", a: -100 } },
        {
          id: "r2",
          cells: { d: "2026-05-02", x: "To savings", a: -500 },
          isTransfer: true,
        },
      ],
      { accounts: [account], accountId: "acc-1", history: { "acc-1": [hist] } },
    );
  }

  it("excludeUnconfirmed keeps only bank-history rows", () => {
    const idx = buildSearchIndex(mixed(), t);
    const out = runSearch(
      idx,
      "",
      "date-desc",
      filter({ excludeUnconfirmed: true }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].entry.kind).toBe("historic");
  });

  it("excludeHistory drops bank-history rows", () => {
    const idx = buildSearchIndex(mixed(), t);
    const out = runSearch(
      idx,
      "",
      "date-desc",
      filter({ excludeHistory: true }),
    );
    expect(out.map((r) => r.entry.rowId).sort()).toEqual(["r1", "r2"]);
    expect(out.every((r) => r.entry.kind !== "historic")).toBe(true);
  });

  it("excludeTransfers drops rows flagged as transfers", () => {
    const idx = buildSearchIndex(mixed(), t);
    const out = runSearch(
      idx,
      "",
      "date-desc",
      filter({ excludeTransfers: true }),
    );
    expect(out.some((r) => r.entry.rowId === "r2")).toBe(false);
  });

  it("amount range matches by magnitude across both signs", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "small", a: -100 } },
      { id: "r2", cells: { d: "2026-05-02", x: "refund", a: 300 } },
      { id: "r3", cells: { d: "2026-05-03", x: "big", a: -500 } },
      { id: "r4", cells: { d: "2026-05-04", x: "no amount" } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(
      idx,
      "",
      "date-asc",
      filter({ amountMin: 200, amountMax: 400 }),
    );
    // |300| is in band; |100| and |500| are out; the amountless row is
    // dropped because it can't satisfy a numeric band.
    expect(out.map((r) => r.entry.rowId)).toEqual(["r2"]);
  });

  it("date range drops undated rows and rows outside the band", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-01-01", x: "early", a: -1 } },
      { id: "r2", cells: { d: "2026-05-15", x: "mid", a: -1 } },
      { id: "r3", cells: { d: "2026-12-31", x: "late", a: -1 } },
      { id: "r4", cells: { d: "", x: "undated", a: -1 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(
      idx,
      "",
      "date-asc",
      filter({ dateMin: "2026-05-01", dateMax: "2026-06-01" }),
    );
    expect(out.map((r) => r.entry.rowId)).toEqual(["r2"]);
  });

  it("sheetIds restricts to the chosen sheets; empty means all", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
    ]);
    const idx = buildSearchIndex(data, t);
    expect(
      runSearch(idx, "spotify", "relevance", filter({ sheetIds: ["s"] })),
    ).toHaveLength(1);
    expect(
      runSearch(idx, "spotify", "relevance", filter({ sheetIds: ["other"] })),
    ).toHaveLength(0);
  });

  it("an active filter narrows a non-empty query before the result cap", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-05-01", x: "Spotify", a: -119 } },
      { id: "r2", cells: { d: "2026-05-02", x: "Spotify", a: -800 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const out = runSearch(
      idx,
      "spotify",
      "relevance",
      filter({ amountMax: 200 }),
    );
    expect(out.map((r) => r.entry.rowId)).toEqual(["r1"]);
  });

  it("empty query browses filtered rows but stays empty when no filter is set", () => {
    const idx = buildSearchIndex(mixed(), t);
    expect(runSearch(idx, "", "date-desc", EMPTY_FILTER)).toEqual([]);
    expect(
      runSearch(idx, "", "date-desc", filter({ excludeHistory: true })).length,
    ).toBeGreaterThan(0);
  });
});

describe("filter helpers", () => {
  it("isFilterActive is false only for the empty filter", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(isFilterActive(filter({ excludeTransfers: true }))).toBe(true);
    expect(isFilterActive(filter({ amountMin: 5 }))).toBe(true);
    expect(isFilterActive(filter({ dateMax: "2026-01-01" }))).toBe(true);
    expect(isFilterActive(filter({ sheetIds: ["s"] }))).toBe(true);
  });

  it("indexBounds reports absolute-amount and ISO-date extents", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-02-01", x: "a", a: -100 } },
      { id: "r2", cells: { d: "2026-08-01", x: "b", a: 750 } },
      { id: "r3", cells: { d: "", x: "no date" } },
    ]);
    const bounds = indexBounds(buildSearchIndex(data, t));
    expect(bounds.amountMin).toBe(100);
    expect(bounds.amountMax).toBe(750);
    expect(bounds.dateMin).toBe("2026-02-01");
    expect(bounds.dateMax).toBe("2026-08-01");
  });

  it("searchBounds narrows the extents to the query's matching rows", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-02-01", x: "Meds", a: -100 } },
      { id: "r2", cells: { d: "2026-03-01", x: "Meds refill", a: -500 } },
      { id: "r3", cells: { d: "2021-01-04", x: "Rent", a: -981_000 } },
      { id: "r4", cells: { d: "2029-01-28", x: "Bonus", a: 50_000 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const bounds = searchBounds(idx, "meds", EMPTY_FILTER);
    expect(bounds.amountMin).toBe(100);
    expect(bounds.amountMax).toBe(500);
    expect(bounds.dateMin).toBe("2026-02-01");
    expect(bounds.dateMax).toBe("2026-03-01");
  });

  it("searchBounds ignores the filter's own range but honours excludes", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-02-01", x: "Meds", a: -100 } },
      { id: "r2", cells: { d: "2026-03-01", x: "Meds refill", a: -500 } },
    ]);
    const idx = buildSearchIndex(data, t);
    // A narrowed amount band must not collapse the slider's own domain.
    const bounds = searchBounds(
      idx,
      "meds",
      filter({ amountMin: 200, amountMax: 300 }),
    );
    expect(bounds.amountMin).toBe(100);
    expect(bounds.amountMax).toBe(500);
  });

  it("searchBounds with an empty query spans the categorically-matching rows", () => {
    const data = withItem([
      { id: "r1", cells: { d: "2026-02-01", x: "a", a: -100 } },
      { id: "r2", cells: { d: "2026-08-01", x: "b", a: 750 } },
    ]);
    const idx = buildSearchIndex(data, t);
    const bounds = searchBounds(idx, "", EMPTY_FILTER);
    expect(bounds.amountMin).toBe(100);
    expect(bounds.amountMax).toBe(750);
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
