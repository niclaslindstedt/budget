import { isoToExcelSerial } from "./xlsx-format";
import { buildZip, type ZipEntry } from "./zip";

// Minimal XLSX writer. Produces a workbook with optional bold-header
// row, optional per-column number-format styles, and optional Excel
// Table (autoFilter + banded rows) over the data range. Bundle-cost-
// conscious — no external lib.
//
// The XLSX format is a ZIP container of XML files. The required parts
// are: `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
// `xl/_rels/workbook.xml.rels`, and `xl/worksheets/sheet1.xml`. A tiny
// `xl/styles.xml` is always included so the header row can render
// bold; per-sheet date / currency / balance number formats register
// extra `numFmts` and `cellXfs` entries when callers opt in. When a
// sheet sets `asTable: true`, the writer additionally emits an
// `xl/tables/tableN.xml` part and a `xl/worksheets/_rels/sheetN.xml.rels`
// pointing the worksheet at it.

export type CellValue = string | number | null | undefined;

// Per-column format hint. Cells in a `date` column are converted from
// `YYYY-MM-DD` strings to Excel serial-number values; cells in a
// `currency` column are emitted as numbers with the currency style;
// `general` cells fall through with today's behaviour (numbers as
// numbers, strings as inline strings).
export type ColumnFormat =
  | { kind: "general" }
  | { kind: "date" }
  | { kind: "currency"; alwaysTwoDecimals?: boolean };

// Per-sheet format codes consumed when `columnFormats` references a
// `date` / `currency` cell. Codes are Excel format strings (e.g.
// `yyyy-mm-dd`, `[$-409]#,##0.00 "kr"`). Build them with the helpers
// in `xlsx-format.ts`.
export type SheetFormats = {
  date: string;
  amount: string;
  balance: string;
};

