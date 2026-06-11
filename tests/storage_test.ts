import { describe, expect, it } from "vitest";

import {
  DEFAULT_PERSISTED_SETTINGS,
  DEFAULT_SETTINGS,
} from "../src/data/constants/defaults";
import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, UserData } from "../src/data/types";
import { validateUserData } from "../src/data/validate";
import {
  parseUserData,
  serializeUserData,
  suggestFilename,
} from "../src/storage/file";
import { readUserDataFromText } from "../src/storage/local";

function sampleData(): UserData {
  const accountId = "acct-1";
  const a = createDefaultSheet("First", accountId);
  const b = createDefaultSheet("Second", accountId);
  const aItem = a.items[0] as AccountBudget;
  const dateCol = aItem.columns.find((c) => c.type === "date")!;
  const amountCol = aItem.columns.find((c) => c.type === "amount")!;
  aItem.rows = [
    {
      kind: "user",
      id: "row-1",
      cells: { [dateCol.id]: "2026-05-01", [amountCol.id]: 42 },
    },
    {
      kind: "user",
      id: "row-2",
      cells: { [dateCol.id]: "2026-05-15", [amountCol.id]: -10 },
    },
  ];
  return {
    version: LATEST_VERSION,
    sheets: [a, b],
    activeSheetId: b.id,
    accounts: [{ id: accountId, name: "Default" }],
    taxProfiles: [],
    salaries: [],
    employers: [],
    properties: [],
    savings: [],
    loans: [],
    investmentHoldings: [],
    investmentStocks: [],
    fileCategories: [],
    companies: [],
    tags: [],
    categories: [{ id: "cat-1", name: "Rent", color: "#e06c75", icon: "home" }],
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
    ignoredItemEntryIds: [],
    itemFindExclusionPatterns: [],
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

function firstItem(data: UserData): AccountBudget {
  return data.sheets[0].items[0] as AccountBudget;
}

describe("serializeUserData", () => {
  it("round-trips through parseUserData", () => {
    const b = sampleData();
    const result = parseUserData(serializeUserData(b));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(b);
      expect(result.migrated).toBe(false);
    }
  });

  it("is byte-stable regardless of source key order", () => {
    const b = sampleData();
    const text1 = serializeUserData(b);
    // Rebuild the same value with keys inserted in a different order at
    // every level. The serializer should erase that difference.
    const reordered = {
      activeSheetId: b.activeSheetId,
      sheets: b.sheets.map((s) => ({
        items: s.items.map((it) => {
          const ab = it as AccountBudget;
          return {
            rows: ab.rows.map((r) => ({
              cells: r.cells,
              id: r.id,
              kind: r.kind,
            })),
            accountId: ab.accountId,
            type: ab.type,
            columns: ab.columns.map((c) => ({
              label: c.label,
              type: c.type,
              id: c.id,
            })),
            id: ab.id,
          };
        }),
        name: s.name,
        description: s.description,
        color: s.color,
        glyph: s.glyph,
        type: s.type,
        id: s.id,
      })),
      accounts: b.accounts,
      taxProfiles: b.taxProfiles,
      salaries: b.salaries,
      employers: b.employers,
      properties: b.properties,
      savings: b.savings,
      loans: b.loans,
      investmentHoldings: b.investmentHoldings,
      investmentStocks: b.investmentStocks,
      fileCategories: b.fileCategories,
      companies: b.companies,
      tags: b.tags,
      categories: b.categories,
      types: b.types,
      subtypes: b.subtypes,
      items: b.items,
      hiddenPresetTypeIds: b.hiddenPresetTypeIds,
      presetTypeKindOverrides: b.presetTypeKindOverrides,
      hiddenPresetCategoryIds: b.hiddenPresetCategoryIds,
      companyCategories: b.companyCategories,
      hiddenPresetCompanyCategoryIds: b.hiddenPresetCompanyCategoryIds,
      transfers: b.transfers,
      history: b.history,
      historyImports: b.historyImports,
      merchantHints: b.merchantHints,
      recurringDismissals: b.recurringDismissals,
      transferCollapseDismissals: b.transferCollapseDismissals,
      ignoredItemEntryIds: b.ignoredItemEntryIds,
      itemFindExclusionPatterns: b.itemFindExclusionPatterns,
      matchRules: b.matchRules,
      seriesMatchRules: b.seriesMatchRules,
      renamePatterns: b.renamePatterns,
      seriesMetadata: b.seriesMetadata,
      primaryIncomeMerchants: b.primaryIncomeMerchants,
      settings: b.settings,
      version: b.version,
    } as UserData;
    expect(serializeUserData(reordered)).toBe(text1);
  });

  it("sorts object keys recursively", () => {
    const b = sampleData();
    const text = serializeUserData(b);
    // Top-level keys appear in alphabetical order.
    const topKeys = Array.from(text.matchAll(/^\s{2}"([^"]+)":/gm)).map(
      (m) => m[1],
    );
    expect(topKeys.slice(0, 38)).toEqual([
      "accounts",
      "activeSheetId",
      "categories",
      "companies",
      "companyCategories",
      "employers",
      "fileCategories",
      "hiddenPresetCategoryIds",
      "hiddenPresetCompanyCategoryIds",
      "hiddenPresetTypeIds",
      "history",
      "historyImports",
      "ignoredItemEntryIds",
      "investmentHoldings",
      "investmentStocks",
      "itemFindExclusionPatterns",
      "items",
      "loans",
      "matchRules",
      "merchantHints",
      "presetTypeKindOverrides",
      "primaryIncomeMerchants",
      "properties",
      "recurringDismissals",
      "renamePatterns",
      "salaries",
      "savings",
      "seriesMatchRules",
      "seriesMetadata",
      "settings",
      "sheets",
      "subtypes",
      "tags",
      "taxProfiles",
      "transferCollapseDismissals",
      "transfers",
      "types",
      "version",
    ]);
  });

  it("ends with a trailing newline", () => {
    expect(serializeUserData(sampleData()).endsWith("\n")).toBe(true);
  });
});

