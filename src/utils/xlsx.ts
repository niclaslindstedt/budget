import { buildZip, type ZipEntry } from "./zip";

// Minimal XLSX writer. Produces a single-sheet workbook with optional
// bold-header row. Cells are typed as `string` or `number`; nulls fall
// through as empty cells. Bundle-cost-conscious — no external lib.
//
// The XLSX format is a ZIP container of XML files. The required parts
// are: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
// `xl/_rels/workbook.xml.rels`, and `xl/worksheets/sheet1.xml`. A tiny
// `xl/styles.xml` is included so the header row can render bold.

export type CellValue = string | number | null | undefined;

export type SheetData = {
  // Sheet tab name. Limited to 31 chars per the XLSX spec; longer
  // names get truncated.
  name: string;
  // 2D array of rows. The first row is rendered bold via the header
  // style. Empty arrays produce a header-only sheet.
  rows: readonly (readonly CellValue[])[];
};

const MIME_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const XLSX_MIME_TYPE = MIME_XLSX;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Convert a 0-based column index to its Excel letter (0 → A, 25 → Z,
// 26 → AA, …).
function columnLetter(index: number): string {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function sanitizeSheetName(name: string): string {
  const stripped = name.replace(/[\\/?*[\]:]/g, "");
  const truncated = stripped.slice(0, 31);
  return truncated.length === 0 ? "Sheet1" : truncated;
}

function buildSheetXml(rows: readonly (readonly CellValue[])[]): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  );
  if (rows.length > 0) {
    parts.push("<sheetData>");
    for (let r = 0; r < rows.length; r += 1) {
      const row = rows[r];
      const rowNum = r + 1;
      parts.push(`<row r="${rowNum}">`);
      const isHeader = r === 0;
      for (let c = 0; c < row.length; c += 1) {
        const cell = row[c];
        if (cell === null || cell === undefined || cell === "") continue;
        const ref = `${columnLetter(c)}${rowNum}`;
        const style = isHeader ? ' s="1"' : "";
        if (typeof cell === "number" && Number.isFinite(cell)) {
          parts.push(`<c r="${ref}"${style}><v>${cell}</v></c>`);
        } else {
          const text = escapeXml(String(cell));
          parts.push(
            `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`,
          );
        }
      }
      parts.push("</row>");
    }
    parts.push("</sheetData>");
  } else {
    parts.push("<sheetData/>");
  }
  parts.push("</worksheet>");
  return parts.join("");
}

// Construct an .xlsx file containing the supplied sheets. Returns the
// raw bytes; callers can hand them to `triggerDownload` with
// `XLSX_MIME_TYPE`.
export function buildXlsx(sheets: readonly SheetData[]): Uint8Array {
  const cleaned = sheets.map((s, i) => ({
    name: sanitizeSheetName(s.name || `Sheet${i + 1}`),
    rows: s.rows,
  }));

  const sheetXmlNames = cleaned.map((_, i) => `sheet${i + 1}.xml`);

  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ...sheetXmlNames.map(
      (n) =>
        `<Override PartName="/xl/worksheets/${n}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ),
    "</Types>",
  ].join("");

  const rootRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    "</Relationships>",
  ].join("");

  const workbookXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    "<sheets>",
    ...cleaned.map(
      (s, i) =>
        `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    ),
    "</sheets>",
    "</workbook>",
  ].join("");

  const workbookRels = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...cleaned.map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    ),
    `<Relationship Id="rId${cleaned.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
    "</Relationships>",
  ].join("");

  // Two cell formats: index 0 is the default (general), index 1 is the
  // bold header. The font index 1 is bold.
  const stylesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<fonts count="2">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    "</fonts>",
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
    '<borders count="1"><border/></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    '<cellXfs count="2">',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    "</cellXfs>",
    "</styleSheet>",
  ].join("");

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: stylesXml },
    ...cleaned.map(
      (s, i): ZipEntry => ({
        name: `xl/worksheets/sheet${i + 1}.xml`,
        data: buildSheetXml(s.rows),
      }),
    ),
  ];

  return buildZip(entries);
}
