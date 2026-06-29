// Reconciliation matcher for bank-history imports.
//
// Pairs newly-imported `HistoryEntry`s with predicted user rows on
// the same account so the import modal can offer "merge" actions
// instead of leaving two parallel records. Four knobs control the
// match band:
//
// - `RECONCILIATION_DATE_LAG_DAYS`: the bank's posting date can be
//   on or up to N days AFTER the predicted date (the charge posts
//   late).
// - `RECONCILIATION_DATE_LEAD_DAYS`: the bank's posting date can also
//   be up to N days BEFORE the predicted date — a transaction that
//   happens a few days early (an autogiro pulled ahead of a weekend,
//   a card charge settling sooner than planned). Without this window
//   an early-posting charge stays unmatched and the user ends up with
//   two rows for the same thing.
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

import { monthFirstDay } from "./coverage";
import { compilePattern } from "./match-rules";
import { getMonthKey } from "./fiscal-month";
import { findColumnByType } from "./sheet";
import type { Column, HistoryEntry, Row, SeriesMatchRule } from "./types";
import { addDaysIso } from "../utils/date";

export const RECONCILIATION_DATE_LAG_DAYS = 7;
// How many days EARLY a bank line may post and still merge with a
// predicted row. Symmetric with the late window: a transaction that
// happens a few days ahead of its predicted date is the same event,
// not a coincidence, so the matcher reaches backwards too.
export const RECONCILIATION_DATE_LEAD_DAYS = 7;
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

