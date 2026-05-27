import type {
  CellValue,
  PrimaryIncomeMerchant,
  Row,
  SeriesMetadata,
  TransactionSortOrder,
} from "./types";

export function getMonthKey(
  value: CellValue,
  startOfMonth: number = 1,
): string {
  if (typeof value !== "string" || value.length < 10) {
    // Fall back to the YYYY-MM prefix when we can't read a full ISO
    // date (the fiscal-month shift only matters when we know the day).
    if (typeof value === "string" && value.length >= 7)
      return value.slice(0, 7);
    return "undated";
  }
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(5, 7));
  const d = Number(value.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return "undated";
  }
  // Fiscal month: every day from `startOfMonth` onward belongs to the
  // current calendar month's fiscal period; earlier days belong to the
  // previous one. With startOfMonth=1 this collapses to the calendar
  // month, which is the legacy behaviour.
  let fy = y;
  let fm = m;
  if (d < startOfMonth) {
    fm -= 1;
    if (fm < 1) {
      fm = 12;
      fy -= 1;
    }
  }
  return `${String(fy).padStart(4, "0")}-${String(fm).padStart(2, "0")}`;
}

// Shift a fiscal-month key by `delta` months. `+1` → next month; `-1` →
// previous month. Non-month input (`"undated"`, `""`) is returned
// unchanged so callers can run the helper over a mixed key set without
// pre-filtering. Year rolls when crossing the January / December
// boundary in either direction.
export function applyMonthShift(monthKey: string, delta: number): string {
  if (delta === 0) return monthKey;
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  let y = Number(monthKey.slice(0, 4));
  let m = Number(monthKey.slice(5, 7));
  m += delta;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// Group rows into fiscal-month buckets, honouring per-row
// `fiscalMonthShift` and cascading it to every other row dated the same
// day. Used by the budget view and the read-only viewer modal so both
// surfaces agree on which month a row belongs to.
//
// Cascade rule: if any row dated `D` carries an explicit shift, every
// row (regular + synthesized transfer + synthesized history) on date
// `D` inherits the same shift. When two rows on the same day disagree
// the first one wins — the user can clear the override on the
// disagreeing row to resolve. The cascade is computed dynamically here
// rather than stored on every row, so deleting / editing the anchor
// row automatically un-cascades the rest.
export function groupRowsByMonth(
  rows: Row[],
  dateColumnId: string,
  startOfMonth: number = 1,
): Map<string, Row[]> {
  // Pass 1: collect the dynamic shift for every shifted date. First
  // shift wins on a day; the anchor row is the only place the field is
  // stored so a same-day disagreement is rare and the picker resolves
  // it (clear the override on the row you don't want).
  const shiftByDate = new Map<string, -1 | 1>();
  for (const row of rows) {
    const shift = row.fiscalMonthShift;
    if (shift !== 1 && shift !== -1) continue;
    const date = row.cells[dateColumnId];
    if (typeof date !== "string" || date === "") continue;
    if (!shiftByDate.has(date)) shiftByDate.set(date, shift);
  }
  // Pass 2: bucket each row by `baseMonth + shift(date)`.
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const dateValue = row.cells[dateColumnId];
    let key = getMonthKey(dateValue, startOfMonth);
    if (typeof dateValue === "string" && dateValue !== "") {
      const cascade = shiftByDate.get(dateValue);
      if (cascade !== undefined) key = applyMonthShift(key, cascade);
    }
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

// Decide whether a row that belongs to a primary-income series should
// carry a `fiscalMonthShift` of `+1`, given the user-configured anchor
// day-of-month. The shift fires when the row landed in the calendar
// month immediately preceding its anchor day — i.e. the bank paid out
// a few days early to clear the weekend / holiday. Returns the
// computed shift (or `undefined` for "no shift"), so the caller can
// drop it onto the row directly.
//
// Edge cases:
// - No anchor day set → undefined (the user hasn't told us when
//   "real" payday is, so we can't decide). The validator drops anchor
//   days outside 1..31.
// - Row's day-of-month >= anchor day → undefined (the salary arrived
//   on or after the configured payday; no shift needed).
// - Row's day-of-month < anchor day → `+1` (the salary landed earlier
//   in the same month than the anchor day, so it's the next month's
//   pay arriving early).
//
// The check is intentionally lenient: it doesn't try to verify that
// the row's anchor day-of-month plus a day delta lines up with the
// configured rule. The user marked the series as primary income — we
// trust the flag and the anchor day, and shift whenever the actual day
// is earlier.
export function computePrimaryIncomeShift(
  isoDate: string,
  metadata: SeriesMetadata | undefined,
): -1 | 1 | undefined {
  if (!metadata?.isPrimaryIncome) return undefined;
  return shiftFromAnchor(isoDate, metadata.anchorDayOfMonth);
}

// Twin of `computePrimaryIncomeShift` for bank-imported history
// entries. Resolves the matching merchant by `key` against the
// pre-indexed merchant map and applies the same "date earlier than
// anchor" rule. `normaliseKey` is the pre-computed normalised
// description, threaded by callers that already paid for it.
//
// The merchants are passed as a `Map` (rather than the raw array
// they're stored as on `UserData`) because every call site iterates
// over many candidate entries: at import time a single statement may
// stamp shifts on 500+ new entries, and a budget render walks the
// account's full history. With the map, each entry is O(1) instead
// of an O(M) `.find()` over the merchants array.
export function computePrimaryIncomeShiftForHistory(
  normalisedKey: string,
  isoDate: string,
  merchantsByKey: ReadonlyMap<string, PrimaryIncomeMerchant>,
): -1 | 1 | undefined {
  if (merchantsByKey.size === 0 || normalisedKey === "") return undefined;
  const match = merchantsByKey.get(normalisedKey);
  if (!match) return undefined;
  return shiftFromAnchor(isoDate, match.anchorDayOfMonth);
}

// Build a `Map<key, PrimaryIncomeMerchant>` from the on-disk array.
// Callers that loop over many history entries pay one O(M) pass here
// and then get O(1) lookups inside the hot loop. Exported so import /
// rendering call sites can reuse the same index across the batch
// instead of rebuilding it per entry.
export function indexPrimaryIncomeMerchants(
  merchants: readonly PrimaryIncomeMerchant[],
): Map<string, PrimaryIncomeMerchant> {
  const out = new Map<string, PrimaryIncomeMerchant>();
  for (const m of merchants) out.set(m.key, m);
  return out;
}

// Decide whether a date earlier in its calendar month than the
// configured anchor day-of-month should be shifted into the next
// fiscal month. Exported because the merchant- and series-anchor
// callers can skip the merchant lookup once they've matched their
// own way (e.g. inside `applyMerchantToHistory`, where the merchant
// is implied by the outer filter) and just need the date check.
export function shiftFromAnchor(
  isoDate: string,
  anchor: number | undefined,
): -1 | 1 | undefined {
  if (typeof anchor !== "number" || anchor < 1 || anchor > 31) return undefined;
  if (isoDate.length < 10) return undefined;
  const day = Number(isoDate.slice(8, 10));
  if (!Number.isFinite(day)) return undefined;
  if (day < anchor) return 1;
  return undefined;
}

// ISO date that lands inside the fiscal month `monthKey` given the
// configured `startOfMonth`. Used to seed a new row's date when the
// user clicks the + button on a non-current month. With startOfMonth=25,
// fiscal "2026-05" spans 2026-05-25 → 2026-06-24, so a seed of
// `${monthKey}-01` would land in the previous bucket.
export function fiscalMonthSeedIso(
  monthKey: string,
  startOfMonth: number = 1,
): string {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "";
  return `${monthKey}-${String(startOfMonth).padStart(2, "0")}`;
}

// Fiscal-month key for "today" given a `startOfMonth`. Used to pick the
// month that should scroll into view on load and to enforce that the
// current month is always rendered even when it has no rows yet.
export function currentFiscalMonthKey(
  startOfMonth: number = 1,
  now: Date = new Date(),
): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return getMonthKey(iso, startOfMonth);
}

// Step one fiscal month backwards on a `YYYY-MM` key, rolling the year
// when crossing the January / December boundary. Non-month input (e.g.
// "undated") is returned unchanged so callers can iterate through a
// month set without filtering.
export function previousMonthKey(key: string): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7));
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