describe("parseUserData — error paths", () => {
  it("rejects malformed JSON", () => {
    const r = parseUserData("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid JSON/);
  });

  it("rejects missing version", () => {
    const r = parseUserData(JSON.stringify({ sheets: [], activeSheetId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version/);
  });

  it("rejects newer-than-supported version with a clear message", () => {
    const r = parseUserData(
      JSON.stringify({ version: LATEST_VERSION + 5, sheets: [] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it("rejects unknown column type", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.sheets[0].items[0].columns[0].type = "color";
    const r = parseUserData(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown column type/);
  });

  it("rejects duplicate sheet ids", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.sheets[1].id = raw.sheets[0].id;
    const r = parseUserData(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/duplicate id/);
  });

  it("replaces unknown category icon with the default rather than rejecting", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.categories[0].icon = "not-an-icon";
    const r = parseUserData(JSON.stringify(raw));
    // An unknown glyph is cosmetic, not data. Failing the parse used
    // to cascade into a fresh-budget fallback that overwrote the
    // user's cloud copy on the next save — the validator now falls
    // back to the default glyph instead, matching the lenient
    // pattern already used for unknown sheet glyphs and dangling
    // type references.
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.categories[0].icon).not.toBe("not-an-icon");
    }
  });
});

describe("validateUserData — soft recovery", () => {
  it("drops cells referencing missing columns rather than failing", () => {
    const b = sampleData();
    firstItem(b).rows[0].cells["ghost-column-id"] = "stray";
    const r = validateUserData(b);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(
        firstItem(r.value).rows[0].cells["ghost-column-id"],
      ).toBeUndefined();
    }
  });

  it("keeps a row's isCorrection: true through validation", () => {
    const b = sampleData();
    firstItem(b).rows[0].isCorrection = true;
    const r = validateUserData(b);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(firstItem(r.value).rows[0].isCorrection).toBe(true);
    }
  });

  it("drops a row's isCorrection: false instead of persisting the falsy flag", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.sheets[0].items[0].rows[0].isCorrection = false;
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(firstItem(r.value).rows[0].isCorrection).toBeUndefined();
    }
  });

  it("rejects a non-boolean isCorrection field", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.sheets[0].items[0].rows[0].isCorrection = "yes";
    const r = validateUserData(raw);
    expect(r.ok).toBe(false);
  });

  it("recovers a dangling activeSheetId to the first sheet", () => {
    const b = sampleData();
    const r = validateUserData({ ...b, activeSheetId: "does-not-exist" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.activeSheetId).toBe(b.sheets[0].id);
  });

  it("defaults categories to an empty array when missing", () => {
    const b = sampleData();
    const withoutCategories: Record<string, unknown> = { ...b };
    delete withoutCategories.categories;
    const r = validateUserData(withoutCategories);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.categories).toEqual([]);
  });

  it("defaults settings to DEFAULT_PERSISTED_SETTINGS when missing", () => {
    const b = sampleData();
    const withoutSettings: Record<string, unknown> = { ...b };
    delete withoutSettings.settings;
    const r = validateUserData(withoutSettings);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings).toEqual(DEFAULT_PERSISTED_SETTINGS);
  });

  it("snaps individual invalid settings back to their default", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    // Common-scope rubbish at the top level.
    raw.settings.startOfMonth = 99;
    raw.settings.dateFormat = "wat";
    raw.settings.decimalSeparator = "_";
    raw.settings.thousandsSeparator = "X";
    raw.settings.currency = "";
    // Device-scoped rubbish inside each bucket.
    raw.settings.device.mobile.formatNumbers = "yes";
    raw.settings.device.desktop.formatNumbers = "yes";
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings.startOfMonth).toBe(DEFAULT_SETTINGS.startOfMonth);
      expect(r.value.settings.dateFormat).toBe(DEFAULT_SETTINGS.dateFormat);
      expect(r.value.settings.decimalSeparator).toBe(
        DEFAULT_SETTINGS.decimalSeparator,
      );
      expect(r.value.settings.thousandsSeparator).toBe(
        DEFAULT_SETTINGS.thousandsSeparator,
      );
      expect(r.value.settings.currency).toBe(DEFAULT_SETTINGS.currency);
      expect(r.value.settings.device.mobile.formatNumbers).toBe(
        DEFAULT_SETTINGS.formatNumbers,
      );
      expect(r.value.settings.device.desktop.formatNumbers).toBe(
        DEFAULT_SETTINGS.formatNumbers,
      );
    }
  });

  it("accepts an in-range sessionTimeoutMinutes and rounds it", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.sessionTimeoutMinutes = 60.4;
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings.sessionTimeoutMinutes).toBe(60);
  });

  it("snaps an out-of-range sessionTimeoutMinutes back to the default", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.sessionTimeoutMinutes = 0;
    let r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.settings.sessionTimeoutMinutes).toBe(
        DEFAULT_SETTINGS.sessionTimeoutMinutes,
      );

    raw.settings.sessionTimeoutMinutes = 99999;
    r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.settings.sessionTimeoutMinutes).toBe(
        DEFAULT_SETTINGS.sessionTimeoutMinutes,
      );

    raw.settings.sessionTimeoutMinutes = "fifteen";
    r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.settings.sessionTimeoutMinutes).toBe(
        DEFAULT_SETTINGS.sessionTimeoutMinutes,
      );
  });

  it("accepts an in-range fontScale in both device buckets", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.device.mobile.fontScale = 1.25;
    raw.settings.device.desktop.fontScale = 0.9;
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings.device.mobile.fontScale).toBe(1.25);
      expect(r.value.settings.device.desktop.fontScale).toBe(0.9);
    }
  });

  it("snaps an out-of-range fontScale back to the default per bucket", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.device.mobile.fontScale = 0;
    raw.settings.device.desktop.fontScale = 9;
    let r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings.device.mobile.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
      expect(r.value.settings.device.desktop.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
    }

    raw.settings.device.mobile.fontScale = "large";
    r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.settings.device.mobile.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
  });

  it("ignores a stray top-level fontScale on the persisted shape", () => {
    // v35 dropped fontScale from the flat top level. A hand-edited
    // file (or a v35-producer that didn't read the spec) putting it
    // back at the top must NOT be silently picked up — the validator
    // reads only the device buckets.
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.fontScale = 1.4;
    raw.settings.device.mobile.fontScale = 1;
    raw.settings.device.desktop.fontScale = 1;
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings.device.mobile.fontScale).toBe(1);
      expect(r.value.settings.device.desktop.fontScale).toBe(1);
      // The stray top-level field is dropped from the validated output.
      expect(
        (r.value.settings as unknown as Record<string, unknown>).fontScale,
      ).toBeUndefined();
    }
  });

  it("recovers a malformed device bucket to defaults", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    // Mobile bucket entirely missing — desktop carries values.
    raw.settings.device = { desktop: { fontScale: 1.1 } };
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Mobile defaults filled in.
      expect(r.value.settings.device.mobile.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
      expect(r.value.settings.device.desktop.fontScale).toBe(1.1);
    }
  });

  it("clears thousands separator when it collides with the decimal", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.decimalSeparator = ".";
    raw.settings.thousandsSeparator = ".";
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.settings.decimalSeparator).toBe(".");
      expect(r.value.settings.thousandsSeparator).toBe("");
    }
  });
});

