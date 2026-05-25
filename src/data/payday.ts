// Auto-detection of the user's payday (Settings.startOfMonth).
//
// Salary in Sweden lands on the 25th most months, but holidays push
// the actual posting earlier (22nd, 23rd, 24th when the 25th is a
// weekend). The canonical payday is therefore the **latest**
// day-of-month observed across recent salary postings — that's the
// date a future paycheque will have posted by, so "next payday"
// always lands somewhere safe.
//
// Algorithm:
//   1. Find the seriesId with the largest median positive amount
//      across all user rows on all account-budgets (proxy for the
//      salary).
//   2. Collect history entries that match that series — either
//      already reconciled via a `SeriesMatchRule`, or, failing that,
//      the most recent positive entries on the user's accounts.
//   3. Pick the most recent ~6 postings and return `max(day-of-month)`,
//      clamped to [1, 28] so every calendar month has the chosen
//      day.
//
// Returns `fallback` when the algorithm can't make a confident
// pick — empty data, no salary series, all amounts negative, etc.

import { compilePattern } from "./match-rules";
import { findColumnByType } from "./sheet";
import type { Column, HistoryEntry, Row, UserData } from "./types";

const PAYDAY_MIN = 1;
const PAYDAY_MAX = 28;
const RECENT_POSTINGS = 6;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function readRow(
  row: Row,
  columns: readonly Column[],
): { date: string; amount: number } | null {
  const dateCol = findColumnByType(columns, "date");
  const amountCol = findColumnByType(columns, "amount");
  if (!dateCol || !amountCol) return null;
  const date = row.cells[dateCol.id];
  const amount = row.cells[amountCol.id];
  if (typeof date !== "string" || date.length < 10) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return { date, amount };
}

type SeriesAggregate = {
  seriesId: string;
  amounts: number[];
};

// Group every positive-amount user row by `seriesId`, returning the
// median amount per series. Negative-only series (rent, mortgage,
// utilities) are excluded — they can't be the salary.
function collectPositiveSeries(data: UserData): SeriesAggregate[] {
  const acc = new Map<string, number[]>();
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      for (const row of item.rows) {
        if (!row.seriesId) continue;
        if (row.isCorrection) continue;
        const ra = readRow(row, item.columns);
        if (!ra) continue;
        if (ra.amount <= 0) continue;
        const list = acc.get(row.seriesId);
        if (list) list.push(ra.amount);
        else acc.set(row.seriesId, [ra.amount]);
      }
    }
  }
  return Array.from(acc.entries()).map(([seriesId, amounts]) => ({
    seriesId,
    amounts,
  }));
}

// Among all positive-amount user series, pick the one with the
// largest median amount — that's the salary. Returns null when no
// such series exists.
function pickSalarySeries(data: UserData): string | null {
  const aggregates = collectPositiveSeries(data);
  if (aggregates.length === 0) return null;
  let best: { seriesId: string; med: number } | null = null;
  for (const agg of aggregates) {
    const med = median(agg.amounts);
    if (best === null || med > best.med) best = { seriesId: agg.seriesId, med };
  }
  return best?.seriesId ?? null;
}

// Postings (history dates) that are plausibly the salary. Prefers
// `seriesMatchRules` that already bind the salary series → bank
// pattern; falls back to picking the largest positive entry per
// calendar month across all accounts (close enough for the
// detector, and the user can always override).
function gatherSalaryPostings(
  data: UserData,
  salarySeriesId: string,
): string[] {
  const rules = data.seriesMatchRules.filter(
    (r) => r.seriesId === salarySeriesId,
  );
  const dates: string[] = [];
  const allHistory: HistoryEntry[] = [];
  for (const list of Object.values(data.history)) {
    for (const entry of list) {
      if (entry.hidden) continue;
      if (entry.collapsedIntoTransferId !== undefined) continue;
      allHistory.push(entry);
    }
  }

  if (rules.length > 0) {
    const compiled = rules
      .map((r) => {
        try {
          return compilePattern(r.pattern);
        } catch {
          return null;
        }
      })
      .filter((re): re is RegExp => re !== null);
    for (const entry of allHistory) {
      if (entry.amount <= 0) continue;
      if (compiled.some((re) => re.test(entry.description))) {
        dates.push(entry.date);
      }
    }
  }

  if (dates.length === 0) {
    // Fallback: largest positive credit per (account, calendar month).
    // Salary is usually the single biggest incoming payment of the
    // month, so this is a reasonable proxy in the absence of a rule.
    const byKey = new Map<string, HistoryEntry>();
    for (const list of Object.entries(data.history)) {
      const [accountId, entries] = list;
      for (const entry of entries) {
        if (entry.hidden) continue;
        if (entry.collapsedIntoTransferId !== undefined) continue;
        if (entry.amount <= 0) continue;
        const monthKey = entry.date.slice(0, 7);
        const k = `${accountId}|${monthKey}`;
        const prev = byKey.get(k);
        if (!prev || entry.amount > prev.amount) byKey.set(k, entry);
      }
    }
    for (const entry of byKey.values()) dates.push(entry.date);
  }

  return dates;
}

// Auto-detected payday day-of-month. Returns `fallback` (the
// current `settings.startOfMonth`) when the input doesn't support a
// confident pick.
export function detectPaydayDayOfMonth(
  data: UserData,
  fallback: number,
): number {
  const salarySeriesId = pickSalarySeries(data);
  if (salarySeriesId === null) return fallback;
  const dates = gatherSalaryPostings(data, salarySeriesId);
  if (dates.length === 0) return fallback;
  // Most-recent first by date string (ISO sorts lexicographically).
  const recent = [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const window = recent.slice(0, RECENT_POSTINGS);
  let best = 0;
  for (const d of window) {
    const day = Number(d.slice(8, 10));
    if (!Number.isFinite(day)) continue;
    if (day > best) best = day;
  }
  if (best === 0) return fallback;
  if (best < PAYDAY_MIN) return PAYDAY_MIN;
  if (best > PAYDAY_MAX) return PAYDAY_MAX;
  return best;
}

// Project the next payday on or after `today`. If today's day-of-
// month is on or before the payday, returns this month's payday;
// otherwise next month's. Used as the default move-to date for
// orphan rows in the reconciliation modal.
export function nextPaydayDate(payday: number, today: string): string {
  if (today.length < 10) return today;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const d = Number(today.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return today;
  }
  const clamped = Math.max(
    PAYDAY_MIN,
    Math.min(PAYDAY_MAX, Math.floor(payday)),
  );
  let targetY = y;
  let targetM = m;
  if (d > clamped) {
    targetM += 1;
    if (targetM > 12) {
      targetM = 1;
      targetY += 1;
    }
  }
  return (
    String(targetY).padStart(4, "0") +
    "-" +
    String(targetM).padStart(2, "0") +
    "-" +
    String(clamped).padStart(2, "0")
  );
}
