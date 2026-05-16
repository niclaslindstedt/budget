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
  return { version: 1, sheets: [a, b], activeSheetId: b.id };
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
    expect(topKeys.slice(0, 3)).toEqual(["activeSheetId", "sheets", "version"]);
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
});

describe("readBudgetFromText", () => {
  it("returns a fresh budget when input is null", () => {
    const b = readBudgetFromText(null);
    expect(b.version).toBe(1);
    expect(b.sheets).toHaveLength(1);
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
