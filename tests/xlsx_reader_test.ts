import { describe, expect, it } from "vitest";

import { readFirstSheet, parseColumnRef } from "../src/storage/xlsx-reader";

import { buildXlsx } from "./fixtures/build-xlsx";

describe("xlsx-reader", () => {
  it("decodes a small synthetic sheet end-to-end", async () => {
    const xlsx = buildXlsx([
      ["Kontonummer", "9150-897.480-4"],
      ["Period", "2026-05-17 - 2026-05-18"],
      [],
      ["Bokf. datum", "Beskrivning", "Belopp", "Saldo"],
      ["2026-05-18", "Swish till Amazon Sweden", -1346, 21280.51],
    ]);
    const sheet = await readFirstSheet(xlsx);
    expect(sheet.rows.length).toBe(5);
    // Row 0: ["Kontonummer", "9150-897.480-4"]
    expect(sheet.rows[0].get(0)).toBe("Kontonummer");
    expect(sheet.rows[0].get(1)).toBe("9150-897.480-4");
    // Row 3: header row
    expect(sheet.rows[3].get(0)).toBe("Bokf. datum");
    expect(sheet.rows[3].get(3)).toBe("Saldo");
    // Row 4: first transaction — amount and balance are numeric
    expect(sheet.rows[4].get(0)).toBe("2026-05-18");
    expect(sheet.rows[4].get(1)).toBe("Swish till Amazon Sweden");
    expect(sheet.rows[4].get(2)).toBe(-1346);
    expect(sheet.rows[4].get(3)).toBeCloseTo(21280.51, 2);
  });

  it("translates column references", () => {
    expect(parseColumnRef("A1")).toBe(0);
    expect(parseColumnRef("B12")).toBe(1);
    expect(parseColumnRef("Z9")).toBe(25);
    expect(parseColumnRef("AA1")).toBe(26);
    expect(parseColumnRef("AB42")).toBe(27);
  });
});
