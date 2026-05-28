// History-coverage rules.
//
// A fiscal month is "covered" when imported bank-history makes it
// authoritative — no user-authored row should be added there, and
// any predicted row that didn't post in that window is an orphan.
//
// Rule:
//   M is covered iff
//     ∃ history.date > M.lastDay, AND
//     (∃ history.date < M.firstDay) OR (no user rows in M).
//
// The fiscal month boundaries follow `settings.startOfMonth`: with
// startOfMonth=25, fiscal "2026-04" spans 2026-04-25 → 2026-05-24,
// so coverage only flips on once history extends past May 24, not
// April 30. With startOfMonth=1 the helpers collapse to calendar
// months.
//
// Consequences:
// - The latest imported month is never covered (no entries beyond
//   it). Re-imports extending the upper bound flip the previous
//   trailing month into covered status.
// - Months entirely before the earliest import, where the user has
//   never authored anything, are covered (no user data to argue
//   otherwise).
// - Coverage is per-account: `coveredMonths` walks one account's
//   history + that account's rows. The caller is responsible for
//   pairing them up.

import { getMonthKey } from "./fiscal-month";
import { findColumnByType } from "./sheet";
import type { Column, HistoryEntry, Row } from "./types";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function monthFirstDay(monthKey: string, startOfMonth: number): string {
  return `${monthKey}-${String(startOfMonth).padStart(2, "0")}`;
}

function monthLastDay(monthKey: string, startOfMonth: number): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return `${monthKey}-31`;
  // Day before the next fiscal month starts. `Date.UTC` happily
  // overflows the month index (Dec → next Jan), so we pass `m`
  // (already 1-based here, i.e. the next month in 0-based terms)
  // along with `startOfMonth`, then step back one calendar day. With
  // startOfMonth=1 this collapses to the calendar-month last day.
  const d = new Date(Date.UTC(y, m, startOfMonth));
  d.setUTCDate(d.getUTCDate() - 1);
  const ny = d.getUTCFullYear();
  const nm = d.getUTCMonth() + 1;
  const nd = d.getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

