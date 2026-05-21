// Shared helpers for bank-statement parsers.
//
// Each bank module in `bank-*.ts` registers a `BankParser` against the
// pipeline in `bank-import.ts`. The parsers do superficially different
// work — Swedbank vs Skandia row layouts, csv vs xlsx — but they all
// need the same small cell-extraction, header-matching, and string-
// cleanup primitives. Keeping those primitives in one module here
// means a fix or extension (e.g. accepting a new amount format) lands
// in every parser at once.

import type { Logger } from "../utils/logger";
import { type BankFile } from "./bank-import";
import {
  readFirstSheet,
  type XlsxCellValue,
  type XlsxSheet,
} from "./xlsx-reader";

// Collapse internal whitespace and trim. Bank exports routinely pad
// descriptions with double spaces, tabs, or trailing newlines; the
// canonical form keeps lookups (dedup, recurring-detection) stable.
export function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

// "-1 234,56 kr" → -1234.56. Handles the Swedish locale: comma decimal
// separator, optional regular or non-breaking space as thousands
// separator, optional " kr" / " KR" suffix. Returns `null` for inputs
// that don't parse as a finite number so the caller can skip the row
// instead of inserting a `NaN`.
export function parseSwedishAmount(s: string): number | null {
  const trimmed = s.replace(/\s*kr\s*$/i, "").trim();
  if (trimmed === "") return null;
  const normalised = trimmed.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

// Extract a string from an xlsx cell, or `null` if the cell isn't a
// string. xlsx-reader emits `string | number | boolean | null` so this
// is just a typed narrow.
export function stringCell(v: XlsxCellValue | undefined): string | null {
  return typeof v === "string" ? v : null;
}

// Extract a finite number from an xlsx cell. Numeric cells in xlsx are
// usually plain numbers, but some exports quote them as Swedish-
// formatted strings ("1 219,80") so we fall back to `parseSwedishAmount`
// when the cell came through as a string. Returns `null` for anything
// that can't be coerced.
export function numericCell(v: XlsxCellValue | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return parseSwedishAmount(v);
  return null;
}

// How to compare a header cell against its expected token. `exact`
// trims whitespace and requires the full token; `startsWith` accepts
// trailing junk on the cell (Skandiabanken pads its header row with
// long-form column descriptions appended to the column name).
export type HeaderMatchMode = "exact" | "startsWith";

// True iff every expected header is present in `row` at the expected
// column index. `undefined` row (i.e. row past the end of the sheet)
// counts as no match.
export function rowMatchesHeaders(
  row: Map<number, XlsxCellValue> | undefined,
  headers: readonly string[],
  mode: HeaderMatchMode = "exact",
): boolean {
  if (!row) return false;
  for (let i = 0; i < headers.length; i++) {
    const v = row.get(i);
    if (typeof v !== "string") return false;
    if (mode === "exact") {
      if (v.trim() !== headers[i]) return false;
    } else {
      if (!v.startsWith(headers[i])) return false;
    }
  }
  return true;
}

// First row index whose contents match `headers`, or -1. Used when the
// header row's position isn't known up-front (e.g. Swedbank exports
// vary in how many lines of front matter precede the data table).
export function findHeaderRow(
  rows: readonly Map<number, XlsxCellValue>[],
  headers: readonly string[],
  mode: HeaderMatchMode = "exact",
): number {
  for (let i = 0; i < rows.length; i++) {
    if (rowMatchesHeaders(rows[i], headers, mode)) return i;
  }
  return -1;
}

// Read the first sheet of an xlsx file, returning `null` (and logging
// a warning) if the reader throws. Every xlsx-backed parser uses this
// in its `sniff` step to swallow malformed-archive errors as "not my
// format" without burying the parse-time failure.
export async function tryReadFirstSheet(
  file: BankFile,
  log: Logger,
): Promise<XlsxSheet | null> {
  try {
    return await readFirstSheet(file.bytes);
  } catch (err) {
    log.warn("sniff: readFirstSheet threw — treating as no match", err);
    return null;
  }
}
