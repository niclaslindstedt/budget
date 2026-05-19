// Reconciliation matcher for bank-history imports.
//
// Pairs newly-imported `HistoryEntry`s with predicted user rows on
// the same account so the import modal can offer "merge" actions
// instead of leaving two parallel records. Three knobs control the
// match band:
//
// - `RECONCILIATION_DATE_LAG_DAYS`: the bank's posting date can be
//   on or up to N days after the predicted date. Never before — a
//   future-dated user row that posts earlier was either a manual
//   adjustment or a forecast that beat reality, and we don't want to
//   collapse that pair silently.
// - `RECONCILIATION_AMOUNT_PCT`: relative amount tolerance for large
//   transactions (fees, FX rounding).
// - `RECONCILIATION_AMOUNT_FLOOR_CENTS`: absolute amount tolerance
//   floor in minor units (1 SEK = 100 cents). Without it a 45 kr
//   coffee would need exact-cent precision to match, but the bank
//   often rounds change rows by a krona or two.
//
// Pure: no React, no storage. Consumed by the import flow in
// `App.tsx` and by `synthesizeHistoryRow` to short-circuit when a
// `SeriesMatchRule` already covers the pair.

import { compilePattern } from "./match-rules";
import { findColumnByType } from "./sheet";
import type { Column, HistoryEntry, Row, SeriesMatchRule } from "./types";

export const RECONCILIATION_DATE_LAG_DAYS = 7;
export const RECONCILIATION_AMOUNT_PCT = 0.01;
// Two SEK in minor units. Keep the value here in cents so callers
// don't need to know the currency's decimal scaling.
export const RECONCILIATION_AMOUNT_FLOOR_CENTS = 200;

export type MatchCandidate = {
  historyEntryId: string;
  rowId: string;
  amountDelta: number;
  dateLagDays: number;
  confidence: "high" | "low";
  seriesId: string | null;
};

export type OrphanRow = {
  rowId: string;
  monthKey: string;
};

// True iff `h.amount` and `r.amount` are within tolerance. Compares
// in minor units so floating-point drift can't open or close the
// band. `Math.round` (not `Math.trunc`) so −0.005 lands on the same
// integer as +0.005.
export function amountsWithinTolerance(a: number, b: number): boolean {
  const aCents = Math.round(Math.abs(a) * 100);
  const bCents = Math.round(Math.abs(b) * 100);
  const deltaCents = Math.abs(Math.round(a * 100) - Math.round(b * 100));
  const pctTolerance = Math.max(aCents, bCents) * RECONCILIATION_AMOUNT_PCT;
  const tolerance = Math.max(RECONCILIATION_AMOUNT_FLOOR_CENTS, pctTolerance);
  return deltaCents <= tolerance;
}

// Inclusive day difference between two ISO dates (`YYYY-MM-DD`).
// Returns `aDate - bDate` so a positive number means `a` is later.
// Uses UTC noon to dodge DST cliffs.
export function daysBetween(a: string, b: string): number {
  if (a.length < 10 || b.length < 10) return Number.NaN;
  const ay = Number(a.slice(0, 4));
  const am = Number(a.slice(5, 7));
  const ad = Number(a.slice(8, 10));
  const by = Number(b.slice(0, 4));
  const bm = Number(b.slice(5, 7));
  const bd = Number(b.slice(8, 10));
  if (
    !Number.isFinite(ay) ||
    !Number.isFinite(am) ||
    !Number.isFinite(ad) ||
    !Number.isFinite(by) ||
    !Number.isFinite(bm) ||
    !Number.isFinite(bd)
  ) {
    return Number.NaN;
  }
  const aMs = Date.UTC(ay, am - 1, ad, 12);
  const bMs = Date.UTC(by, bm - 1, bd, 12);
  return Math.round((aMs - bMs) / 86_400_000);
}

function sameSign(a: number, b: number): boolean {
  if (a === 0 || b === 0) return a === b;
  return a > 0 === b > 0;
}