export type SheetData = {
  // Sheet tab name. Limited to 31 chars per the XLSX spec; longer
  // names get truncated.
  name: string;
  // 2D array of rows. The first row is rendered bold via the header
  // style. Empty arrays produce a header-only sheet.
  rows: readonly (readonly CellValue[])[];
  // Optional per-column formatting hint. When omitted every column
  // renders as `general`. When provided, the array length should
  // match the row width — extras are ignored, missing entries fall
  // back to `general`.
  columnFormats?: readonly ColumnFormat[];
  // Format codes used when any column in this sheet is `date` /
  // `currency`. Required if `columnFormats` references those kinds.
  formats?: SheetFormats;
  // When true, the data range becomes an Excel Table — autofilter
  // dropdowns on the header, sortable header chevrons, banded rows.
  // Skipped silently when the sheet has zero data rows (Excel rejects
  // a table whose range only covers the header).
  asTable?: boolean;
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

// Resolved style indices baked into `xl/styles.xml`. The first two
// are always present; the last three only appear when at least one
// sheet opts into a `date` / `currency` column.
type StyleIndices = {
  default: number;
  header: number;
  date: number | null;
  amount: number | null;
  balance: number | null;
};

// Decide which styles each sheet needs and emit the shared styles
// part. Returns the resolved indices so sheet writers can stamp the
// right `s="N"` attribute on each cell.
function buildStylesXml(sheets: readonly SheetData[]): {
  xml: string;
  indices: StyleIndices;
} {
  let dateFmt: string | null = null;
  let amountFmt: string | null = null;
  let balanceFmt: string | null = null;
  for (const sheet of sheets) {
    if (!sheet.columnFormats || !sheet.formats) continue;
    for (const col of sheet.columnFormats) {
      if (col.kind === "date") dateFmt = sheet.formats.date;
      else if (col.kind === "currency") {
        if (col.alwaysTwoDecimals) balanceFmt = sheet.formats.balance;
        else amountFmt = sheet.formats.amount;
      }
    }
  }

  // Custom format ids start at 164; 0..163 are reserved built-ins.
  const numFmts: { id: number; code: string }[] = [];
  let nextId = 164;
  let dateNumFmtId: number | null = null;
  let amountNumFmtId: number | null = null;
  let balanceNumFmtId: number | null = null;
  if (dateFmt !== null) {
    dateNumFmtId = nextId++;
    numFmts.push({ id: dateNumFmtId, code: dateFmt });
  }
  if (amountFmt !== null) {
    amountNumFmtId = nextId++;
    numFmts.push({ id: amountNumFmtId, code: amountFmt });
  }
  if (balanceFmt !== null) {
    balanceNumFmtId = nextId++;
    numFmts.push({ id: balanceNumFmtId, code: balanceFmt });
  }

  // Indices 0 and 1 are the unconditional general / header xfs;
  // optional indices follow in registration order.
  const cellXfs: string[] = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
  ];
  const indices: StyleIndices = {
    default: 0,
    header: 1,
    date: null,
    amount: null,
    balance: null,
  };
  if (dateNumFmtId !== null) {
    indices.date = cellXfs.length;
    cellXfs.push(
      `<xf numFmtId="${dateNumFmtId}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    );
  }
  if (amountNumFmtId !== null) {
    indices.amount = cellXfs.length;
    cellXfs.push(
      `<xf numFmtId="${amountNumFmtId}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    );
  }
  if (balanceNumFmtId !== null) {
    indices.balance = cellXfs.length;
    cellXfs.push(
      `<xf numFmtId="${balanceNumFmtId}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`,
    );
  }

  const numFmtsXml =
    numFmts.length === 0
      ? ""
      : `<numFmts count="${numFmts.length}">${numFmts
          .map(
            (n) =>
              `<numFmt numFmtId="${n.id}" formatCode="${escapeXml(n.code)}"/>`,
          )
          .join("")}</numFmts>`;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    numFmtsXml,
    '<fonts count="2">',
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    "</fonts>",
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>',
    '<borders count="1"><border/></borders>',
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
    `<cellXfs count="${cellXfs.length}">`,
    cellXfs.join(""),
    "</cellXfs>",
    "</styleSheet>",
  ].join("");

  return { xml, indices };
}

// Resolve the style index for a single cell. Header row always uses
// the header style; otherwise the column format (when supplied) picks
// the matching xf, with a fall-through to default when a format kind
// was requested but its xf wasn't registered (defensive — shouldn't
// happen in practice).
function styleForCell(
  isHeader: boolean,
  columnFormat: ColumnFormat | undefined,
  indices: StyleIndices,
): number {
  if (isHeader) return indices.header;
  if (!columnFormat || columnFormat.kind === "general") return indices.default;
  if (columnFormat.kind === "date") {
    return indices.date ?? indices.default;
  }
  // currency
  if (columnFormat.alwaysTwoDecimals) {
    return indices.balance ?? indices.default;
  }
  return indices.amount ?? indices.default;
}

function buildSheetXml(
  sheet: SheetData,
  indices: StyleIndices,
  tableRelId: string | null,
): string {
  const rows = sheet.rows;
  const columnFormats = sheet.columnFormats ?? [];
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
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
        const colFmt = columnFormats[c];
        const styleIdx = styleForCell(isHeader, colFmt, indices);
        const style = styleIdx === 0 ? "" : ` s="${styleIdx}"`;

        // Date column on a data row: convert ISO string → Excel serial.
        if (!isHeader && colFmt && colFmt.kind === "date") {
          if (typeof cell !== "string") continue;
          const serial = isoToExcelSerial(cell);
          if (serial === null) continue;
          parts.push(`<c r="${ref}"${style}><v>${serial}</v></c>`);
          continue;
        }
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
  if (tableRelId !== null) {
    parts.push(
      `<tableParts count="1"><tablePart r:id="${tableRelId}"/></tableParts>`,
    );
  }
  parts.push("</worksheet>");
  return parts.join("");
}

