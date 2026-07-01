import { describe, expect, it } from "vitest";

import {
  parseSheetSlug,
  resolveSheetSlug,
  sheetSlug,
} from "../src/data/sheet-routing";
import type { Sheet, SheetType } from "../src/data/types";

// Minimal Sheet stubs — the routing helpers only read `id` and `type`.
function sheet(id: string, type: SheetType): Sheet {
  return {
    id,
    name: id,
    type,
    glyph: "wallet",
    color: "#000000",
    description: "",
    items: [],
  };
}

describe("sheetSlug", () => {
  const sheets = [
    sheet("b1", "budget"),
    sheet("s1", "salary"),
    sheet("b2", "budget"),
    sheet("b3", "budget"),
  ];

  it("uses the bare type for the first sheet of a type", () => {
    expect(sheetSlug(sheets, "b1")).toBe("budget");
    expect(sheetSlug(sheets, "s1")).toBe("salary");
  });

  it("suffixes the 1-based ordinal for later sheets of the same type", () => {
    expect(sheetSlug(sheets, "b2")).toBe("budget-2");
    expect(sheetSlug(sheets, "b3")).toBe("budget-3");
  });

  it("returns null for an unknown id", () => {
    expect(sheetSlug(sheets, "nope")).toBeNull();
    expect(sheetSlug(sheets, null)).toBeNull();
  });
});

describe("parseSheetSlug", () => {
  it("parses a bare type as ordinal 0", () => {
    expect(parseSheetSlug("budget")).toEqual({ type: "budget", ordinal: 0 });
    expect(parseSheetSlug("scenarios")).toEqual({
      type: "scenarios",
      ordinal: 0,
    });
  });

  it("parses a `-n` suffix (n ≥ 2) as ordinal n-1", () => {
    expect(parseSheetSlug("budget-2")).toEqual({ type: "budget", ordinal: 1 });
    expect(parseSheetSlug("salary-10")).toEqual({ type: "salary", ordinal: 9 });
  });

  it("rejects unknown types and non-canonical suffixes", () => {
    expect(parseSheetSlug("income")).toBeNull();
    expect(parseSheetSlug("budget-0")).toBeNull();
    expect(parseSheetSlug("budget-1")).toBeNull();
    expect(parseSheetSlug("budget-")).toBeNull();
    expect(parseSheetSlug("budget-x")).toBeNull();
    expect(parseSheetSlug("")).toBeNull();
  });
});

describe("resolveSheetSlug", () => {
  const sheets = [
    sheet("b1", "budget"),
    sheet("b2", "budget"),
    sheet("a1", "accounts"),
  ];

  it("resolves a bare type to the first sheet of that type", () => {
    expect(resolveSheetSlug(sheets, "budget")?.sheet?.id).toBe("b1");
    expect(resolveSheetSlug(sheets, "accounts")?.sheet?.id).toBe("a1");
  });

  it("resolves an ordinal slug to the nth sheet of that type", () => {
    expect(resolveSheetSlug(sheets, "budget-2")?.sheet?.id).toBe("b2");
  });

  it("returns a null sheet (but a valid type) when none sits at the ordinal", () => {
    const salary = resolveSheetSlug(sheets, "salary");
    expect(salary).toEqual({ type: "salary", ordinal: 0, sheet: null });
    const third = resolveSheetSlug(sheets, "budget-3");
    expect(third).toEqual({ type: "budget", ordinal: 2, sheet: null });
  });

  it("returns null for a slug that isn't a valid sheet address", () => {
    expect(resolveSheetSlug(sheets, "income")).toBeNull();
    expect(resolveSheetSlug(sheets, "budget-1")).toBeNull();
  });
});