// True iff `amount` falls inside a row's inclusive estimate band. Bounds
// are stored signed and ordered (`amountMin <= amountMax`) on rows the
// user marked as an estimate; both must be present for a band to exist.
// A row with a band still reconciles to a bank amount the normal
// tolerance would reject — that's the whole point of an estimate range.
export function amountWithinSpan(
  amount: number,
  min: number | undefined,
  max: number | undefined,
): boolean {
  if (min === undefined || max === undefined) return false;
  return amount >= min && amount <= max;
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
// `[-RECONCILIATION_DATE_LEAD_DAYS, RECONCILIATION_DATE_LAG_DAYS]`
// (the charge may post a few days early or late), sign agrees, and
// amount fits
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

  // Project rows once: filter out the categorically ineligible ones
  // (correction / synthesized) and cache `(date, amount, absCents)` so
  // the inner loop only sees minted candidates. Then sort by
  // `absCents` and binary-search the tolerance band per entry so each
  // entry checks only rows within the band, not every row.
  type Projected = {
    row: Row;
    date: string;
    amount: number;
    absCents: number;
  };
  const projected: Projected[] = [];
  // Estimate rows (those carrying a signed [min, max] band) are matched
  // by a separate linear pass below — the binary-search band keys on the
  // estimate's `absCents`, so a wide band whose bounds sit outside that
  // window would be skipped. They're rare, so a linear scan is cheap.
  const spanProjected: Projected[] = [];
  for (const row of rows) {
    if (row.kind !== "user") continue;
    const ra = readRowDateAmount(row, dateCol.id, amountCol.id);
    if (!ra) continue;
    const entry: Projected = {
      row,
      date: ra.date,
      amount: ra.amount,
      absCents: Math.round(Math.abs(ra.amount) * 100),
    };
    if (row.amountMin !== undefined && row.amountMax !== undefined) {
      spanProjected.push(entry);
    } else {
      projected.push(entry);
    }
  }
  projected.sort((a, b) => a.absCents - b.absCents);
  const absCentsArr = new Array<number>(projected.length);
  for (let i = 0; i < projected.length; i += 1) {
    absCentsArr[i] = projected[i].absCents;
  }
  // First index where `absCentsArr[i] >= value`.
  function lowerBound(value: number): number {
    let lo = 0;
    let hi = absCentsArr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (absCentsArr[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const pool: MatchCandidate[] = [];
  for (const entry of newEntries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransferId !== undefined) continue;
    const entryAbsCents = Math.round(Math.abs(entry.amount) * 100);
    // `amountsWithinTolerance` allows delta <= max(200, max(eAbs,
    // rAbs) × 1%) cents. The worst case the row side can imply is a
    // bound proportional to rAbs itself: solving `rAbs - eAbs <=
    // rAbs × 0.01` gives `rAbs <= eAbs / 0.99`. Use a slightly looser
    // pct (1.02 %) to absorb rounding without falsely excluding any
    // row near the band edge — the original predicate still runs
    // below, so the binary-search range is only a coarse pre-filter.
    const pctBand = Math.ceil(entryAbsCents * 0.0102);
    const band = Math.max(RECONCILIATION_AMOUNT_FLOOR_CENTS, pctBand);
    const lo = lowerBound(Math.max(0, entryAbsCents - band));
    const hi = lowerBound(entryAbsCents + band + 1);
    for (let i = lo; i < hi; i += 1) {
      const p = projected[i];
      if (!sameSign(entry.amount, p.amount)) continue;
      const lag = daysBetween(entry.date, p.date);
      if (!Number.isFinite(lag)) continue;
      if (
        lag < -RECONCILIATION_DATE_LEAD_DAYS ||
        lag > RECONCILIATION_DATE_LAG_DAYS
      )
        continue;
      if (!amountsWithinTolerance(entry.amount, p.amount)) continue;
      const row = p.row;
      const amountDelta = Math.abs(
        Math.round(entry.amount * 100) - Math.round(p.amount * 100),
      );
      const halfFloor = RECONCILIATION_AMOUNT_FLOOR_CENTS / 2;
      const halfPct =
        (Math.max(Math.abs(entry.amount), Math.abs(p.amount)) *
          RECONCILIATION_AMOUNT_PCT *
          100) /
        2;
      const halfTolerance = Math.max(halfFloor, halfPct);
      const confidence: MatchCandidate["confidence"] =
        amountDelta <= halfTolerance && Math.abs(lag) <= 2 ? "high" : "low";
      pool.push({
        historyEntryId: entry.id,
        rowId: row.id,
        amountDelta,
        dateLagDays: lag,
        confidence,
        seriesId: row.seriesId ?? null,
      });
    }

    // Estimate-row pass: an entry matches a banded row when it's within
    // the band OR within the normal tolerance of the estimate. The
    // amountDelta is still measured against the estimate so ordering and
    // the inferred series tolerance stay sensible; a pure in-band match
    // (outside tolerance) is always "low" confidence so the user
    // confirms it.
    for (const p of spanProjected) {
      if (!sameSign(entry.amount, p.amount)) continue;
      const lag = daysBetween(entry.date, p.date);
      if (!Number.isFinite(lag)) continue;
      if (
        lag < -RECONCILIATION_DATE_LEAD_DAYS ||
        lag > RECONCILIATION_DATE_LAG_DAYS
      )
        continue;
      const inTolerance = amountsWithinTolerance(entry.amount, p.amount);
      const inSpan = amountWithinSpan(
        entry.amount,
        p.row.amountMin,
        p.row.amountMax,
      );
      if (!inTolerance && !inSpan) continue;
      const row = p.row;
      const amountDelta = Math.abs(
        Math.round(entry.amount * 100) - Math.round(p.amount * 100),
      );
      const halfFloor = RECONCILIATION_AMOUNT_FLOOR_CENTS / 2;
      const halfPct =
        (Math.max(Math.abs(entry.amount), Math.abs(p.amount)) *
          RECONCILIATION_AMOUNT_PCT *
          100) /
        2;
      const halfTolerance = Math.max(halfFloor, halfPct);
      const confidence: MatchCandidate["confidence"] =
        inTolerance && amountDelta <= halfTolerance && Math.abs(lag) <= 2
          ? "high"
          : "low";
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
// covered before the import are out of scope. `startOfMonth` matches
// the basis `coveredMonths` returned its keys under so fiscal-month
// callers stay aligned; defaults to 1 (calendar months) for legacy
// callers / tests that don't care.
export function findOrphans(
  rows: readonly Row[],
  columns: readonly Column[],
  newlyCovered: ReadonlySet<string>,
  reconciledRowIds: ReadonlySet<string>,
  startOfMonth: number = 1,
): OrphanRow[] {
  if (newlyCovered.size === 0) return [];
  const dateCol = findColumnByType(columns, "date");
  if (!dateCol) return [];
  const out: OrphanRow[] = [];
  for (const row of rows) {
    if (reconciledRowIds.has(row.id)) continue;
    if (row.kind !== "user") continue;
    const monthKey = getMonthKey(row.cells[dateCol.id], startOfMonth);
    if (monthKey === "undated") continue;
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
    // Store the observed lag's MAGNITUDE as the rule's late window: an
    // early-posting confirmation (negative lag) shouldn't collapse the
    // window to 0 — if a charge posted 3 days early once, allow 3 days
    // of late jitter too. Capped at the matcher's own late maximum. The
    // early side is the global `RECONCILIATION_DATE_LEAD_DAYS`, applied
    // uniformly by the rule-driven matchers, so it isn't stored here.
    dateLagDays: Math.min(
      Math.abs(match.dateLagDays),
      RECONCILIATION_DATE_LAG_DAYS,
    ),
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
  // Project each candidate row to its (date, amount, absCents,
  // amountCents) once. The previous loop called `readRowDateAmount` —
  // and recomputed `Math.round(Math.abs(...) * 100)` — for every
  // (entry, row) pair, even though row data is invariant across the
  // entry loop. With E entries × R rows this is up to E×R wasted
  // projections; doing it once collapses to R.
  type ProjectedRow = {
    row: Row;
    date: string;
    amount: number;
    absCents: number;
    amountCents: number;
  };
  const seriesRows: ProjectedRow[] = [];
  for (const r of rows) {
    if (r.seriesId !== rule.seriesId) continue;
    if (alreadyMatched.has(r.id)) continue;
    const ra = readRowDateAmount(r, dateCol.id, amountCol.id);
    if (!ra) continue;
    seriesRows.push({
      row: r,
      date: ra.date,
      amount: ra.amount,
      absCents: Math.round(Math.abs(ra.amount) * 100),
      amountCents: Math.round(ra.amount * 100),
    });
  }
  if (seriesRows.length === 0) return [];

  const pool: MatchCandidate[] = [];
  for (const entry of newEntries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransferId !== undefined) continue;
    if (alreadyMatched.has(`hist:${entry.id}`)) continue;
    if (!re.test(entry.description)) continue;
    // Project the entry once too — `Math.round(Math.abs(...) * 100)`
    // and the absolute-cents form are invariant across the row loop.
    const entryAbsCents = Math.round(Math.abs(entry.amount) * 100);
    const entryCents = Math.round(entry.amount * 100);
    for (const p of seriesRows) {
      if (!sameSign(entry.amount, p.amount)) continue;
      const lag = daysBetween(entry.date, p.date);
      if (!Number.isFinite(lag)) continue;
      if (lag < -RECONCILIATION_DATE_LEAD_DAYS || lag > rule.dateLagDays)
        continue;
      const tolerance = Math.max(
        RECONCILIATION_AMOUNT_FLOOR_CENTS,
        Math.max(entryAbsCents, p.absCents) * rule.amountTolerancePct,
      );
      const deltaCents = Math.abs(entryCents - p.amountCents);
      // An estimate row also matches when the entry lands inside its
      // signed [min, max] band, even past the rule's tolerance.
      if (
        deltaCents > tolerance &&
        !amountWithinSpan(entry.amount, p.row.amountMin, p.row.amountMax)
      ) {
        continue;
      }
      pool.push({
        historyEntryId: entry.id,
        rowId: p.row.id,
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

  // Index rows by `seriesId` so each (rule, entry) pair only walks
  // rows belonging to that rule's series instead of the entire row
  // list. Filters that would always be true for series-bound rows
  // (isCorrection / historyEntryId / transferId) are applied once
  // during indexing rather than per inner iteration. Each row is
  // projected to its (date, amount, absCents, amountCents) here too,
  // so the triple-nested inner loop below reads cached numbers instead
  // of re-running `readRowDateAmount` + `Math.round(Math.abs(...))` on
  // every (entry, rule, row) combination — the row data is invariant.
  type ProjectedRow = {
    row: Row;
    date: string;
    amount: number;
    absCents: number;
    amountCents: number;
  };
  const rowsBySeries = new Map<string, ProjectedRow[]>();
  for (const row of rows) {
    if (row.kind !== "user") continue;
    if (typeof row.seriesId !== "string" || row.seriesId === "") continue;
    const ra = readRowDateAmount(row, dateCol.id, amountCol.id);
    if (!ra) continue;
    const projected: ProjectedRow = {
      row,
      date: ra.date,
      amount: ra.amount,
      absCents: Math.round(Math.abs(ra.amount) * 100),
      amountCents: Math.round(ra.amount * 100),
    };
    const list = rowsBySeries.get(row.seriesId);
    if (list) list.push(projected);
    else rowsBySeries.set(row.seriesId, [projected]);
  }

  const pool: MatchCandidate[] = [];
  for (const entry of newEntries) {
    if (entry.hidden) continue;
    if (entry.collapsedIntoTransferId !== undefined) continue;
    // Project the entry's invariant amount-in-cents form once per
    // entry instead of once per (rule, row) combination.
    const entryAbsCents = Math.round(Math.abs(entry.amount) * 100);
    const entryCents = Math.round(entry.amount * 100);
    for (const c of compiled) {
      if (!c) continue;
      if (!c.re.test(entry.description)) continue;
      const seriesRows = rowsBySeries.get(c.rule.seriesId);
      if (!seriesRows) continue;
      for (const p of seriesRows) {
        if (!sameSign(entry.amount, p.amount)) continue;
        const lag = daysBetween(entry.date, p.date);
        if (!Number.isFinite(lag)) continue;
        if (lag < 0 || lag > c.rule.dateLagDays) continue;
        const tolerance = Math.max(
          RECONCILIATION_AMOUNT_FLOOR_CENTS,
          Math.max(entryAbsCents, p.absCents) * c.rule.amountTolerancePct,
        );
        const deltaCents = Math.abs(entryCents - p.amountCents);
        // An estimate row also matches when the entry lands inside its
        // signed [min, max] band, even past the rule's tolerance.
        if (
          deltaCents > tolerance &&
          !amountWithinSpan(entry.amount, p.row.amountMin, p.row.amountMax)
        ) {
          continue;
        }
        pool.push({
          historyEntryId: entry.id,
          rowId: p.row.id,
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

// First day of the fiscal month *after* `monthKey`. The orphan UI
// uses this as its "Move to next month start" quick-pick: a row in
// fiscal "2026-04" with startOfMonth=25 lands on 2026-05-25.
export function nextFiscalMonthStartDate(
  monthKey: string,
  startOfMonth: number,
): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  let y = Number(monthKey.slice(0, 4));
  let m = Number(monthKey.slice(5, 7)) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const nextKey = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  return monthFirstDay(nextKey, startOfMonth);
}

// Shift `rowDateIso` one calendar month forward, clamping the day to
// the target month's length so 2026-01-31 → 2026-02-28. Calendar
// math, not fiscal — this preserves the row's "same date" intuition
// even when the user runs a non-default `startOfMonth`.
export function nextMonthSameDate(rowDateIso: string): string {
  if (rowDateIso.length < 10) return rowDateIso;
  const y = Number(rowDateIso.slice(0, 4));
  const m = Number(rowDateIso.slice(5, 7));
  const d = Number(rowDateIso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return rowDateIso;
  }
  let ny = y;
  let nm = m + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  // Clamp the day to the target month's last calendar day. `Date.UTC`
  // with day=0 rolls back to the previous month's last day, so
  // passing `nm` (1-based) here yields the length of month `nm`.
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// Advance `rowDateIso` by whole calendar months (preserving the
// day-of-month, clamped to the target month's length) until it lands
// strictly after `afterDate`. Used to push a recurring prediction that
// never posted to its next occurrence slot past the latest imported
// transaction — rent predicted for the 1st, with bank data now through
// the 20th, lands on the 1st of next month rather than a stray date.
export function firstOccurrenceAfter(
  rowDateIso: string,
  afterDate: string,
): string {
  if (rowDateIso.length < 10) return rowDateIso;
  let d = rowDateIso;
  // 1200 months (100 years) is an unreachable guard against a malformed
  // date that never advances past `afterDate`.
  for (let i = 0; i < 1200 && d <= afterDate; i += 1) {
    d = nextMonthSameDate(d);
  }
  return d;
}

// One orphan row queued to move forward, with the date it should take.
export type OrphanMove = { rowId: string; toDate: string };

// Split orphan rows (predictions in newly-covered months that never
// posted) into ones safe to move forward silently and ones that need
// the user's confirmation in the reconciliation modal.
//
// A prediction dated on or before `latestHistoryDate` "obviously won't
// happen in the past" — the bank already has authoritative data through
// that date and the prediction didn't materialise — so it's moved past
// the latest transaction automatically:
//   - a recurring row (one with a `seriesId`) advances to its next
//     monthly occurrence after the latest date (`firstOccurrenceAfter`);
//   - a one-off row moves to the day after the latest date.
//
// The one case that is NOT silent: moving a recurring row forward would
// carry it onto or past the next existing occurrence of its own series
// (a later sibling row). That reorders the series, so it's surfaced as a
// prompt instead. Predictions dated AFTER the latest history date are
// still legitimately in the future and are left untouched — also
// returned as prompts so the modal's existing behaviour for them holds.
export type OrphanPlan = {
  autoMoves: OrphanMove[];
  prompts: OrphanRow[];
};

export function planOrphanMoves(
  orphans: readonly OrphanRow[],
  rows: readonly Row[],
  columns: readonly Column[],
  latestHistoryDate: string,
): OrphanPlan {
  const autoMoves: OrphanMove[] = [];
  const prompts: OrphanRow[] = [];
  const dateCol = findColumnByType(columns, "date");
  if (!dateCol || latestHistoryDate.length < 10) {
    return { autoMoves, prompts: [...orphans] };
  }
  const rowById = new Map(rows.map((r) => [r.id, r]));
  // Per series: the sorted list of occurrence dates across ALL rows
  // (not just orphans), so a move that would collide with a future
  // prediction is caught too.
  const seriesDates = new Map<string, string[]>();
  for (const r of rows) {
    const sid = r.seriesId;
    if (typeof sid !== "string" || sid === "") continue;
    const cell = r.cells[dateCol.id];
    if (typeof cell !== "string" || cell.length < 10) continue;
    const list = seriesDates.get(sid);
    if (list) list.push(cell);
    else seriesDates.set(sid, [cell]);
  }
  for (const list of seriesDates.values()) list.sort();

  for (const orphan of orphans) {
    const row = rowById.get(orphan.rowId);
    const cell = row ? row.cells[dateCol.id] : undefined;
    if (!row || typeof cell !== "string" || cell.length < 10) {
      prompts.push(orphan);
      continue;
    }
    // Still in the future relative to the bank's data — leave it.
    if (cell > latestHistoryDate) {
      prompts.push(orphan);
      continue;
    }
    const sid = row.seriesId;
    if (typeof sid === "string" && sid !== "") {
      const toDate = firstOccurrenceAfter(cell, latestHistoryDate);
      const siblings = seriesDates.get(sid) ?? [];
      // The earliest occurrence of this series strictly after the
      // orphan's own date — the "next recurring entry".
      const nextSibling = siblings.find((d) => d > cell);
      // Moving forward would land on or past that next occurrence: a
      // reorder the user should confirm.
      if (nextSibling !== undefined && toDate >= nextSibling) {
        prompts.push(orphan);
      } else {
        autoMoves.push({ rowId: orphan.rowId, toDate });
      }
    } else {
      autoMoves.push({
        rowId: orphan.rowId,
        toDate: addDaysIso(latestHistoryDate, 1),
      });
    }
  }
  return { autoMoves, prompts };
}

// True iff any other row in `seriesId` has a date whose fiscal month
// equals the one *after* `monthKey`. Used to suppress the "Move to
// next month, same date" orphan quick-pick when it would collide
// with an existing series occurrence in the destination month.
export function seriesHasOccurrenceInNextMonth(
  rows: readonly Row[],
  columns: readonly Column[],
  seriesId: string,
  monthKey: string,
  startOfMonth: number,
): boolean {
  const dateCol = findColumnByType(columns, "date");
  if (!dateCol) return false;
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return false;
  let y = Number(monthKey.slice(0, 4));
  let m = Number(monthKey.slice(5, 7)) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const targetKey = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  for (const r of rows) {
    if (r.seriesId !== seriesId) continue;
    const cell = r.cells[dateCol.id];
    if (typeof cell !== "string") continue;
    if (getMonthKey(cell, startOfMonth) === targetKey) return true;
  }
  return false;
}