// Excel rejects duplicate column names inside a table. Sanitise the
// header row by replacing empty / duplicate cells with a synthetic
// `Column N` placeholder so the table part is always valid.
function tableColumnNames(headerRow: readonly CellValue[]): string[] {
  const seen = new Set<string>();
  return headerRow.map((cell, i) => {
    const name =
      typeof cell === "string" && cell !== ""
        ? cell
        : typeof cell === "number" && Number.isFinite(cell)
          ? String(cell)
          : `Column${i + 1}`;
    let candidate = name;
    let suffix = 2;
    while (seen.has(candidate.toLowerCase())) {
      candidate = `${name}${suffix}`;
      suffix += 1;
    }
    seen.add(candidate.toLowerCase());
    return candidate;
  });
}

function buildTableXml(
  tableId: number,
  sheet: SheetData,
): { xml: string; columns: number } | null {
  if (sheet.rows.length < 2) return null;
  const headerRow = sheet.rows[0];
  const cols = headerRow.length;
  if (cols === 0) return null;
  // Widest data row width — table `ref` must cover every cell that
  // could fall inside the table. We assume the caller emits a square
  // table; in practice every export does.
  const lastCol = columnLetter(cols - 1);
  const lastRow = sheet.rows.length;
  const ref = `A1:${lastCol}${lastRow}`;
  const names = tableColumnNames(headerRow);
  const cols_xml = names
    .map((n, i) => `<tableColumn id="${i + 1}" name="${escapeXml(n)}"/>`)
    .join("");
  const xml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${tableId}" name="Table${tableId}" displayName="Table${tableId}" ref="${ref}" totalsRowShown="0">`,
    `<autoFilter ref="${ref}"/>`,
    `<tableColumns count="${cols}">${cols_xml}</tableColumns>`,
    '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>',
    "</table>",
  ].join("");
  return { xml, columns: cols };
}

// Construct an .xlsx file containing the supplied sheets. Returns the
// raw bytes; callers can hand them to `triggerDownload` with
// `XLSX_MIME_TYPE`.
export function buildXlsx(sheets: readonly SheetData[]): Uint8Array {
  const cleaned: SheetData[] = sheets.map((s, i) => ({
    ...s,
    name: sanitizeSheetName(s.name || `Sheet${i + 1}`),
  }));

  // Decide which sheets get a table part. A sheet must (a) opt in via
  // `asTable`, (b) have at least one data row, (c) have a non-empty
  // header. `tableInfo[i]` is non-null when sheet i has a table.
  const tableInfo: ({ xml: string; tableId: number } | null)[] = cleaned.map(
    (sheet, i) => {
      if (!sheet.asTable) return null;
      const built = buildTableXml(i + 1, sheet);
      if (!built) return null;
      return { xml: built.xml, tableId: i + 1 };
    },
  );

  const sheetXmlNames = cleaned.map((_, i) => `sheet${i + 1}.xml`);

  const { xml: stylesXml, indices } = buildStylesXml(cleaned);

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
    ...tableInfo
      .filter((t): t is { xml: string; tableId: number } => t !== null)
      .map(
        (t) =>
          `<Override PartName="/xl/tables/table${t.tableId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
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

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/styles.xml", data: stylesXml },
  ];

  for (let i = 0; i < cleaned.length; i += 1) {
    const sheet = cleaned[i];
    const info = tableInfo[i];
    const tableRelId = info ? "rId1" : null;
    entries.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: buildSheetXml(sheet, indices, tableRelId),
    });
    if (info) {
      const sheetRels = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${info.tableId}.xml"/>`,
        "</Relationships>",
      ].join("");
      entries.push({
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data: sheetRels,
      });
      entries.push({
        name: `xl/tables/table${info.tableId}.xml`,
        data: info.xml,
      });
    }
  }

  return buildZip(entries);
}