describe("migrate", () => {
  it("is a no-op for the current version", () => {
    const b = sampleData();
    const { data, migrated } = migrate(b);
    expect(migrated).toBe(false);
    expect(data).toEqual(b);
  });

  it("throws for a version newer than supported", () => {
    expect(() => migrate({ version: LATEST_VERSION + 1 })).toThrow();
  });

  it("v1 → latest: adds categories array and strips the category column the legacy migration introduced", () => {
    const v1 = {
      version: 1,
      activeSheetId: "s1",
      sheets: [
        {
          id: "s1",
          name: "Old",
          openingBalance: 0,
          rows: [],
          columns: [
            { id: "c1", type: "date", label: "Date" },
            { id: "c2", type: "description", label: "Description" },
            { id: "c3", type: "amount", label: "Amount" },
            { id: "c4", type: "balance", label: "Balance" },
            { id: "c5", type: "completed", label: "Done" },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v1);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.categories).toEqual([]);
    const item = (
      data.sheets as Array<{
        items: Array<{ columns: Array<{ type: string }> }>;
      }>
    )[0].items[0];
    const types = item.columns.map((c) => c.type);
    // The v1 → v2 step inserted a "category" column historically; the
    // v24 → v25 step strips it back out since category is now derived
    // from `row.typeId → EntryType.categoryId`. The v25 → v26 step
    // then re-introduces a `"type"` column just after "description"
    // so the row's typeId is visible as a dedicated cell again.
    expect(types).not.toContain("category");
    expect(types).toEqual([
      "date",
      "description",
      "type",
      "amount",
      "balance",
      "completed",
    ]);
    // Migrated data validates cleanly under the latest validator.
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v1 → latest: drops a pre-existing category column with the rest of them", () => {
    const v1 = {
      version: 1,
      activeSheetId: "s1",
      sheets: [
        {
          id: "s1",
          name: "Old",
          openingBalance: 0,
          rows: [],
          columns: [
            { id: "c1", type: "date", label: "Date" },
            { id: "cx", type: "category", label: "Bucket" },
            { id: "c2", type: "description", label: "Description" },
          ],
        },
      ],
    };
    const { data } = migrate(v1);
    const item = (
      data.sheets as Array<{
        items: Array<{ columns: Array<{ id: string; type: string }> }>;
      }>
    )[0].items[0];
    // Both "cx" (the user-renamed category column) and any column the
    // intermediate migrations inserted should be gone by v25; the
    // v25 → v26 step then inserts a fresh "type" column right after
    // "description" so the final shape carries it.
    expect(item.columns.some((c) => c.type === "category")).toBe(false);
    expect(item.columns.map((c) => c.type)).toEqual([
      "date",
      "description",
      "type",
    ]);
  });

  it("v3 → v4 → v5: adds settings with defaults, preserves data", () => {
    const v3 = {
      version: 3,
      activeSheetId: "s1",
      categories: [],
      sheets: [
        {
          id: "s1",
          name: "Old",
          columns: [
            { id: "c1", type: "date", label: "Date" },
            { id: "c2", type: "description", label: "Description" },
            { id: "c3", type: "category", label: "Category" },
            { id: "c4", type: "amount", label: "Amount" },
            { id: "c5", type: "balance", label: "Balance" },
            { id: "c6", type: "completed", label: "Done" },
          ],
          rows: [{ id: "r1", cells: { c1: "2026-05-01", c4: 100 } }],
        },
      ],
    };
    const { data, migrated } = migrate(v3);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.settings).toEqual(DEFAULT_PERSISTED_SETTINGS);
    const item = (
      data.sheets as Array<{
        items: Array<{ rows: Array<{ id: string }> }>;
      }>
    )[0].items[0];
    expect(item.rows[0].id).toBe("r1");
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v2 → latest: bumps version, preserves data, keeps existing seriesIds", () => {
    const v2 = {
      version: 2,
      activeSheetId: "s1",
      categories: [],
      sheets: [
        {
          id: "s1",
          name: "Old",
          openingBalance: 0,
          columns: [
            { id: "c1", type: "date", label: "Date" },
            { id: "c2", type: "description", label: "Description" },
            { id: "c3", type: "category", label: "Category" },
            { id: "c4", type: "amount", label: "Amount" },
            { id: "c5", type: "balance", label: "Balance" },
            { id: "c6", type: "completed", label: "Done" },
          ],
          rows: [
            {
              id: "r1",
              cells: { c1: "2026-05-01", c4: 100 },
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v2);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const item = (
      data.sheets as Array<{
        items: Array<{ rows: Array<{ id: string }> }>;
      }>
    )[0].items[0];
    expect(item.rows).toHaveLength(1);
    expect(item.rows[0].id).toBe("r1");
  });

  it("v4 → v5: wraps each sheet's columns+rows into an AccountBudget item and seeds a default Account", () => {
    const v4 = {
      version: 4,
      activeSheetId: "s1",
      categories: [],
      settings: { ...DEFAULT_SETTINGS },
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          columns: [
            { id: "c1", type: "date", label: "Date" },
            { id: "c2", type: "description", label: "Description" },
            { id: "c3", type: "amount", label: "Amount" },
          ],
          rows: [{ id: "r1", cells: { c1: "2026-05-01", c3: 50 } }],
        },
      ],
    };
    const { data, migrated } = migrate(v4);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const accounts = data.accounts as Array<{ id: string; name: string }>;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("Default");
    const sheets = data.sheets as Array<{
      items: Array<{
        type: string;
        accountId: string;
        rows: Array<{ id: string }>;
        columns: Array<{ id: string }>;
      }>;
    }>;
    expect(sheets[0].items).toHaveLength(1);
    expect(sheets[0].items[0].type).toBe("accountBudget");
    expect(sheets[0].items[0].accountId).toBe(accounts[0].id);
    expect(sheets[0].items[0].rows[0].id).toBe("r1");
    // The seeded columns (date, description, amount) carry through;
    // the v25 → v26 step appends a fresh `type` column after
    // description so the migrated sheet has four columns.
    expect(sheets[0].items[0].columns).toHaveLength(4);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v6 → v7: seeds sheet metadata (type, glyph, color, description)", () => {
    const v6 = {
      version: 6,
      activeSheetId: "s1",
      categories: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v6);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const sheets = data.sheets as Array<{
      type: string;
      glyph: string;
      color: string;
      description: string;
    }>;
    expect(sheets[0].type).toBe("budget");
    expect(typeof sheets[0].glyph).toBe("string");
    expect(typeof sheets[0].color).toBe("string");
    expect(sheets[0].description).toBe("");
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v7 → v8: bumps the version and leaves existing rows untouched", () => {
    const v7 = {
      version: 7,
      activeSheetId: "s1",
      categories: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [{ id: "r1", cells: { c1: "2026-05-01", c3: 50 } }],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v7);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const sheets = data.sheets as Array<{
      items: Array<{ rows: Array<{ id: string; glyph?: string }> }>;
    }>;
    expect(sheets[0].items[0].rows[0].id).toBe("r1");
    expect(sheets[0].items[0].rows[0].glyph).toBeUndefined();
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v11 → v12: adds empty merchant-hint memory and dismissal allowlists", () => {
    const v11 = {
      version: 11,
      activeSheetId: "s1",
      categories: [],
      transfers: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      history: {},
      historyImports: {},
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v11);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect((data as unknown as UserData).merchantHints).toEqual({});
    expect((data as unknown as UserData).recurringDismissals).toEqual([]);
    expect((data as unknown as UserData).transferCollapseDismissals).toEqual(
      [],
    );
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v10 → v11: adds empty history and historyImports maps and accepts an optional openingBalance on Account", () => {
    const v10 = {
      version: 10,
      activeSheetId: "s1",
      categories: [],
      transfers: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [
        { id: "a1", name: "Default", openingBalance: 1234 },
        { id: "a2", name: "Other" },
      ],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v10);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect((data as unknown as UserData).history).toEqual({});
    expect((data as unknown as UserData).historyImports).toEqual({});
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.accounts[0].openingBalance).toBe(1234);
      expect(validated.value.accounts[1].openingBalance).toBeUndefined();
    }
  });

  it("v9 → v10: bare version bump that accepts the new optional isCorrection row field", () => {
    const v9 = {
      version: 9,
      activeSheetId: "s1",
      categories: [],
      transfers: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [
                {
                  id: "r1",
                  cells: {
                    c1: "2026-05-01",
                    c2: "Balance correction",
                    c3: 250,
                  },
                  isCorrection: true,
                },
              ],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v9);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      const item = validated.value.sheets[0].items[0];
      if (item.type !== "accountBudget") throw new Error("expected budget");
      expect(item.rows[0].isCorrection).toBe(true);
    }
  });

  it("v8 → v9: adds an empty transfers array and accepts new account fields", () => {
    const v8 = {
      version: 8,
      activeSheetId: "s1",
      categories: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [
                {
                  id: "r1",
                  cells: { c1: "2026-05-01", c2: "Rent", c3: 50 },
                },
              ],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v8);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect((data as unknown as UserData).transfers).toEqual([]);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v5 → v6: bumps the version and preserves shape", () => {
    const v5 = {
      version: 5,
      activeSheetId: "s1",
      categories: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [{ id: "r1", cells: { c1: "2026-05-01", c3: 50 } }],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v5);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const sheets = data.sheets as Array<{
      items: Array<{ accountId: string | null }>;
    }>;
    expect(sheets[0].items[0].accountId).toBe("a1");
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v13 → v14: seeds entry types and strips legacy row glyphs", () => {
    const v13 = {
      version: 13,
      activeSheetId: "s1",
      categories: [],
      transfers: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [{ id: "a1", name: "Default" }],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [
            {
              id: "i1",
              type: "accountBudget",
              accountId: "a1",
              columns: [
                { id: "c1", type: "date", label: "Date" },
                { id: "c2", type: "description", label: "Description" },
                { id: "c3", type: "amount", label: "Amount" },
              ],
              rows: [
                {
                  id: "r1",
                  cells: { c1: "2026-05-01", c2: "Rent", c3: -1000 },
                  glyph: "home",
                },
                {
                  id: "r2",
                  cells: { c1: "2026-05-02", c2: "Coffee", c3: -30 },
                  glyph: "coffee",
                  seriesId: "s-1",
                },
                {
                  id: "r3",
                  cells: { c1: "2026-05-03", c2: "Plain", c3: -50 },
                },
              ],
            },
          ],
        },
      ],
    };
    const { data, migrated } = migrate(v13);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    // Seeded types are non-empty so the picker has options on first
    // promote post-migration.
    const types = (data as unknown as { types: unknown[] }).types;
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    // Glyph fields on every row are gone — the migration strips them
    // and types take over the visual identity.
    const sheets = data.sheets as Array<{
      items: Array<{
        rows: Array<{ id: string; glyph?: string; seriesId?: string }>;
      }>;
    }>;
    const rows = sheets[0].items[0].rows;
    for (const row of rows) {
      expect(row.glyph).toBeUndefined();
    }
    // Non-glyph fields survive untouched.
    expect(rows[1].seriesId).toBe("s-1");
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v17 → v18: bumps version, lets the validator default fontScale", () => {
    const v17 = {
      version: 17,
      activeSheetId: "s1",
      categories: [],
      types: [],
      transfers: [],
      // Settings as they'd look pre-v18: no fontScale field.
      settings: (() => {
        const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
        delete s.fontScale;
        return s;
      })(),
      accounts: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [],
        },
      ],
    };
    const { data, migrated } = migrate(v17);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.settings.device.mobile.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
      expect(validated.value.settings.device.desktop.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
    }
  });

  it("v18 → v19: bumps version, lets the validator default lastSeenChangelogVersion to null", () => {
    const v18 = {
      version: 18,
      activeSheetId: "s1",
      categories: [],
      types: [],
      transfers: [],
      // Settings as they'd look pre-v19: no lastSeenChangelogVersion field.
      settings: (() => {
        const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
        delete s.lastSeenChangelogVersion;
        return s;
      })(),
      accounts: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [],
        },
      ],
    };
    const { data, migrated } = migrate(v18);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.settings.lastSeenChangelogVersion).toBeNull();
    }
  });

  it("v20 → v21: bumps version, lets the validator default alwaysAbbreviateBalance", () => {
    const v20 = {
      version: 20,
      activeSheetId: "s1",
      categories: [],
      types: [],
      hiddenPresetTypeIds: [],
      presetTypeKindOverrides: {},
      hiddenPresetCategoryIds: [],
      transfers: [],
      // Settings as they'd look pre-v21: no alwaysAbbreviateBalance field.
      settings: (() => {
        const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
        delete s.alwaysAbbreviateBalance;
        return s;
      })(),
      accounts: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [],
        },
      ],
    };
    const { data, migrated } = migrate(v20);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(
        validated.value.settings.device.mobile.alwaysAbbreviateBalance,
      ).toBe(DEFAULT_SETTINGS.alwaysAbbreviateBalance);
      expect(
        validated.value.settings.device.desktop.alwaysAbbreviateBalance,
      ).toBe(DEFAULT_SETTINGS.alwaysAbbreviateBalance);
    }
  });

  it("v19 → v20: seeds empty hide-lists for preset types and categories", () => {
    const v19 = {
      version: 19,
      activeSheetId: "s1",
      categories: [],
      types: [],
      transfers: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [],
        },
      ],
    };
    const { data, migrated } = migrate(v19);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.hiddenPresetTypeIds).toEqual([]);
      expect(validated.value.hiddenPresetCategoryIds).toEqual([]);
    }
  });

  it("v15 → v16: seeds an empty matchRules array", () => {
    const v15 = {
      version: 15,
      activeSheetId: "s1",
      categories: [],
      types: [],
      transfers: [],
      settings: { ...DEFAULT_SETTINGS },
      accounts: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      sheets: [
        {
          id: "s1",
          name: "Migrated",
          type: "budget",
          glyph: "wallet",
          color: "#61afef",
          description: "",
          items: [],
        },
      ],
    };
    const { data, migrated } = migrate(v15);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect((data as unknown as { matchRules: unknown[] }).matchRules).toEqual(
      [],
    );
  });
});