function readRowDateAmount(
  row: Row,
  dateColId: string,
  amountColId: string,
): { date: string; amount: number } | null {
  const date = row.cells[dateColId];
  const amount = row.cells[amountColId];
  if (typeof date !== "string" || date.length < 10) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return { date, amount };
}

// Per-history-entry candidate pool. For each new entry, walk the
// row list and keep every (row, entry) pair whose date lag is in
// `[0, RECONCILIATION_DATE_LAG_DAYS]`, sign agrees, and amount fits
// the tolerance band. Pairs are de-duplicated across the whole
// import so a single row can only be offered for one entry (the
// closest by amountDelta, then dateLagDays); same goes for history
// entries.
export function findCandidates(
  newEntries: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
): MatchCandidate[] {
  const dateCol = findColumnByType(columns, "date");
  const amountCol = findColumnByType(columns, "amount");
  if (!dateCol || !amountCol) return [];

  const pool: MatchCandidate[] = [];
  for (const entry of newEntries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransactionId !== undefined) continue;
    for (const row of rows) {
      if (row.isCorrection) continue;
      if (row.historyEntryId) continue;
      if (row.transactionId) continue;
      const ra = readRowDateAmount(row, dateCol.id, amountCol.id);
      if (!ra) continue;
      if (!sameSign(entry.amount, ra.amount)) continue;
      const lag = daysBetween(entry.date, ra.date);
      if (!Number.isFinite(lag)) continue;
      if (lag < 0 || lag > RECONCILIATION_DATE_LAG_DAYS) continue;
      if (!amountsWithinTolerance(entry.amount, ra.amount)) continue;
      const amountDelta = Math.abs(
        Math.round(entry.amount * 100) - Math.round(ra.amount * 100),
      );
      const halfFloor = RECONCILIATION_AMOUNT_FLOOR_CENTS / 2;
      const halfPct =
        (Math.max(Math.abs(entry.amount), Math.abs(ra.amount)) *
          RECONCILIATION_AMOUNT_PCT *
          100) /
        2;
      const halfTolerance = Math.max(halfFloor, halfPct);
      const confidence: MatchCandidate["confidence"] =
        amountDelta <= halfTolerance && lag <= 2 ? "high" : "low";
      pool.push({
        historyEntryId: entry.id,
        rowId: row.id,
        amountDelta,
        dateLagDays: lag,
        confidence,
        seriesId: row.seriesId ?? null,
      });
    }
  }

  // Greedy assignment: walk pool sorted by (amountDelta ASC,
  // dateLagDays ASC, series-first), claim a row and a history entry
  // for each pick. Series rows win ties because they're the
  // recurring predictions the modal most wants to resolve.
  pool.sort((a, b) => {
    if (a.amountDelta !== b.amountDelta) return a.amountDelta - b.amountDelta;
    if (a.dateLagDays !== b.dateLagDays) return a.dateLagDays - b.dateLagDays;
    const sa = a.seriesId ? 0 : 1;
    const sb = b.seriesId ? 0 : 1;
    return sa - sb;
  });
  const claimedRows = new Set<string>();
  const claimedEntries = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const c of pool) {
    if (claimedRows.has(c.rowId)) continue;
    if (claimedEntries.has(c.historyEntryId)) continue;
    claimedRows.add(c.rowId);
    claimedEntries.add(c.historyEntryId);
    out.push(c);
  }
  return out;
}

