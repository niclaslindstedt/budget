import { readFirstSheet, type XlsxCellValue } from "../../storage/xlsx-reader";
import { parseCsv } from "../../utils/csv";
import { parseAmount } from "../../utils/format";
import {
  dayFirstFromDateFormat,
  inferDayFirst,
  parseFlexibleDate,
} from "../../utils/parse-date";
import type { DateFormat } from "../types";

// Reading an arbitrary CSV / xlsx the user drops into one of the "update
// value over time" modals, then turning two of its columns (one date, one
// value) into the dated points those modals already store. Page-agnostic:
// every page that records a `{ id, date, value }` history (items, property,
// savings, loans, investment holdings, stock prices) shares this so the
// importer behaves identically everywhere.

export type GridCell = string | number | null;

// A parsed file as a dense rectangular grid plus the column the reader
// took to be the header (used for labels and keyword-based detection).
export type TabularGrid = {
  // Header labels, one per column. Synthesised ("Column A", "Column B", …)
  // when the file has no recognisable header row.
  headers: string[];
  // Data rows (the header row excluded), padded to `headers.length`.
  rows: GridCell[][];
};

// The two columns the importer maps, plus the resolved day-first decision
// for the date column.
export type ColumnSelection = {
  dateColumn: number;
  valueColumn: number;
  dayFirst: boolean;
};

export type ImportedPoint = { date: string; value: number };

// --- file → grid --------------------------------------------------------

function isXlsxName(name: string): boolean {
  return /\.xlsx$/i.test(name);
}

// Convert the xlsx reader's sparse row maps into a dense grid. The widest
// row sets the column count; gaps become null.
function denseFromSparse(rows: Map<number, XlsxCellValue>[]): GridCell[][] {
  let width = 0;
  for (const r of rows) {
    for (const col of r.keys()) width = Math.max(width, col + 1);
  }
  return rows.map((r) => {
    const out: GridCell[] = new Array(width).fill(null);
    // Boolean cells can't be a date or a value — drop them to null so the
    // grid stays `string | number | null`.
    for (const [col, val] of r)
      out[col] = typeof val === "boolean" ? null : val;
    return out;
  });
}

// Column label A, B, …, Z, AA, … for a 0-based index, matching how a
// spreadsheet names columns the file may not have headers for.
export function columnLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// Whether the first row reads like a header: at least one cell is a
// non-empty string that is neither a date nor a number. A file of pure
// data (numbers / dates from row one) gets synthesised column labels
// instead so its first record isn't eaten as a header.
function looksLikeHeader(row: GridCell[]): boolean {
  let sawText = false;
  for (const cell of row) {
    if (typeof cell !== "string") {
      if (typeof cell === "number") return false; // numeric first row → data
      continue;
    }
    const trimmed = cell.trim();
    if (trimmed === "") continue;
    if (parseFlexibleDate(trimmed, true) !== null) return false;
    if (parseAmount(trimmed) !== null) return false;
    sawText = true;
  }
  return sawText;
}

function gridFromRows(rawRows: GridCell[][]): TabularGrid {
  const rows = rawRows.filter((r) => r.some((c) => c !== null && c !== ""));
  if (rows.length === 0) return { headers: [], rows: [] };

  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const pad = (r: GridCell[]): GridCell[] => {
    if (r.length === width) return r;
    return [...r, ...new Array(width - r.length).fill(null)];
  };

  const first = pad(rows[0]);
  if (looksLikeHeader(first)) {
    const headers = first.map((c, i) =>
      typeof c === "string" && c.trim() !== "" ? c.trim() : columnLabel(i),
    );
    return { headers, rows: rows.slice(1).map(pad) };
  }
  // No header — synthesise labels and keep every row as data.
  const headers = Array.from({ length: width }, (_, i) => columnLabel(i));
  return { headers, rows: rows.map(pad) };
}

