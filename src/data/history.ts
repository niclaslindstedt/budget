import type { HistoryEntry } from "./types";
import { diffDaysIso } from "../utils/date";

// The inclusive date span covered by a set of imported bank transactions
// — the earliest and latest entry date. Consumed by both the Accounts and
// Savings tables (which each store their transactions under their id in
// `UserData.history`), so it lives at the data root rather than in either
// page's directory.
//
// ISO `YYYY-MM-DD` strings sort lexicographically, so min / max are plain
// string comparisons — no Date parsing needed. Hidden entries still count:
// they're part of the imported statement and contribute to the running
// balance, so the interval reflects them too. Returns null when there are
// no entries (or none carry a usable date) so callers can render a
// placeholder instead of an empty range.
export function historyDateRange(
  entries: readonly HistoryEntry[] | undefined,
): { start: string; end: string } | null {
  if (!entries || entries.length === 0) return null;
  let start: string | undefined;
  let end: string | undefined;
  for (const entry of entries) {
    const date = entry.date;
    if (typeof date !== "string" || date.length < 10) continue;
    if (start === undefined || date < start) start = date;
    if (end === undefined || date > end) end = date;
  }
  if (start === undefined || end === undefined) return null;
  return { start, end };
}

// How stale an account is, bucketed from the age (in whole days) of its
// most recent imported transaction — drives the colour of the "Last
// activity" cell on the Accounts / Savings tables. `today` is passed in
// (e.g. `todayIso()`) so the classifier stays pure and testable.
//
// Buckets, per the recency thresholds the colour key encodes: `fresh` =
// today or yesterday (≤ 1 day, green), `recent` = 2–3 days (yellow),
// `aging` = 4–6 days (orange), `stale` = a week or more (≥ 7 days, red).
// A future-dated entry (negative age) counts as `fresh`. Returns null
// when `lastIso` isn't a parseable date so callers fall back to a neutral
// colour.
export type HistoryStaleness = "fresh" | "recent" | "aging" | "stale";

export function historyStaleness(
  lastIso: string,
  today: string,
): HistoryStaleness | null {
  const age = diffDaysIso(today, lastIso);
  if (Number.isNaN(age)) return null;
  if (age <= 1) return "fresh";
  if (age <= 3) return "recent";
  if (age <= 6) return "aging";
  return "stale";
}