// Predicted user rows that landed in a newly-covered month but never
// got a matching history entry. The reconciliation modal lists these
// under "Predictions that didn't post" with delete / move actions.
// `coveredMonthKeys` is the set of *newly*-covered months (the
// coverage delta from the import); rows in months that were already
// covered before the import are out of scope.
export function findOrphans(
  rows: readonly Row[],
  columns: readonly Column[],
  newlyCovered: ReadonlySet<string>,
  reconciledRowIds: ReadonlySet<string>,
): OrphanRow[] {
  if (newlyCovered.size === 0) return [];
  const dateCol = findColumnByType(columns, "date");
  if (!dateCol) return [];
  const out: OrphanRow[] = [];
  for (const row of rows) {
    if (reconciledRowIds.has(row.id)) continue;
    if (row.isCorrection) continue;
    if (row.historyEntryId) continue;
    if (row.transactionId) continue;
    const d = row.cells[dateCol.id];
    if (typeof d !== "string" || d.length < 7) continue;
    const monthKey = d.slice(0, 7);
    if (!newlyCovered.has(monthKey)) continue;
    out.push({ rowId: row.id, monthKey });
  }
  return out;
}

// Build a `SeriesMatchRule` from a confirmed match. Returns null
// when the row doesn't belong to a series — only series rows
// generate auto-reconciliation rules.
export function inferSeriesRule(
  match: MatchCandidate,
  entry: HistoryEntry,
  row: Row,
  newId: () => string,
): SeriesMatchRule | null {
  if (!row.seriesId) return null;
  // Token-based pattern: trim the bank description to its
  // information-bearing prefix (stop at the first digit run or
  // common separator) and wrap with stars for substring matching.
  // Always lowercased — the matcher is case-insensitive but storing
  // a canonical form avoids visual noise.
  const trimmed = entry.description.trim();
  const tokenMatch = trimmed.match(/^[^\d*?/|]+/);
  const token = (tokenMatch ? tokenMatch[0] : trimmed).trim().toLowerCase();
  const pattern = token === "" ? `*${trimmed.toLowerCase()}*` : `*${token}*`;
  const pct = Math.min(
    RECONCILIATION_AMOUNT_PCT,
    Math.max(0, match.amountDelta / Math.max(1, Math.abs(entry.amount) * 100)),
  );
  // Always keep at least RECONCILIATION_AMOUNT_PCT room so the rule
  // generalises to other occurrences with similar fee jitter — we
  // never narrow below the same band the matcher itself uses.
  const tolerance = Math.max(pct, RECONCILIATION_AMOUNT_PCT);
  return {
    id: newId(),
    seriesId: row.seriesId,
    pattern,
    amountTolerancePct: tolerance,
    dateLagDays: Math.min(match.dateLagDays, RECONCILIATION_DATE_LAG_DAYS),
  };
}

// Find every other unmatched occurrence of `rule.seriesId` in the
// import window. Used by the "Apply to whole series" action — once
// the user confirms one occurrence, every sibling that fits the
// rule's pattern + tolerance is queued for the same merge.
export function expandToSeries(
  rule: SeriesMatchRule,
  newEntries: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
  alreadyMatched: ReadonlySet<string>,
): MatchCandidate[] {
  const dateCol = findColumnByType(columns, "date");
  const amountCol = findColumnByType(columns, "amount");
  if (!dateCol || !amountCol) return [];
  let re: RegExp;
  try {
    re = compilePattern(rule.pattern);
  } catch {
    return [];
  }
  const seriesRows = rows.filter(
    (r) => r.seriesId === rule.seriesId && !alreadyMatched.has(r.id),
  );
  if (seriesRows.length === 0) return [];

  const pool: MatchCandidate[] = [];
  for (const entry of newEntries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransactionId !== undefined) continue;
    if (alreadyMatched.has(`hist:${entry.id}`)) continue;
    if (!re.test(entry.description)) continue;
    for (const row of seriesRows) {
      const ra = readRowDateAmount(row, dateCol.id, amountCol.id);
      if (!ra) continue;
      if (!sameSign(entry.amount, ra.amount)) continue;
      const lag = daysBetween(entry.date, ra.date);
      if (!Number.isFinite(lag)) continue;
      if (lag < 0 || lag > rule.dateLagDays) continue;
      const aCents = Math.round(Math.abs(entry.amount) * 100);
      const bCents = Math.round(Math.abs(ra.amount) * 100);
      const tolerance = Math.max(
        RECONCILIATION_AMOUNT_FLOOR_CENTS,
        Math.max(aCents, bCents) * rule.amountTolerancePct,
      );
      const deltaCents = Math.abs(
        Math.round(entry.amount * 100) - Math.round(ra.amount * 100),
      );
      if (deltaCents > tolerance) continue;
      pool.push({
        historyEntryId: entry.id,
        rowId: row.id,
        amountDelta: deltaCents,
        dateLagDays: lag,
        confidence: "high",
        seriesId: rule.seriesId,
      });
    }
  }
  pool.sort((a, b) => {
    if (a.amountDelta !== b.amountDelta) return a.amountDelta - b.amountDelta;
    return a.dateLagDays - b.dateLagDays;
  });
  const claimedRows = new Set<string>();
  const claimedEntries = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const c of pool) {
    if (claimedRows.has(c.rowId)) continue;
    if (claimedEntries.has(c.historyEntryId)) continue;
    claimedRows.add(c.rowId);
    claimedEntries.add(c.historyEntryId);
    out.push(c);
  }
  return out;
}

