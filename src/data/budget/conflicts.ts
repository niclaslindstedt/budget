// Duplicate-finder for the active budget. Scans the rows surfaced by
// `buildVisibleRows` and groups likely-duplicate entries so the user
// can merge them in one click. Sibling of `reconciliation.ts`: that
// module pairs incoming history entries with budget rows during
// import, this one cleans up parallel records that slipped past it.
//
// Three knobs control the match band:
//
// - **Day** — strict, exact ISO date. The user requested "same day";
//   we don't widen because at this point in the pipeline both sides
//   already exist as rows on the same date.
// - **Amount** — `CONFLICT_AMOUNT_PCT` (5 %) tolerance on either
//   side. Tighter than reconciliation's 1 % because the reconciler is
//   matching predictions against postings (rounding cliffs, FX); the
//   conflict finder is matching two records of the *same* posting, so
//   they should already be close.
// - **Category** — strict when both sides have one. When either row
//   has no `typeId` (or its type has no `categoryId`), the pair still
//   matches regardless of the other side's category. Only two rows
//   that BOTH carry a *different* set category are excluded.
//
// Excluded by construction:
//
//   - Rows in the Food category — opting out of grocery noise.
//   - Synthesized transfer halves (`transferId`).
//   - Balance-correction rows (`isCorrection`).
//   - Undated rows, rows whose `|amount|` falls under the modal's
//     user-tunable threshold.
//   - **Groups consisting of two or more bank-history rows.** Bank
//     statements are the source of truth; two real bank entries on
//     the same day are not duplicates of each other, they're a
//     genuine double charge (or two real postings that happened to
//     land close). A history row paired with a user-authored row is
//     still a valid candidate — the history row wins and the user
//     row's metadata stamps onto it.
//
// Pure: no React, no storage. Consumed by `BudgetFindConflictsModal` in
// `src/components/budget/`.

import { readStringCell } from "./cells";
import { findColumnByType } from "../sheet";
import type { Column, EntryType, Row } from "../types";

export const CONFLICT_AMOUNT_PCT = 0.05;
// Default for the modal's min-amount slider, in major units (kr).
// Kept here so tests and the modal share one source of truth.
export const CONFLICT_DEFAULT_MIN_AMOUNT = 200;

// Categories the user has opted out of conflict detection entirely.
// The Food category covers the everyday grocery / restaurant noise
// the user explicitly asked to skip; if more buckets ever need
// excluding, extend this list and document the reasoning here.
export const EXCLUDED_CATEGORY_IDS: ReadonlyArray<string> = ["preset-cat-food"];

export type Conflict = {
  // Stable per-group id derived from `${date}|${winnerId}` so the
  // modal can key React lists by it without remounting when the group
  // contents shift.
  id: string;
  date: string;
  // Category the group lives under. `null` when no member has one
  // (all members untyped, or every typed member's type has no
  // category). Used for the group header and for the "category
  // excluded" filter in the modal.
  categoryId: string | null;
  rows: readonly Row[];
  winnerId: string;
};

export type FindConflictsOptions = {
  types: readonly EntryType[];
  columns: readonly Column[];
  // Major units. Rows with `|amount| < minAmount` are skipped.
  minAmount: number;
};

// True iff `|a|` and `|b|` are within `CONFLICT_AMOUNT_PCT` of each
// other. Compares in minor units so floating-point drift can't open or
// close the band — same trick `amountsWithinTolerance` uses in
// `reconciliation.ts`, with a per-call tolerance constant and no
// absolute floor (the 5 % band is already wide for the typical row
// size; a floor would only inflate noise on small-amount edge cases
// that the modal's min-amount slider already filters).
function withinPct(a: number, b: number, pct: number): boolean {
  const aCents = Math.round(Math.abs(a) * 100);
  const bCents = Math.round(Math.abs(b) * 100);
  const deltaCents = Math.abs(Math.round(a * 100) - Math.round(b * 100));
  const tolerance = Math.max(aCents, bCents) * pct;
  return deltaCents <= tolerance;
}

function sameSign(a: number, b: number): boolean {
  if (a === 0 || b === 0) return a === b;
  return a > 0 === b > 0;
}

function categoriesCompatible(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return true;
  return a === b;
}

type BucketEntry = {
  row: Row;
  amount: number;
  categoryId: string | null;
};

// Score a user-authored row by how much curated metadata it carries.
// Used to pick the winner among an all-user-rows group:
//
//   - `+2` for a `typeId` (the most expensive thing to re-create —
//     drives the row's chip, glyph, colour, category, and any future
//     stats roll-up).
//   - `+1` for a non-blank description.
//   - `+1` for a recurrence link (`seriesId`).
//
// History-backed rows short-circuit `pickWinner` before this runs.
function metadataScore(row: Row, descColId: string | null): number {
  let score = 0;
  if (typeof row.typeId === "string" && row.typeId !== "") score += 2;
  if (readStringCell(row, descColId) !== "") score += 1;
  if (typeof row.seriesId === "string" && row.seriesId !== "") score += 1;
  return score;
}

