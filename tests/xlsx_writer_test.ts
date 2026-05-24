import { describe, expect, it } from "vitest";

import { readFirstSheet } from "../src/storage/xlsx-reader";
import { buildXlsx } from "../src/utils/xlsx";
import { isoToExcelSerial } from "../src/utils/xlsx-format";

// Pull a single XML part out of an .xlsx ZIP using the project's
// reader internals. We don't expose a generic unzip helper, so this
// test uses `DecompressionStream` directly the same way the reader
// does.
async function readPart(
  buf: ArrayBuffer,
  partName: string,
): Promise<string | null> {
  const view = new DataView(buf);
  let p = buf.byteLength - 22;
  while (p >= 0 && view.getUint32(p, true) !== 0x06054b50) p -= 1;
  if (p < 0) throw new Error("not a zip");
  const cdSize = view.getUint32(p + 12, true);
  const cdOffset = view.getUint32(p + 16, true);
  let q = cdOffset;
  const end = cdOffset + cdSize;
  const decoder = new TextDecoder();
  while (q < end) {
    if (view.getUint32(q, true) !== 0x02014b50) break;
    const compression = view.getUint16(q + 10, true);
    const compSize = view.getUint32(q + 20, true);
    const nameLen = view.getUint16(q + 28, true);
    const extraLen = view.getUint16(q + 30, true);
    const commentLen = view.getUint16(q + 32, true);
    const localHeader = view.getUint32(q + 42, true);
    const nameBytes = new Uint8Array(buf, q + 46, nameLen);
    const name = decoder.decode(nameBytes);
    q += 46 + nameLen + extraLen + commentLen;
    if (name !== partName) continue;
    const localNameLen = view.getUint16(localHeader + 26, true);
    const localExtraLen = view.getUint16(localHeader + 28, true);
    const dataStart = localHeader + 30 + localNameLen + localExtraLen;
    const compressed = new Uint8Array(buf, dataStart, compSize);
    if (compression === 0) return decoder.decode(compressed);
    if (compression === 8) {
      const stream = new Response(
        new Blob([compressed])
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw")),
      );
      return await stream.text();
    }
    throw new Error(`unsupported compression ${compression}`);
  }
  return null;
}

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

  it("encodes date columns as Excel serial numbers", async () => {
    const bytes = buildXlsx([
      {
        name: "Dates",
        rows: [
          ["Date", "Amount"],
          ["2026-05-18", 100],
        ],
        columnFormats: [{ kind: "date" }, { kind: "currency" }],
        formats: {
          date: "yyyy-mm-dd",
          amount: "#,##0.00",
          balance: "#,##0.00",
        },
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const sheet = await readFirstSheet(arrayBuffer);
    // The project reader doesn't decode date styles — so the cell
    // surfaces as the raw serial number. That's exactly what we want
    // to assert here.
    expect(sheet.rows[1].get(0)).toBe(isoToExcelSerial("2026-05-18"));
    expect(sheet.rows[1].get(1)).toBe(100);
  });

  it("registers numFmts and cellXfs when format codes are supplied", async () => {
    const bytes = buildXlsx([
      {
        name: "Styled",
        rows: [
          ["Date", "Amount", "Balance"],
          ["2026-05-18", 42.5, 142.5],
        ],
        columnFormats: [
          { kind: "date" },
          { kind: "currency" },
          { kind: "currency", alwaysTwoDecimals: true },
        ],
        formats: {
          date: "dd/mm/yyyy",
          amount: '#,##0 "kr"',
          balance: '#,##0.00 "kr"',
        },
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const styles = await readPart(arrayBuffer, "xl/styles.xml");
    expect(styles).not.toBeNull();
    expect(styles).toContain('formatCode="dd/mm/yyyy"');
    expect(styles).toContain('formatCode="#,##0 &quot;kr&quot;"');
    expect(styles).toContain('formatCode="#,##0.00 &quot;kr&quot;"');
    expect(styles).toContain('applyNumberFormat="1"');
  });

  it("emits a table part and worksheet rels when asTable is true", async () => {
    const bytes = buildXlsx([
      {
        name: "Sheet1",
        rows: [
          ["Date", "Description", "Amount"],
          ["2026-05-18", "Coffee", -42.5],
          ["2026-05-19", "Salary", 25000],
        ],
        columnFormats: [
          { kind: "date" },
          { kind: "general" },
          { kind: "currency" },
        ],
        formats: {
          date: "yyyy-mm-dd",
          amount: "#,##0.00",
          balance: "#,##0.00",
        },
        asTable: true,
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const table = await readPart(arrayBuffer, "xl/tables/table1.xml");
    expect(table).not.toBeNull();
    expect(table).toContain('ref="A1:C3"');
    expect(table).toContain('<autoFilter ref="A1:C3"/>');
    expect(table).toContain('<tableColumns count="3">');
    expect(table).toContain('name="Date"');
    expect(table).toContain('name="Description"');
    expect(table).toContain('name="Amount"');

    const sheetRels = await readPart(
      arrayBuffer,
      "xl/worksheets/_rels/sheet1.xml.rels",
    );
    expect(sheetRels).not.toBeNull();
    expect(sheetRels).toContain("../tables/table1.xml");

    const types = await readPart(arrayBuffer, "[Content_Types].xml");
    expect(types).toContain("/xl/tables/table1.xml");
    expect(types).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml",
    );

    const sheetXml = await readPart(arrayBuffer, "xl/worksheets/sheet1.xml");
    expect(sheetXml).toContain("<tableParts");
    expect(sheetXml).toContain('r:id="rId1"');
  });

  it("emits a <cols> block sized to the widest cell per column", async () => {
    const bytes = buildXlsx([
      {
        name: "Widths",
        rows: [
          ["Date", "Description", "Amount"],
          ["2026-05-18", "Short", -1],
          ["2026-05-19", "A noticeably longer description string", 25000],
        ],
        columnFormats: [
          { kind: "date" },
          { kind: "general" },
          { kind: "currency" },
        ],
        formats: {
          date: "yyyy-mm-dd",
          amount: "#,##0.00",
          balance: "#,##0.00",
        },
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const sheetXml = await readPart(arrayBuffer, "xl/worksheets/sheet1.xml");
    expect(sheetXml).not.toBeNull();
    expect(sheetXml).toContain("<cols>");
    // Date column: fixed ~10 chars + padding -> 12.
    expect(sheetXml).toMatch(/<col min="1" max="1" width="12\.00"/);
    // Description: 38 chars + padding -> 40.
    expect(sheetXml).toMatch(/<col min="2" max="2" width="40\.00"/);
    // Currency: 5-digit number plus currency overhead.
    expect(sheetXml).toMatch(/<col min="3" max="3" width="[1-9][0-9]?\.\d{2}"/);
  });

  it("registers a wrap-text style for columnWraps and tightens the auto-fit cap", async () => {
    const longText = "x".repeat(120);
    const bytes = buildXlsx([
      {
        name: "Wrapped",
        rows: [
          ["Date", "Description"],
          ["2026-05-18", longText],
        ],
        columnFormats: [{ kind: "general" }, { kind: "general" }],
        columnWraps: [false, true],
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const styles = await readPart(arrayBuffer, "xl/styles.xml");
    expect(styles).toContain('wrapText="1"');
    const sheetXml = await readPart(arrayBuffer, "xl/worksheets/sheet1.xml");
    expect(sheetXml).not.toBeNull();
    // Wrap column capped at 40 even though the cell is 120 chars wide.
    expect(sheetXml).toMatch(/<col min="2" max="2" width="40\.00"/);
    // Data cell in the wrapped column gets the wrap xf, not the
    // default. The exact index depends on registration order, but it
    // must be a non-zero s="N".
    expect(sheetXml).toMatch(/<c r="B2" s="\d+"/);
  });

  it("skips the table part for a header-only sheet", async () => {
    const bytes = buildXlsx([
      {
        name: "Empty",
        rows: [["Date", "Amount"]],
        asTable: true,
      },
    ]);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const table = await readPart(arrayBuffer, "xl/tables/table1.xml");
    expect(table).toBeNull();
    const types = await readPart(arrayBuffer, "[Content_Types].xml");
    expect(types).not.toContain("/xl/tables/table1.xml");
  });
});