// Find any predicted row that a stored `SeriesMatchRule` and a new
// history entry conspire to match. Used by `importBankHistory` to
// auto-reconcile silently before the modal opens. Returns the same
// shape as `findCandidates` so callers can dispatch through one path.
export function findRuleDrivenCandidates(
  rules: readonly SeriesMatchRule[],
  newEntries: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
): MatchCandidate[] {
  if (rules.length === 0) return [];
  const dateCol = findColumnByType(columns, "date");
  const amountCol = findColumnByType(columns, "amount");
  if (!dateCol || !amountCol) return [];

  // Pre-compile each rule's pattern once.
  const compiled = rules.map((rule) => {
    try {
      return { rule, re: compilePattern(rule.pattern) };
    } catch {
      return null;
    }
  });

  const pool: MatchCandidate[] = [];
  for (const entry of newEntries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransactionId !== undefined) continue;
    for (const c of compiled) {
      if (!c) continue;
      if (!c.re.test(entry.description)) continue;
      for (const row of rows) {
        if (row.isCorrection) continue;
        if (row.historyEntryId) continue;
        if (row.transactionId) continue;
        if (row.seriesId !== c.rule.seriesId) continue;
        const ra = readRowDateAmount(row, dateCol.id, amountCol.id);
        if (!ra) continue;
        if (!sameSign(entry.amount, ra.amount)) continue;
        const lag = daysBetween(entry.date, ra.date);
        if (!Number.isFinite(lag)) continue;
        if (lag < 0 || lag > c.rule.dateLagDays) continue;
        const aCents = Math.round(Math.abs(entry.amount) * 100);
        const bCents = Math.round(Math.abs(ra.amount) * 100);
        const tolerance = Math.max(
          RECONCILIATION_AMOUNT_FLOOR_CENTS,
          Math.max(aCents, bCents) * c.rule.amountTolerancePct,
        );
        const deltaCents = Math.abs(
          Math.round(entry.amount * 100) - Math.round(ra.amount * 100),
        );
        if (deltaCents > tolerance) continue;
        pool.push({
          historyEntryId: entry.id,
          rowId: row.id,
          amountDelta: deltaCents,
          dateLagDays: lag,
          confidence: "high",
          seriesId: c.rule.seriesId,
        });
      }
    }
  }
  pool.sort((a, b) => {
    if (a.amountDelta !== b.amountDelta) return a.amountDelta - b.amountDelta;
    return a.dateLagDays - b.dateLagDays;
  });
  const claimedRows = new Set<string>();
  const claimedEntries = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const c of pool) {
    if (claimedRows.has(c.rowId)) continue;
    if (claimedEntries.has(c.historyEntryId)) continue;
    claimedRows.add(c.rowId);
    claimedEntries.add(c.historyEntryId);
    out.push(c);
  }
  return out;
}
