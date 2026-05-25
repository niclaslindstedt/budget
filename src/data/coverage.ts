// History-coverage rules.
//
// A calendar month is "covered" when imported bank-history makes it
// authoritative — no user-authored row should be added there, and
// any predicted row that didn't post in that window is an orphan.
//
// Rule (worked out with the user, see plan):
//   M is covered iff
//     ∃ history.date > M.lastDay, AND
//     (∃ history.date < M.firstDay) OR (no user rows in M).
//
// Consequences:
// - The latest imported month is never covered (no entries beyond
//   it). Re-imports extending the upper bound flip the previous
//   trailing month into covered status.
// - Months entirely before the earliest import, where the user has
//   never authored anything, are covered (no user data to argue
//   otherwise). The user explicitly wanted this — see the plan's
//   worked example "import March 3 → June 28, user entries from
//   April".
// - Coverage is per-account: `coveredMonths` walks one account's
//   history + that account's rows. The caller is responsible for
//   pairing them up.

import { findColumnByType, getMonthKey } from "./sheet";
import type { CellValue, Column, HistoryEntry, Row } from "./types";

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function monthFirstDay(monthKey: string): string {
  return `${monthKey}-01`;
}

function monthLastDay(monthKey: string): string {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return `${monthKey}-31`;
  // JavaScript's day=0 trick gives the last day of the previous
  // month → ask for month+1 day 0.
  const d = new Date(Date.UTC(y, m, 0));
  return `${monthKey}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Calendar-month key (`YYYY-MM`) for an ISO date. Falls back to
// `null` for undated / malformed inputs so the caller can skip them
// rather than misfile under "1970-01".
function calendarMonthKey(value: CellValue): string | null {
  if (typeof value !== "string" || value.length < 7) return null;
  const key = value.slice(0, 7);
  return MONTH_KEY_RE.test(key) ? key : null;
}

// Map of calendar-month → user-authored rows in that month. Excludes
// synthesized rows (history / transfer projections) since those
// don't belong to the "user data" set the coverage rule cares about.
function indexUserRowsByMonth(
  rows: readonly Row[],
  columns: readonly Column[],
): Map<string, Row[]> {
  const dateCol = findColumnByType(columns, "date");
  const out = new Map<string, Row[]>();
  if (!dateCol) return out;
  for (const row of rows) {
    if (row.historyEntryId) continue;
    if (row.transferId) continue;
    const key = calendarMonthKey(row.cells[dateCol.id]);
    if (!key) continue;
    const list = out.get(key);
    if (list) list.push(row);
    else out.set(key, [row]);
  }
  return out;
}

// True iff `monthKey` is covered given the account's history + the
// month's user rows. Pure — caller controls which rows count.
export function isMonthCovered(
  monthKey: string,
  history: readonly HistoryEntry[],
  userRowsInMonth: readonly Row[],
): boolean {
  if (!MONTH_KEY_RE.test(monthKey)) return false;
  const firstDay = monthFirstDay(monthKey);
  const lastDay = monthLastDay(monthKey);
  let hasAfter = false;
  let hasBefore = false;
  for (const h of history) {
    if (h.hidden) continue;
    if (h.date.length < 10) continue;
    if (h.date > lastDay) hasAfter = true;
    if (h.date < firstDay) hasBefore = true;
    if (hasAfter && hasBefore) break;
  }
  if (!hasAfter) return false;
  if (hasBefore) return true;
  return userRowsInMonth.length === 0;
}

// All currently-covered months for one account. Walks history once
// (sorted ascending) to find the min and max dates, then iterates
// every month from the earliest active month forward to the latest
// history date, applying `isMonthCovered`. The output set lists
// calendar-month keys (`YYYY-MM`).
export function coveredMonths(
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
): Set<string> {
  const out = new Set<string>();
  if (history.length === 0) return out;

  // Range of dates we care about: from the earliest of (history,
  // user rows) to the latest history date. Months earlier are only
  // covered when there's an entry past them AND no user rows.
  let earliestDate = "";
  let latestHistoryDate = "";
  for (const h of history) {
    if (h.hidden) continue;
    if (h.date.length < 10) continue;
    if (earliestDate === "" || h.date < earliestDate) earliestDate = h.date;
    if (h.date > latestHistoryDate) latestHistoryDate = h.date;
  }
  if (earliestDate === "" || latestHistoryDate === "") return out;

  const rowsByMonth = indexUserRowsByMonth(rows, columns);
  // User rows may date earlier than the earliest history entry; in
  // that case we still want to evaluate those months (the rule will
  // come out false unless history brackets them, but the math is
  // free to run).
  for (const key of rowsByMonth.keys()) {
    const firstDay = `${key}-01`;
    if (firstDay < earliestDate) earliestDate = firstDay;
  }

  // Walk one month before `earliestDate` too — a fresh import with
  // no preceding user rows still wants to flag the immediate-prior
  // calendar month as covered (the "Or rather in this case, February
  // is covered" case from the design discussion: no history before
  // Feb 1, no user rows in Feb, but history after Feb 28 → Feb is
  // covered because there's nothing left to argue against it).
  const startKey = previousMonthKey(earliestDate.slice(0, 7));
  const endKey = latestHistoryDate.slice(0, 7);
  // Sort guard: shouldn't happen, but if input is degenerate just
  // emit nothing rather than loop forever.
  if (startKey > endKey) return out;

  let cur = startKey;
  // Cap the iteration to prevent runaway in pathological inputs.
  // 12 years of months is more than enough headroom and keeps the
  // worst case O(144) regardless of input size.
  for (let i = 0; i < 12 * 12; i++) {
    if (isMonthCovered(cur, history, rowsByMonth.get(cur) ?? [])) {
      out.add(cur);
    }
    if (cur === endKey) break;
    cur = nextMonthKey(cur);
  }
  return out;
}

// Decrement a `YYYY-MM` key by one month, rolling January → previous
// December. Distinct from `sheet.ts`'s `previousMonthKey` only in
// that we keep it private to this module to avoid a coupling.
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
// month for this account. Used to snap a user's date edit forward
// when they try to move a row into a covered window. Walks months
// forward until one is uncovered; returns its first day.
export function nextUncoveredDate(
  date: string,
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
): string {
  const covered = coveredMonths(history, rows, columns);
  if (date.length < 10) return date;
  // Start in the candidate month: if `date` itself sits in an
  // uncovered month we don't need to move.
  const startKey = date.slice(0, 7);
  if (!covered.has(startKey)) return date;
  // Walk forward until the first uncovered month.
  let cur = nextMonthKey(startKey);
  for (let i = 0; i < 12 * 12; i++) {
    if (!covered.has(cur)) return `${cur}-01`;
    cur = nextMonthKey(cur);
  }
  return date; // Fallback: nothing uncovered found (shouldn't happen).
}

// True iff `date` lands in a covered month for the given history +
// rows. Convenience wrapper around `coveredMonths`.
export function isDateCovered(
  date: string,
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
): boolean {
  if (date.length < 7) return false;
  const key = date.slice(0, 7);
  return coveredMonths(history, rows, columns).has(key);
}

// `getMonthKey` is fiscal-month aware (it honours `startOfMonth`);
// coverage is strictly calendar-month, so we never call it from
// here. Re-exported only to keep the import surface small for the
// `App.tsx` wire-up that needs both helpers in one place.
export { getMonthKey };
