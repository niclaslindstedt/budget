// History-coverage rules.
//
// A fiscal month is "covered" when imported bank-history makes it
// authoritative — no user-authored row should be added there, and
// any predicted row that didn't post in that window is an orphan.
//
// Rule (worked out with the user, see plan):
//   M is covered iff
//     ∃ history.date > M.lastDay, AND
//     (∃ history.date < M.firstDay) OR (no user rows in M).
//
// The fiscal month boundaries follow `settings.startOfMonth`: with
// startOfMonth=25, fiscal "2026-04" spans 2026-04-25 → 2026-05-24,
// so coverage only flips on once history extends past May 24 (not
// April 30). With startOfMonth=1 the helpers collapse to calendar
// months — the legacy behaviour kept for default callers and tests.
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
  // startOfMonth=1 this collapses to the calendar-month last day
  // — the legacy behaviour for default callers.
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
    if (row.historyEntryId) continue;
    if (row.transferId) continue;
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
  const firstDay = monthFirstDay(monthKey, startOfMonth);
  const lastDay = monthLastDay(monthKey, startOfMonth);
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
  let earliestDate = "";
  let latestHistoryDate = "";
  for (const h of history) {
    if (h.hidden) continue;
    if (h.date.length < 10) continue;
    if (earliestDate === "" || h.date < earliestDate) earliestDate = h.date;
    if (h.date > latestHistoryDate) latestHistoryDate = h.date;
  }
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
  // calendar month as covered (the "Or rather in this case, February
  // is covered" case from the design discussion: no history before
  // Feb 1, no user rows in Feb, but history after Feb 28 → Feb is
  // covered because there's nothing left to argue against it).
  const startKey = previousMonthKey(getMonthKey(earliestDate, startOfMonth));
  const endKey = getMonthKey(latestHistoryDate, startOfMonth);
  // Sort guard: shouldn't happen, but if input is degenerate just
  // emit nothing rather than loop forever.
  if (startKey > endKey) return out;

  let cur = startKey;
  // Cap the iteration to prevent runaway in pathological inputs.
  // 12 years of months is more than enough headroom and keeps the
  // worst case O(144) regardless of input size.
  for (let i = 0; i < 12 * 12; i++) {
    if (
      isMonthCovered(cur, history, rowsByMonth.get(cur) ?? [], startOfMonth)
    ) {
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
// when they try to move a row into a covered window. Walks fiscal
// months forward until one is uncovered; returns its first day.
export function nextUncoveredDate(
  date: string,
  history: readonly HistoryEntry[],
  rows: readonly Row[],
  columns: readonly Column[],
  startOfMonth: number = 1,
): string {
  const covered = coveredMonths(history, rows, columns, startOfMonth);
  if (date.length < 10) return date;
  // Start in the candidate month: if `date` itself sits in an
  // uncovered month we don't need to move.
  const startKey = getMonthKey(date, startOfMonth);
  if (!covered.has(startKey)) return date;
  // Walk forward until the first uncovered month.
  let cur = nextMonthKey(startKey);
  for (let i = 0; i < 12 * 12; i++) {
    if (!covered.has(cur)) return monthFirstDay(cur, startOfMonth);
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
  startOfMonth: number = 1,
): boolean {
  if (date.length < 7) return false;
  const key = getMonthKey(date, startOfMonth);
  return coveredMonths(history, rows, columns, startOfMonth).has(key);
}

// `getMonthKey` is fiscal-month aware (it honours `startOfMonth`);
// re-exported to keep the import surface small for the `App.tsx`
// wire-up that needs both helpers in one place.
export { getMonthKey };