// Step one fiscal month forwards on a `YYYY-MM` key. Mirror of
// `previousMonthKey` — used to compute the future-month cutoff when
// the user has asked the editable sheet to expose a few months of
// upcoming entries by default.
export function nextMonthKey(key: string): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7));
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

export function sortMonthKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((a, b) => {
    if (a === "undated") return 1;
    if (b === "undated") return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

// Shift an ISO date into `targetMonth` ("YYYY-MM"), preserving the
// day-of-month and clamping to the target month's length so e.g. Jan 31
// → Feb 28/29 instead of overflowing into March.
export function shiftIsoToMonth(iso: string, targetMonth: string): string {
  if (iso.length < 10 || !/^\d{4}-\d{2}$/.test(targetMonth)) return iso;
  const day = Number(iso.slice(8, 10));
  const [y, m] = targetMonth.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) {
    return iso;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const clamped = Math.min(Math.max(1, day), lastDay);
  return `${targetMonth}-${String(clamped).padStart(2, "0")}`;
}

// Comparator for plain transaction lists keyed by an ISO date string,
// used by surfaces that don't have a `RowSortContext` (the account
// transfer log, the account history modal). Returns the standard
// {-1, 0, 1} so call sites can pass it directly to `Array.prototype.sort`.
// `order === "newestFirst"` flips the comparison so the latest entries
// land at the start of the array.
export function compareDateStrings(
  a: string,
  b: string,
  order: TransactionSortOrder,
): number {
  if (a === b) return 0;
  if (order === "newestFirst") return a < b ? 1 : -1;
  return a < b ? -1 : 1;
}