describe("nullable accountId & empty accounts", () => {
  it("accepts an AccountBudget with accountId: null", () => {
    const b = sampleData();
    firstItem(b).accountId = null;
    const r = parseUserData(serializeUserData(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(firstItem(r.data).accountId).toBeNull();
    }
  });

  it("accepts an empty accounts array when no AccountBudget references one", () => {
    const b = sampleData();
    // Detach every item from its account, then drop the accounts list.
    for (const sheet of b.sheets) {
      for (const item of sheet.items) {
        if (item.type === "accountBudget") item.accountId = null;
      }
    }
    b.accounts = [];
    const r = parseUserData(serializeUserData(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.accounts).toEqual([]);
    }
  });

  it("rejects an accountId that references an unknown account", () => {
    const b = sampleData();
    firstItem(b).accountId = "ghost";
    const r = parseUserData(serializeUserData(b));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/accountId/);
  });
});

describe("typeId field on rows", () => {
  it("round-trips through serialize/parse", () => {
    const b = sampleData();
    b.types = [
      {
        id: "type-1",
        name: "Mortgage",
        color: "#e06c75",
        glyph: "home",
        categoryId: "preset-cat-housing",
      },
      {
        id: "type-2",
        name: "Coffee",
        color: "#d19a66",
        glyph: "coffee",
        categoryId: "preset-cat-food",
      },
    ];
    firstItem(b).rows[0].typeId = "type-1";
    firstItem(b).rows[1].typeId = "type-2";
    const r = parseUserData(serializeUserData(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(firstItem(r.data).rows[0].typeId).toBe("type-1");
      expect(firstItem(r.data).rows[1].typeId).toBe("type-2");
    }
  });

  it("is omitted from JSON when undefined", () => {
    const b = sampleData();
    const text = serializeUserData(b);
    const raw = JSON.parse(text);
    for (const row of raw.sheets[0].items[0].rows) {
      expect(row.typeId).toBeUndefined();
    }
  });

  it("drops a dangling typeId silently rather than rejecting the load", () => {
    // Validator is forgiving here — same contract as Transfer's
    // typeId — so a deleted EntryType can't trap a row in zombie state.
    const b = sampleData();
    b.types = [
      {
        id: "type-1",
        name: "Mortgage",
        color: "#e06c75",
        glyph: "home",
        categoryId: "preset-cat-housing",
      },
    ];
    const raw = JSON.parse(serializeUserData(b));
    raw.sheets[0].items[0].rows[0].typeId = "ghost";
    const r = parseUserData(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(firstItem(r.data).rows[0].typeId).toBeUndefined();
    }
  });
});

describe("seriesId field on rows", () => {
  it("round-trips through serialize/parse", () => {
    const b = sampleData();
    firstItem(b).rows[0].seriesId = "series-1";
    firstItem(b).rows[1].seriesId = "series-1";
    const r = parseUserData(serializeUserData(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(firstItem(r.data).rows[0].seriesId).toBe("series-1");
      expect(firstItem(r.data).rows[1].seriesId).toBe("series-1");
    }
  });

  it("is omitted from JSON when undefined", () => {
    const b = sampleData();
    const text = serializeUserData(b);
    expect(text.includes("seriesId")).toBe(false);
  });

  it("rejects empty-string seriesId", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.sheets[0].items[0].rows[0].seriesId = "";
    const r = parseUserData(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/seriesId/);
  });
});

describe("readUserDataFromText", () => {
  it("returns fresh data when input is null", () => {
    const b = readUserDataFromText(null);
    expect(b.version).toBe(LATEST_VERSION);
    expect(b.sheets).toHaveLength(1);
    expect(b.categories).toEqual([]);
  });

  it("fresh data starts with no accounts and an unassigned budget", () => {
    const b = readUserDataFromText(null);
    expect(b.accounts).toEqual([]);
    expect(firstItem(b).accountId).toBeNull();
  });

  it("falls back to fresh data on garbage input", () => {
    const b = readUserDataFromText("not valid json at all");
    expect(b.sheets).toHaveLength(1);
  });

  it("returns the stored data when input is valid", () => {
    const original = sampleData();
    const restored = readUserDataFromText(JSON.stringify(original));
    expect(restored).toEqual(original);
  });
});

describe("suggestFilename", () => {
  it("uses an ISO-like date stamp", () => {
    // Local-time constructor so the assertion is timezone-independent.
    expect(suggestFilename(new Date(2026, 4, 16))).toBe(
      "budget-2026-05-16.json",
    );
  });
});
