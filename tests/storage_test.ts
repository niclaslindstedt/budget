import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { createDefaultSheet } from "../src/data/sheet";
import type { Budget } from "../src/data/types";
import { validateBudget } from "../src/data/validate";
import {
  parseBudget,
  serializeBudget,
  suggestFilename,
} from "../src/storage/file";
import { readBudgetFromText } from "../src/storage/local";

function sampleBudget(): Budget {
  const a = createDefaultSheet("First");
  const b = createDefaultSheet("Second");
  const dateCol = a.columns.find((c) => c.type === "date")!;
  const amountCol = a.columns.find((c) => c.type === "amount")!;
  a.openingBalance = 100;
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
    version: 2,
    sheets: [a, b],
    activeSheetId: b.id,
    categories: [{ id: "cat-1", name: "Rent", color: "#e06c75", icon: "home" }],
  };
}

describe("serializeBudget", () => {
  it("round-trips through parseBudget", () => {
    const b = sampleBudget();
    const result = parseBudget(serializeBudget(b));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.budget).toEqual(b);
      expect(result.migrated).toBe(false);
    }
  });

  it("is byte-stable regardless of source key order", () => {
    const b = sampleBudget();
    const text1 = serializeBudget(b);
    // Rebuild the same budget with keys inserted in a different order at
    // every level. The serializer should erase that difference.
    const reordered = {
      activeSheetId: b.activeSheetId,
      sheets: b.sheets.map((s) => ({
        rows: s.rows.map((r) => ({ cells: r.cells, id: r.id })),
        openingBalance: s.openingBalance,
        name: s.name,
        columns: s.columns.map((c) => ({
          label: c.label,
          type: c.type,
          id: c.id,
        })),
        id: s.id,
      })),
      categories: b.categories,
      version: b.version,
    } as Budget;
    expect(serializeBudget(reordered)).toBe(text1);
  });

  it("sorts object keys recursively", () => {
    const b = sampleBudget();
    const text = serializeBudget(b);
    // Top-level keys appear in alphabetical order.
    const topKeys = Array.from(text.matchAll(/^\s{2}"([^"]+)":/gm)).map(
      (m) => m[1],
    );
    expect(topKeys.slice(0, 4)).toEqual([
      "activeSheetId",
      "categories",
      "sheets",
      "version",
    ]);
  });

  it("ends with a trailing newline", () => {
    expect(serializeBudget(sampleBudget()).endsWith("\n")).toBe(true);
  });
});

describe("parseBudget — error paths", () => {
  it("rejects malformed JSON", () => {
    const r = parseBudget("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Invalid JSON/);
  });

  it("rejects missing version", () => {
    const r = parseBudget(JSON.stringify({ sheets: [], activeSheetId: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version/);
  });

  it("rejects newer-than-supported version with a clear message", () => {
    const r = parseBudget(
      JSON.stringify({ version: LATEST_VERSION + 5, sheets: [] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it("rejects unknown column type", () => {
    const b = sampleBudget();
    const raw = JSON.parse(serializeBudget(b));
    raw.sheets[0].columns[0].type = "color";
    const r = parseBudget(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown column type/);
  });

  it("rejects duplicate sheet ids", () => {
    const b = sampleBudget();
    const raw = JSON.parse(serializeBudget(b));
    raw.sheets[1].id = raw.sheets[0].id;
    const r = parseBudget(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/duplicate id/);
  });

  it("rejects unknown category icon", () => {
    const b = sampleBudget();
    const raw = JSON.parse(serializeBudget(b));
    raw.categories[0].icon = "not-an-icon";
    const r = parseBudget(JSON.stringify(raw));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown category icon/);
  });
});

describe("validateBudget — soft recovery", () => {
  it("drops cells referencing missing columns rather than failing", () => {
    const b = sampleBudget();
    const sheet = b.sheets[0];
    sheet.rows[0].cells["ghost-column-id"] = "stray";
    const r = validateBudget(b);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(
        r.value.sheets[0].rows[0].cells["ghost-column-id"],
      ).toBeUndefined();
    }
  });

  it("recovers a dangling activeSheetId to the first sheet", () => {
    const b = sampleBudget();
    const r = validateBudget({ ...b, activeSheetId: "does-not-exist" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.activeSheetId).toBe(b.sheets[0].id);
  });

  it("defaults categories to an empty array when missing", () => {
    const b = sampleBudget();
    const withoutCategories: Record<string, unknown> = { ...b };
    delete withoutCategories.categories;
    const r = validateBudget(withoutCategories);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.categories).toEqual([]);
  });
});

describe("migrate", () => {
  it("is a no-op for the current version", () => {
    const b = sampleBudget();
    const { budget, migrated } = migrate(b);
    expect(migrated).toBe(false);
    expect(budget).toEqual(b);
  });

  it("throws for a version newer than supported", () => {
    expect(() => migrate({ version: LATEST_VERSION + 1 })).toThrow();
  });

  it("v1 → v2: adds categories array and a category column to every sheet", () => {
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
    const { budget, migrated } = migrate(v1);
    expect(migrated).toBe(true);
    expect(budget.version).toBe(2);
    expect(budget.categories).toEqual([]);
    const sheet = (
      budget.sheets as Array<{ columns: Array<{ type: string }> }>
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
    // Migrated budget validates cleanly under the latest validator.
    const validated = validateBudget(budget);
    expect(validated.ok).toBe(true);
  });

  it("v1 → v2: leaves an already-present category column alone", () => {
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
    const { budget } = migrate(v1);
    const sheet = (
      budget.sheets as Array<{ columns: Array<{ id: string }> }>
    )[0];
    expect(sheet.columns.map((c) => c.id)).toEqual(["c1", "cx", "c2"]);
  });
});

describe("readBudgetFromText", () => {
  it("returns a fresh budget when input is null", () => {
    const b = readBudgetFromText(null);
    expect(b.version).toBe(LATEST_VERSION);
    expect(b.sheets).toHaveLength(1);
    expect(b.categories).toEqual([]);
  });

  it("falls back to a fresh budget on garbage input", () => {
    const b = readBudgetFromText("not valid json at all");
    expect(b.sheets).toHaveLength(1);
  });

  it("returns the stored budget when input is valid", () => {
    const original = sampleBudget();
    const restored = readBudgetFromText(JSON.stringify(original));
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
