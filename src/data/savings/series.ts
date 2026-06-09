// Builds the single line behind the savings "Visualize value" chart from the
// selected accounts' recorded balance snapshots. Pure and presentation-free
// (the data layer must not reach into components): it emits `{ x, y }` points
// and the modal maps them to a themed colour + translated label. Mirrors
// `buildPropertyValueSeries`.
//
// One combined line: the *total* set aside across the chosen accounts at each
// date. Savings balances are dated snapshots taken independently per account,
// so the union of every snapshot date is sampled and, at each, every selected
// account contributes its most recent balance on or before that date (the last
// known value carried forward). An account with no snapshot yet at a given
// date hasn't "started" and contributes 0 — so the total climbs as accounts
// come online and as each is topped up.

import type { Saving } from "../types";

export type SeriesPoint = { x: number; y: number };

// Parse an ISO yyyy-mm-dd date to epoch ms (UTC midnight, round-trips back to
// the same date string). Returns null for a malformed value so a bad snapshot
// is skipped rather than charting NaN.
function isoToMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function buildSavingsTotalSeries(
  savings: readonly Saving[],
  selectedIds: readonly string[],
): SeriesPoint[] {
  const selected = new Set(selectedIds);

  // Per selected account, its valid snapshots sorted ascending by date.
  const perAccount: { ms: number; value: number }[][] = [];
  for (const saving of savings) {
    if (!selected.has(saving.id)) continue;
    const points = saving.balanceHistory
      .map((p) => ({ ms: isoToMs(p.date), value: p.value }))
      .filter((p): p is { ms: number; value: number } => p.ms !== null)
      .sort((a, b) => a.ms - b.ms);
    if (points.length > 0) perAccount.push(points);
  }

  if (perAccount.length === 0) return [];

  // The union of every snapshot date across the selected accounts.
  const dateSet = new Set<number>();
  for (const points of perAccount) {
    for (const p of points) dateSet.add(p.ms);
  }
  const dates = [...dateSet].sort((a, b) => a - b);

  // The most recent balance on or before `ms` for one account's (ascending)
  // points — the last known value carried forward. 0 before its first snapshot.
  const balanceAt = (
    points: { ms: number; value: number }[],
    ms: number,
  ): number => {
    let value = 0;
    for (const p of points) {
      if (p.ms <= ms) value = p.value;
      else break;
    }
    return value;
  };

  return dates.map((ms) => {
    let total = 0;
    for (const points of perAccount) total += balanceAt(points, ms);
    return { x: ms, y: total };
  });
}
