export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysIso(iso: string, days: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const target = new Date(Date.UTC(y, m - 1, d + days));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const td = String(target.getUTCDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

// Whole-day difference `aDate - bDate` for two `YYYY-MM-DD` ISO dates —
// positive when `a` is later. Computed in UTC so it never trips over a
// DST boundary. Returns `NaN` if either string isn't a parseable date,
// so callers can guard before using the result.
export function diffDaysIso(a: string, b: string): number {
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
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.round((aMs - bMs) / 86400000);
}

export function addMonthsIso(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return iso;
  }
  const target = new Date(Date.UTC(y, m - 1 + months, d));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const td = String(target.getUTCDate()).padStart(2, "0");
  return `${ty}-${tm}-${td}`;
}

// Month-number domain helpers for month-stepped range sliders (the
// "Dates" filter in the search modals). A "month number" is
// `year * 12 + (month - 1)` so a slider gets a dense integer domain its
// thumb can land on; day-level resolution is dropped because it's more
// granularity than a transaction-browsing filter needs. The slider maps
// ISO dates to/from this domain via the helpers below.
export function isoToMonthNum(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
}

export function monthNumToKey(month: number): string {
  const y = Math.floor(month / 12);
  const m = (month % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// First day of the month — the inclusive lower ISO bound a min thumb
// commits to.
export function monthNumToIsoStart(month: number): string {
  return `${monthNumToKey(month)}-01`;
}

// Last day of the month — the inclusive upper ISO bound a max thumb
// commits to, so the band covers the whole selected month. Day 0 of the
// following month resolves to the last day of this one, handling
// February and 30-day months without a lookup table.
export function monthNumToIsoEnd(month: number): string {
  const y = Math.floor(month / 12);
  const m = month % 12;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${monthNumToKey(month)}-${String(lastDay).padStart(2, "0")}`;
}
