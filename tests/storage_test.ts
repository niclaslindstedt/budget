import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
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
      id: "row-1",
      cells: { [dateCol.id]: "2026-05-01", [amountCol.id]: 42 },
    },
    {
      id: "row-2",
      cells: { [dateCol.id]: "2026-05-15", [amountCol.id]: -10 },
    },
  ];
  return {
    version: 7,
    sheets: [a, b],
    activeSheetId: b.id,
    accounts: [{ id: accountId, name: "Default" }],
    categories: [{ id: "cat-1", name: "Rent", color: "#e06c75", icon: "home" }],
    settings: { ...DEFAULT_SETTINGS },
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
            rows: ab.rows.map((r) => ({ cells: r.cells, id: r.id })),
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
      categories: b.categories,
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
    expect(topKeys.slice(0, 6)).toEqual([
      "accounts",
      "activeSheetId",
      "categories",
      "settings",
      "sheets",
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

  it("rejects unknown category icon", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.categories[0].icon = "not-an-icon";
    const r = parseUserData(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown category icon/);
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

  it("defaults settings to DEFAULT_SETTINGS when missing", () => {
    const b = sampleData();
    const withoutSettings: Record<string, unknown> = { ...b };
    delete withoutSettings.settings;
    const r = validateUserData(withoutSettings);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("snaps individual invalid settings back to their default", () => {
    const b = sampleData();
    const raw = JSON.parse(serializeUserData(b));
    raw.settings.startOfMonth = 99;
    raw.settings.dateFormat = "wat";
    raw.settings.decimalSeparator = "_";
    raw.settings.thousandsSeparator = "X";
    raw.settings.currency = "";
    raw.settings.formatNumbers = "yes";
    const r = validateUserData(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.settings).toEqual(DEFAULT_SETTINGS);
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

  it("v1 → latest: adds categories array and a category column to every sheet", () => {
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
    // category sits right after description
    expect(types).toEqual([
      "date",
      "description",
      "category",
      "amount",
      "balance",
      "completed",
    ]);
    // Migrated data validates cleanly under the latest validator.
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v1 → latest: leaves an already-present category column alone", () => {
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
        items: Array<{ columns: Array<{ id: string }> }>;
      }>
    )[0].items[0];
    expect(item.columns.map((c) => c.id)).toEqual(["c1", "cx", "c2"]);
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
    expect(data.settings).toEqual(DEFAULT_SETTINGS);
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
    expect(sheets[0].items[0].columns).toHaveLength(3);
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