// Map of fiscal-month → user-authored rows in that month. Excludes
// synthesized rows (history / transfer projections) since those
// don't belong to the "user data" set the coverage rule cares about.
function indexUserRowsByMonth(
  rows: readonly Row[],
  columns: readonly Column[],
  startOfMonth: number,
): Map<string, Row[]> {
  const dateCol = findColumnByType(columns, "date");
  const out = new Map<string, Row[]>();
  if (!dateCol) return out;
  for (const row of rows) {
    if (row.kind === "historic") continue;
    if (row.kind === "transfer") continue;
    const key = getMonthKey(row.cells[dateCol.id], startOfMonth);
    if (!MONTH_KEY_RE.test(key)) continue;
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
}

// True iff `monthKey` is covered given the account's history + the
// month's user rows. Pure — caller controls which rows count.
// `startOfMonth` defaults to 1 (calendar months) for callers that
// don't have access to settings; budget/reconciliation surfaces pass
// the user's `settings.startOfMonth` so the fiscal boundary moves
// with the column the rows are grouped under.
export function isMonthCovered(
  monthKey: string,
  history: readonly HistoryEntry[],
  userRowsInMonth: readonly Row[],
  startOfMonth: number = 1,
): boolean {
  if (!MONTH_KEY_RE.test(monthKey)) return false;
  const range = computeHistoryDateRange(history);
  return isMonthCoveredWithRange(
    monthKey,
    range,
    userRowsInMonth,
    startOfMonth,
  );
}

type HistoryDateRange = { min: string; max: string };

// Earliest / latest non-hidden, fully-dated history entry. With this
// pair, each month check in `coveredMonths` reduces to `min < firstDay`
// / `max > lastDay`.
function computeHistoryDateRange(
  history: readonly HistoryEntry[],
): HistoryDateRange {
  let min = "";
  let max = "";
  for (const h of history) {
    if (h.hidden) continue;
    if (h.date.length < 10) continue;
    if (min === "" || h.date < min) min = h.date;
    if (h.date > max) max = h.date;
  }
  return { min, max };
}

function isMonthCoveredWithRange(
  monthKey: string,
  range: HistoryDateRange,
  userRowsInMonth: readonly Row[],
  startOfMonth: number,
): boolean {
  const firstDay = monthFirstDay(monthKey, startOfMonth);
  const lastDay = monthLastDay(monthKey, startOfMonth);
  const hasAfter = range.max !== "" && range.max > lastDay;
  if (!hasAfter) return false;
  const hasBefore = range.min !== "" && range.min < firstDay;
  if (hasBefore) return true;
  return userRowsInMonth.length === 0;
}

// All currently-covered months for one account. Walks history once
// (sorted ascending) to find the min and max dates, then iterates
// every month from the earliest active month forward to the latest
// history date, applying `isMonthCovered`. The output set lists
// fiscal-month keys (`YYYY-MM`) using the given `startOfMonth`.
export function coveredMonths(
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
  startOfMonth: number = 1,
): Set<string> {
  const out = new Set<string>();
  if (history.length === 0) return out;

  // Range of dates we care about: from the earliest of (history,
  // user rows) to the latest history date. Months earlier are only
  // covered when there's an entry past them AND no user rows.
  const range = computeHistoryDateRange(history);
  let earliestDate = range.min;
  const latestHistoryDate = range.max;
  if (earliestDate === "" || latestHistoryDate === "") return out;

  const rowsByMonth = indexUserRowsByMonth(rows, columns, startOfMonth);
  // User rows may date earlier than the earliest history entry; in
  // that case we still want to evaluate those months (the rule will
  // come out false unless history brackets them, but the math is
  // free to run).
  for (const key of rowsByMonth.keys()) {
    const firstDay = monthFirstDay(key, startOfMonth);
    if (firstDay < earliestDate) earliestDate = firstDay;
  }

  // Walk one month before `earliestDate` too — a fresh import with
  // no preceding user rows still wants to flag the immediate-prior
  // month as covered (no history before it, no user rows in it,
  // history after it → covered).
  const startKey = previousMonthKey(getMonthKey(earliestDate, startOfMonth));
  const endKey = getMonthKey(latestHistoryDate, startOfMonth);
  // Sort guard: if input is degenerate just emit nothing rather than
  // loop forever.
  if (startKey > endKey) return out;

  let cur = startKey;
  // Cap the iteration so a pathological input can't run away. 12
  // years of months is comfortable headroom.
  for (let i = 0; i < 12 * 12; i++) {
    if (
      MONTH_KEY_RE.test(cur) &&
      isMonthCoveredWithRange(
        cur,
        range,
        rowsByMonth.get(cur) ?? [],
        startOfMonth,
      )
    ) {
      out.add(cur);
    }
    if (cur === endKey) break;
    cur = nextMonthKey(cur);
  }
  return out;
}

// Decrement a `YYYY-MM` key by one month, rolling January → previous
// December. Kept private to this module to avoid coupling with
// `sheet.ts`'s same-named helper.
function previousMonthKey(key: string): string {
  if (!MONTH_KEY_RE.test(key)) return key;
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7)) - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// Set difference: months covered after the import but not before.
// The reconciliation modal uses this to scope orphan detection — a
// month that was already covered before isn't newly authoritative,
// so any predictions inside it were either already reconciled or
// already orphaned by an earlier import.
export function coverageDelta(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const key of after) {
    if (!before.has(key)) out.add(key);
  }
  return out;
}

// Increment a `YYYY-MM` key by one month, rolling December → next
// January. Mirrors the inverse of `previousMonthKey` in `sheet.ts`.
export function nextMonthKey(key: string): string {
  if (!MONTH_KEY_RE.test(key)) return key;
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7)) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// Earliest date strictly after `date` that lands in an uncovered
// month for this account. Snaps a date edit forward when the user
// would otherwise move a row into a covered window. Walks fiscal
// months forward until one is uncovered; returns its first day.
export function nextUncoveredDate(
  date: string,
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
  startOfMonth: number = 1,
): string {
  // Bail before computing `coveredMonths` — a partial date can't be
  // placed in a month, so the snap has no anchor to work from. Called
  // per date-cell keystroke, so skipping the O(history) build matters
  // for the intermediate "2026-0" / "2026-04" / "2026-04-1" states.
  if (date.length < 10) return date;
  const covered = coveredMonths(history, rows, columns, startOfMonth);
  // If `date` itself sits in an uncovered month, no need to move.
  const startKey = getMonthKey(date, startOfMonth);
  if (!covered.has(startKey)) return date;
  let cur = nextMonthKey(startKey);
  for (let i = 0; i < 12 * 12; i++) {
    if (!covered.has(cur)) return monthFirstDay(cur, startOfMonth);
    cur = nextMonthKey(cur);
  }
  return date;
}

// True iff `date` lands in a covered month for the given history +
// rows. Convenience wrapper around `coveredMonths`.
export function isDateCovered(
  date: string,
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
  startOfMonth: number = 1,
): boolean {
  if (date.length < 7) return false;
  const key = getMonthKey(date, startOfMonth);
  return coveredMonths(history, rows, columns, startOfMonth).has(key);
}

// `getMonthKey` is fiscal-month aware (it honours `startOfMonth`);
// re-exported so callers that need both helpers can import from one
// place.
export { getMonthKey };
