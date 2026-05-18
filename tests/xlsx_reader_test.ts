import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readFirstSheet, parseColumnRef } from "../src/storage/xlsx-reader";

function fixtureBuffer(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, "fixtures", name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe("xlsx-reader", () => {
  it("decodes the Skandiabanken sample", async () => {
    const sheet = await readFirstSheet(fixtureBuffer("skandia-sample.xlsx"));
    expect(sheet.rows.length).toBeGreaterThanOrEqual(8);
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
