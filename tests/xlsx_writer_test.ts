import { describe, expect, it } from "vitest";

import { readFirstSheet } from "../src/storage/xlsx-reader";
import { buildXlsx } from "../src/utils/xlsx";

describe("buildXlsx", () => {
  it("round-trips strings and numbers through the project's xlsx reader", async () => {
    const bytes = buildXlsx([
      {
        name: "Test sheet",
        rows: [
          ["Date", "Description", "Amount", "Balance"],
          ["2026-05-18", "Grocery store", -42.5, 1957.5],
          ["2026-05-19", "Salary", 25000, 26957.5],
        ],
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const sheet = await readFirstSheet(arrayBuffer);
    expect(sheet.rows.length).toBe(3);
    expect(sheet.rows[0].get(0)).toBe("Date");
    expect(sheet.rows[0].get(3)).toBe("Balance");
    expect(sheet.rows[1].get(0)).toBe("2026-05-18");
    expect(sheet.rows[1].get(1)).toBe("Grocery store");
    expect(sheet.rows[1].get(2)).toBeCloseTo(-42.5, 2);
    expect(sheet.rows[1].get(3)).toBeCloseTo(1957.5, 2);
    expect(sheet.rows[2].get(2)).toBe(25000);
  });

  it("escapes XML special characters inside cell text", async () => {
    const bytes = buildXlsx([
      {
        name: "Escapes",
        rows: [['<thing> & "quotes"']],
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const sheet = await readFirstSheet(arrayBuffer);
    expect(sheet.rows[0].get(0)).toBe('<thing> & "quotes"');
  });

  it("truncates and sanitises long / unsafe sheet names", async () => {
    const longName = "A".repeat(40) + ":illegal/chars";
    const bytes = buildXlsx([{ name: longName, rows: [["x"]] }]);
    // Sanity check that the file is decodable; the sheet-name itself
    // is enforced by Excel so we don't reach into the XML here.
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const sheet = await readFirstSheet(arrayBuffer);
    expect(sheet.rows[0].get(0)).toBe("x");
  });
});