// Pick the winner for a group of conflicting rows. Exported so the
// modal can highlight the would-be-kept row before the user clicks
// merge.
//
//   1. If a row carries `historyEntryId`, it wins. Bank records are
//      authoritative — the user's parallel manual entry is the one
//      we fold into the history entry's metadata. Detector
//      guarantees at most one history row per group (groups with
//      two or more are excluded outright), so this is unambiguous.
//   2. Otherwise — all user-authored rows — pick the one with the
//      highest metadata score. Ties go to the lowest `id` lex.
export function pickWinner(
  rows: readonly Row[],
  columns: readonly Column[],
): Row {
  if (rows.length === 0) {
    throw new Error("pickWinner: empty group");
  }
  const history = rows.find((r) => typeof r.historyEntryId === "string");
  if (history) return history;
  const descColId = findColumnByType(columns, "description")?.id ?? null;
  return [...rows].sort((a, b) => {
    const sb = metadataScore(b, descColId);
    const sa = metadataScore(a, descColId);
    if (sb !== sa) return sb - sa;
    return a.id.localeCompare(b.id);
  })[0];
}

// Detect duplicate-candidate groups in a row list. The row list
// should be the result of `buildVisibleRows` on the active
// `AccountBudget` — that already includes synthesized history rows
// (with `historyEntryId`) and transfer halves (with `transferId`),
// which the function then filters by source.
//
// Returns at most one group per (date, winner) pair, sorted newest-
// first. Empty when no conflicts pass the band.
export function findConflicts(
  rows: readonly Row[],
  options: FindConflictsOptions,
): Conflict[] {
  const { types, columns, minAmount } = options;
  const dateCol = findColumnByType(columns, "date");
  const amountCol = findColumnByType(columns, "amount");
  if (!dateCol || !amountCol) return [];

  const typesById = new Map(types.map((t) => [t.id, t] as const));
  const resolveCat = (row: Row): string | null => {
    if (typeof row.typeId !== "string" || row.typeId === "") return null;
    const t = typesById.get(row.typeId);
    if (!t) return null;
    return typeof t.categoryId === "string" && t.categoryId !== ""
      ? t.categoryId
      : null;
  };

  // Bucket by date only. The category compatibility check runs
  // per-pair below since the relation isn't transitive (null matches
  // anything, but two specific categories don't match each other).
  const buckets = new Map<string, BucketEntry[]>();
  for (const row of rows) {
    if (typeof row.transferId === "string") continue;
    if (row.isCorrection) continue;
    const cat = resolveCat(row);
    if (cat !== null && EXCLUDED_CATEGORY_IDS.includes(cat)) continue;
    const dateValue = row.cells[dateCol.id];
    if (typeof dateValue !== "string" || dateValue.length < 10) continue;
    const amountValue = row.cells[amountCol.id];
    if (typeof amountValue !== "number" || !Number.isFinite(amountValue)) {
      continue;
    }
    if (Math.abs(amountValue) < minAmount) continue;
    let arr = buckets.get(dateValue);
    if (!arr) {
      arr = [];
      buckets.set(dateValue, arr);
    }
    arr.push({ row, amount: amountValue, categoryId: cat });
  }

  const out: Conflict[] = [];
  for (const [date, bucket] of buckets) {
    if (bucket.length < 2) continue;
    const used = new Set<string>();
    for (let i = 0; i < bucket.length; i += 1) {
      const seed = bucket[i];
      if (used.has(seed.row.id)) continue;
      const group: BucketEntry[] = [seed];
      for (let j = i + 1; j < bucket.length; j += 1) {
        const candidate = bucket[j];
        if (used.has(candidate.row.id)) continue;
        if (!sameSign(seed.amount, candidate.amount)) continue;
        if (!withinPct(seed.amount, candidate.amount, CONFLICT_AMOUNT_PCT)) {
          continue;
        }
        // Bank-history rows are the source of truth — two of them on
        // the same day are not duplicates of each other, they're a
        // genuine double charge. Refuse to add a second history row
        // to a group that already contains one. (Mirrored at the
        // seed level by `pickWinner`'s single-history assumption.)
        const candidateIsHistory =
          typeof candidate.row.historyEntryId === "string";
        if (
          candidateIsHistory &&
          group.some((g) => typeof g.row.historyEntryId === "string")
        ) {
          continue;
        }
        // Category compatibility must hold against EVERY existing
        // group member — the predicate isn't transitive when one
        // side is null.
        if (
          !group.every((g) =>
            categoriesCompatible(g.categoryId, candidate.categoryId),
          )
        ) {
          continue;
        }
        group.push(candidate);
      }
      if (group.length < 2) continue;
      for (const e of group) used.add(e.row.id);
      const displayCat =
        group.find((e) => e.categoryId !== null)?.categoryId ?? null;
      const groupRows = group.map((e) => e.row);
      const winner = pickWinner(groupRows, columns);
      out.push({
        id: `${date}|${winner.id}`,
        date,
        categoryId: displayCat,
        rows: groupRows,
        winnerId: winner.id,
      });
    }
  }

  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}
