// Row → `RuleCandidate` projection. Mirrors `candidateFromHistoryEntry`
// in `match-rules.ts` for budget rows so the four sites that walk an
// `AccountBudget`'s rows against the ruleset (the two `pattern-apply`
// reapply / count helpers, the `pattern-apply` one-shot stamper, and
// the per-cell hook in `reducer.ts`) all build candidates the same
// way and skip the same blanks.
//
// The two-step shape (`resolveCandidateColumns` then `candidateFromRow`)
// lets the iterating callers resolve their column ids once per item
// instead of once per row.

import type { RuleCandidate } from "./match-rules";
import { findColumnByType } from "./sheet";
import type { Column, Row } from "./types";

export type RowCandidateColumns = {
  descId: string | undefined;
  amountId: string | undefined;
};

export function resolveCandidateColumns(
  columns: readonly Column[],
): RowCandidateColumns {
  return {
    descId: findColumnByType(columns, "description")?.id,
    amountId: findColumnByType(columns, "amount")?.id,
  };
}

// Returns null when the row has no usable description (missing
// column, non-string cell, or whitespace-only). Amount falls back
// to 0 when missing or non-numeric — matches every existing site's
// behaviour.
export function candidateFromRow(
  row: Row,
  cols: RowCandidateColumns,
): RuleCandidate | null {
  if (cols.descId === undefined) return null;
  const desc = row.cells[cols.descId];
  if (typeof desc !== "string" || desc.trim() === "") return null;
  const amount =
    cols.amountId !== undefined && typeof row.cells[cols.amountId] === "number"
      ? (row.cells[cols.amountId] as number)
      : 0;
  return { description: desc, amount, isTransfer: row.isTransfer === true };
}
