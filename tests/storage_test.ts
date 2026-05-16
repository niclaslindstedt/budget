import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { createDefaultSheet } from "../src/data/sheet";
import type { UserData } from "../src/data/types";
import { validateUserData } from "../src/data/validate";
import {
  parseUserData,
  serializeUserData,
  suggestFilename,
} from "../src/storage/file";
import { readUserDataFromText } from "../src/storage/local";

function sampleData(): UserData {
  const a = createDefaultSheet("First");
  const b = createDefaultSheet("Second");
  const dateCol = a.columns.find((c) => c.type === "date")!;
  const amountCol = a.columns.find((c) => c.type === "amount")!;
  a.rows = [
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
    version: 4,
    sheets: [a, b],
    activeSheetId: b.id,
    categories: [{ id: "cat-1", name: "Rent", color: "#e06c75", icon: "home" }],
    settings: { ...DEFAULT_SETTINGS },
  };
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
        rows: s.rows.map((r) => ({ cells: r.cells, id: r.id })),
        name: s.name,
        columns: s.columns.map((c) => ({
          label: c.label,
          type: c.type,
          id: c.id,
        })),
        id: s.id,
      })),
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
    expect(topKeys.slice(0, 5)).toEqual([
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
    raw.sheets[0].columns[0].type = "color";
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
    const sheet = b.sheets[0];
    sheet.rows[0].cells["ghost-column-id"] = "stray";
    const r = validateUserData(b);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(
        r.value.sheets[0].rows[0].cells["ghost-column-id"],
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
    const sheet = (
      data.sheets as Array<{ columns: Array<{ type: string }> }>
    )[0];
    const types = sheet.columns.map((c) => c.type);
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
    const sheet = (data.sheets as Array<{ columns: Array<{ id: string }> }>)[0];
    expect(sheet.columns.map((c) => c.id)).toEqual(["c1", "cx", "c2"]);
  });

  it("v3 → v4: adds settings with defaults, preserves data", () => {
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
    const sheet = (data.sheets as Array<{ rows: Array<{ id: string }> }>)[0];
    expect(sheet.rows[0].id).toBe("r1");
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
  });

  it("v2 → v3 → v4: bumps version, preserves data, keeps existing seriesIds", () => {
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
    const sheet = (data.sheets as Array<{ rows: Array<{ id: string }> }>)[0];
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0].id).toBe("r1");
  });
});

describe("seriesId field on rows", () => {
  it("round-trips through serialize/parse", () => {
    const b = sampleData();
    b.sheets[0].rows[0].seriesId = "series-1";
    b.sheets[0].rows[1].seriesId = "series-1";
    const r = parseUserData(serializeUserData(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sheets[0].rows[0].seriesId).toBe("series-1");
      expect(r.data.sheets[0].rows[1].seriesId).toBe("series-1");
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
    raw.sheets[0].rows[0].seriesId = "";
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
