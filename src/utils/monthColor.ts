// Resolves the per-month pastel defined as `--month-1` … `--month-12`
// in `styles.css`. Callers pass the calendar month (1-12) of the row's
// own date — not the fiscal-month bucket the row happens to sit in —
// so a January row that landed in February's table still reads as
// January.

export function monthColorVar(monthNum: number): string | undefined {
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    return undefined;
  }
  return `var(--month-${monthNum})`;
}

// Parses the calendar month out of either an ISO date (`YYYY-MM-DD`)
// or a fiscal-month key (`YYYY-MM`). Returns null for `"undated"` and
// anything malformed so callers can fall back to a neutral colour.
export function monthNumberFromKey(key: string): number | null {
  if (typeof key !== "string" || key.length < 7) return null;
  const n = Number(key.slice(5, 7));
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return n;
}
