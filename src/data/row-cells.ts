// Tiny generic readers for `Row.cells`. Modals that walk a row group
// to coalesce metadata (FindConflictsModal's "promote the winner",
// future pickers that surface a representative description) read
// cells the same way; the readers here keep that contract in one
// place and let `conflicts.ts`' own scoring drop a near-twin.

import type { Row } from "./types";

// Trimmed string value from a single cell. Returns "" when the
// column id is null or missing, or the cell is not a string. Trimming
// matches every existing consumer's blank check.
export function readStringCell(row: Row, colId: string | null): string {
  if (!colId) return "";
  const v = row.cells[colId];
  return typeof v === "string" ? v.trim() : "";
}

// Finite number value from a single cell. Returns null when the
// column id is null or missing, or the cell is not a finite number.
export function readNumberCell(row: Row, colId: string | null): number | null {
  if (!colId) return null;
  const v = row.cells[colId];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// First entry in `values` that is neither null/undefined nor a
// whitespace-only string. Useful when coalescing several losing
// rows' metadata into the winner of a merge.
export function firstNonBlank<T>(
  values: readonly (T | null | undefined)[],
): T | null {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return v;
  }
  return null;
}