// Read a dropped file (xlsx by extension, otherwise CSV) into a grid.
export async function readTabularFile(
  name: string,
  bytes: ArrayBuffer,
): Promise<TabularGrid> {
  if (isXlsxName(name)) {
    const sheet = await readFirstSheet(bytes);
    return gridFromRows(denseFromSparse(sheet.rows));
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  return gridFromRows(parseCsv(text));
}

// --- column detection ---------------------------------------------------

const DATE_HEADER_HINTS = [
  "date",
  "datum",
  "day",
  "dag",
  "period",
  "month",
  "månad",
  "time",
  "tid",
  "as of",
];
const VALUE_HEADER_HINTS = [
  "value",
  "värde",
  "amount",
  "belopp",
  "balance",
  "saldo",
  "price",
  "pris",
  "kurs",
  "summa",
  "total",
  "worth",
  "nav",
];

function headerHints(header: string, hints: readonly string[]): boolean {
  const h = header.toLowerCase();
  return hints.some((k) => h.includes(k));
}

function columnCells(grid: TabularGrid, col: number): GridCell[] {
  return grid.rows.map((r) => r[col] ?? null);
}

function nonEmpty(cells: GridCell[]): GridCell[] {
  return cells.filter((c) => c !== null && c !== "");
}

// Fraction (0–1) of non-empty cells in a column that parse as a date.
function dateScore(cells: GridCell[]): number {
  const present = nonEmpty(cells);
  if (present.length === 0) return 0;
  const dayFirst = inferDayFirst(cells, true);
  let hit = 0;
  for (const c of present) {
    if (parseFlexibleDate(c, dayFirst) !== null) hit++;
  }
  return hit / present.length;
}

// Fraction of non-empty cells that parse as a number.
function valueScore(cells: GridCell[]): number {
  const present = nonEmpty(cells);
  if (present.length === 0) return 0;
  let hit = 0;
  for (const c of present) {
    if (typeof c === "number" && Number.isFinite(c)) hit++;
    else if (typeof c === "string" && parseAmount(c) !== null) hit++;
  }
  return hit / present.length;
}

// Suggest a date column and a (distinct) value column. Returns null
// columns when nothing scores above the confidence floor — the modal then
// asks the user to pick by hand. Header keywords break ties / nudge a
// borderline column ahead so a "Date" / "Value" labelled file lands right.
export function suggestColumns(grid: TabularGrid): {
  dateColumn: number | null;
  valueColumn: number | null;
} {
  const width = grid.headers.length;
  if (width === 0) return { dateColumn: null, valueColumn: null };

  const dates = [];
  const values = [];
  for (let c = 0; c < width; c++) {
    const cells = columnCells(grid, c);
    const dBoost = headerHints(grid.headers[c], DATE_HEADER_HINTS) ? 0.25 : 0;
    const vBoost = headerHints(grid.headers[c], VALUE_HEADER_HINTS) ? 0.25 : 0;
    dates.push({ col: c, score: dateScore(cells) + dBoost });
    values.push({ col: c, score: valueScore(cells) + vBoost });
  }

  const bestDate = [...dates].sort((a, b) => b.score - a.score)[0];
  const dateColumn = bestDate.score >= 0.5 ? bestDate.col : null;

  const bestValue = [...values]
    .filter((v) => v.col !== dateColumn)
    .sort((a, b) => b.score - a.score)[0];
  const valueColumn =
    bestValue && bestValue.score >= 0.5 ? bestValue.col : null;

  return { dateColumn, valueColumn };
}

// --- grid → points ------------------------------------------------------

// Per-row parse result, kept around so the modal can render the file with
// the chosen columns normalised (a parsed ISO date, a parsed number) and
// flag the rows that won't import. `date` / `value` are null when that
// cell failed to parse.
export type RowPreview = {
  date: string | null;
  value: number | null;
};

export function previewRows(
  grid: TabularGrid,
  selection: ColumnSelection,
): RowPreview[] {
  return grid.rows.map((r) => {
    const date = parseFlexibleDate(
      r[selection.dateColumn] ?? null,
      selection.dayFirst,
    );
    const rawValue = r[selection.valueColumn] ?? null;
    let value: number | null = null;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      value = rawValue;
    } else if (typeof rawValue === "string") {
      value = parseAmount(rawValue);
    }
    return { date, value };
  });
}

// Build the importable points from the chosen columns: every row whose
// date AND value both parse. `transform` lets a caller clamp the sign
// (loans / item values are stored as magnitudes; savings can be negative).
export function buildPoints(
  grid: TabularGrid,
  selection: ColumnSelection,
  transform: (value: number) => number = (v) => v,
): ImportedPoint[] {
  const out: ImportedPoint[] = [];
  for (const row of previewRows(grid, selection)) {
    if (row.date === null || row.value === null) continue;
    out.push({ date: row.date, value: transform(row.value) });
  }
  return out;
}

export function resolveDayFirst(
  grid: TabularGrid,
  dateColumn: number,
  dateFormat: DateFormat,
): boolean {
  return inferDayFirst(
    columnCells(grid, dateColumn),
    dayFirstFromDateFormat(dateFormat),
  );
}

// --- merge into an existing history -------------------------------------

type DatedPoint = { id: string; date: string; value: number };

// Merge imported points into an existing `{ id, date, value }[]`, one
// point per date. A date the import covers becomes authoritative — any
// prior point(s) on that date are replaced, reusing the existing id so a
// re-import is idempotent and doesn't churn ids the edit / delete modal
// references. Manual points on dates the import doesn't touch survive.
// Generalises `applyImportedSavingBalances` for every value history.
export function mergeImportedPoints<T extends DatedPoint>(
  existing: readonly T[],
  incoming: readonly ImportedPoint[],
  mintId: () => string,
  make: (point: DatedPoint) => T,
): T[] {
  const byDate = (a: { date: string }, b: { date: string }) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

  // Last incoming point on a date wins (a later row overrides an earlier).
  const importedByDate = new Map<string, number>();
  for (const pt of incoming) importedByDate.set(pt.date, pt.value);
  if (importedByDate.size === 0) return [...existing];

  const existingIdByDate = new Map<string, string>();
  for (const pt of existing) {
    if (!existingIdByDate.has(pt.date)) existingIdByDate.set(pt.date, pt.id);
  }

  const kept = existing.filter((pt) => !importedByDate.has(pt.date));
  const derived: T[] = [];
  for (const [date, value] of importedByDate) {
    derived.push(
      make({ id: existingIdByDate.get(date) ?? mintId(), date, value }),
    );
  }
  return [...kept, ...derived].sort(byDate);
}
