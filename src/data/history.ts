import type { HistoryEntry } from "./types";

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
