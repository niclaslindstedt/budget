import { DEFAULT_SHEET_COLOR, DEFAULT_SHEET_GLYPH } from "./constants";
import { normaliseDescription } from "./description-normaliser";
import { findMatchingRule } from "./match-rules";
import type {
  AccountBudget,
  AccountsView,
  CellValue,
  Column,
  ColumnType,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  SeriesMetadata,
  Sheet,
  SheetGlyph,
  SheetItem,
  SheetType,
  Transfer,
  TransactionSortOrder,
  UserData,
} from "./types";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDefaultAccountBudget(
  accountId: string | null = null,
): AccountBudget {
  const columns: Column[] = [
    { id: newId(), type: "date", label: "Date" },
    { id: newId(), type: "description", label: "Description" },
    { id: newId(), type: "type", label: "Type" },
    { id: newId(), type: "amount", label: "Amount" },
    { id: newId(), type: "balance", label: "Balance" },
    { id: newId(), type: "completed", label: "Done" },
  ];
  return {
    id: newId(),
    type: "accountBudget",
    accountId,
    columns,
    rows: [],
  };
}

export function createDefaultAccountsView(): AccountsView {
  return { id: newId(), type: "accountsView" };
}

export function createDefaultSheet(
  name = "Budget",
  accountId: string | null = null,
  overrides: {
    type?: SheetType;
    glyph?: SheetGlyph;
    color?: string;
    description?: string;
  } = {},
): Sheet {
  const type = overrides.type ?? "budget";
  // The Accounts flavour renders a global dashboard, not a per-account
  // ledger — seed an AccountsView in place of the budget block. Other
  // flavours fall back to a fresh AccountBudget bound to `accountId`
  // (which may be null for a free-standing forward-looking ledger).
  const items: SheetItem[] =
    type === "accounts"
      ? [createDefaultAccountsView()]
      : [createDefaultAccountBudget(accountId)];
  return {
    id: newId(),
    name,
    type,
    glyph: overrides.glyph ?? DEFAULT_SHEET_GLYPH,
    color: overrides.color ?? DEFAULT_SHEET_COLOR,
    description: overrides.description ?? "",
    items,
  };
}

export function findColumnByType(
  columns: readonly Column[],
  type: ColumnType,
): Column | undefined {
  return columns.find((c) => c.type === type);
}

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
  const anchor = metadata.anchorDayOfMonth;
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

// Secondary-sort context for `sortRowsByDate`. When supplied, rows
// sharing the same date are ordered by: incomes first, then by largest
// category sum (within that date+sign group) descending, then by
// absolute amount descending within the category, then alphabetically
// by description. Without it, the function falls back to a date-only
// sort (legacy behaviour kept for callers — `rowsInSeriesFrom`,
// existing unit tests — where the within-date order doesn't matter).
export type RowSortContext = {
  descriptionColumnId: string;
  amountColumnId: string;
  typesById: ReadonlyMap<string, EntryType>;
};

function rowDateString(row: Row, dateColumnId: string): string {
  const v = row.cells[dateColumnId];
  return typeof v === "string" ? v : "";
}

function rowAmountNumber(row: Row, amountColumnId: string): number {
  const v = row.cells[amountColumnId];
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowDescriptionString(row: Row, descriptionColumnId: string): string {
  const v = row.cells[descriptionColumnId];
  return typeof v === "string" ? v : "";
}

function rowCategoryKey(
  row: Row,
  typesById: ReadonlyMap<string, EntryType>,
): string {
  if (!row.typeId) return "";
  const type = typesById.get(row.typeId);
  return type ? type.categoryId : "";
}

function rowIsIncome(
  amount: number,
  row: Row,
  typesById: ReadonlyMap<string, EntryType>,
): boolean {
  if (amount > 0) return true;
  if (amount < 0) return false;
  if (row.typeId) {
    const type = typesById.get(row.typeId);
    if (type?.kind === "income") return true;
  }
  return false;
}

export function sortRowsByDate(
  rows: Row[],
  dateColumnId: string,
  ctx?: RowSortContext,
): Row[] {
  if (!ctx) {
    return [...rows].sort((a, b) => {
      const sa = rowDateString(a, dateColumnId);
      const sb = rowDateString(b, dateColumnId);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });
  }
  type Aux = {
    row: Row;
    date: string;
    amount: number;
    absAmount: number;
    isIncome: boolean;
    categoryKey: string;
    desc: string;
  };
  const auxes: Aux[] = rows.map((row) => {
    const amount = rowAmountNumber(row, ctx.amountColumnId);
    return {
      row,
      date: rowDateString(row, dateColumnId),
      amount,
      absAmount: Math.abs(amount),
      isIncome: rowIsIncome(amount, row, ctx.typesById),
      categoryKey: rowCategoryKey(row, ctx.typesById),
      desc: rowDescriptionString(row, ctx.descriptionColumnId),
    };
  });
  // Per (date, income/expense) bucket, the absolute-amount sum of each
  // category. Drives the "largest category first" ordering inside each
  // date — the category whose rows add up to the most ends up on top,
  // regardless of how many rows it has.
  const sumByBucket = new Map<string, Map<string, number>>();
  for (const aux of auxes) {
    const bucketKey = `${aux.date}|${aux.isIncome ? "i" : "e"}`;
    let inner = sumByBucket.get(bucketKey);
    if (!inner) {
      inner = new Map();
      sumByBucket.set(bucketKey, inner);
    }
    inner.set(
      aux.categoryKey,
      (inner.get(aux.categoryKey) ?? 0) + aux.absAmount,
    );
  }
  return auxes
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.isIncome !== b.isIncome) return a.isIncome ? -1 : 1;
      const bucketKey = `${a.date}|${a.isIncome ? "i" : "e"}`;
      const inner = sumByBucket.get(bucketKey);
      const sa = inner?.get(a.categoryKey) ?? 0;
      const sb = inner?.get(b.categoryKey) ?? 0;
      if (sa !== sb) return sb - sa;
      // Two categories with the same sum still need a stable grouping
      // so their rows don't interleave — break sum-ties by category id.
      if (a.categoryKey !== b.categoryKey) {
        return a.categoryKey < b.categoryKey ? -1 : 1;
      }
      if (a.absAmount !== b.absAmount) return b.absAmount - a.absAmount;
      return a.desc.localeCompare(b.desc);
    })
    .map((aux) => aux.row);
}

// Flip the order at date boundaries so the latest day sits at the top
// of each month, matching a descending month order. Within-date
// ordering (incomes first, largest category first, etc.) is left
// untouched so the secondary sort `sortRowsByDate` applies still
// reads the same way inside a given day. Lifted out of
// `BudgetViewerModal` so every display surface that wants a
// newest-first ledger can reuse the same helper without duplicating
// the bucketing.
export function reverseRowsByDay(rows: Row[], dateColumnId: string): Row[] {
  if (rows.length === 0) return rows;
  const groups: Row[][] = [];
  let currentDate: string | null = null;
  for (const row of rows) {
    const v = row.cells[dateColumnId];
    const dateStr = typeof v === "string" ? v : "";
    if (currentDate === null || dateStr !== currentDate) {
      groups.push([row]);
      currentDate = dateStr;
    } else {
      groups[groups.length - 1].push(row);
    }
  }
  const out: Row[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    for (const row of groups[i]) out.push(row);
  }
  return out;
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

// Running balance per row, chronological across the whole AccountBudget
// so the total carries across months. Returns a map keyed by row id.
// `openingBalance` seeds the running total — it represents money the
// account already held before the first row in the view (e.g. the
// pre-statement balance anchored by an imported history file). Pass
// 0 for the historical behaviour.
//
// `balanceOverrides` lets a caller pin the running total to a known
// value at specific rows — imported bank-statement entries carry an
// authoritative post-transaction balance, and feeding that map in
// snaps the running total to the bank's number at every history row.
// Acts as a silent balance correction: any forecast amounts the user
// authored on or before the anchor are absorbed, and the next row
// resumes its running computation from the anchored value. Rows
// without an override fall through to the amount-based accumulator.
export function computeBalances(
  item: AccountBudget,
  openingBalance = 0,
  effectiveAmounts?: ReadonlyMap<string, number>,
  balanceOverrides?: ReadonlyMap<string, number>,
  sortContext?: RowSortContext,
): Map<string, number> {
  const result = new Map<string, number>();
  const dateCol = findColumnByType(item.columns, "date");
  const amountCol = findColumnByType(item.columns, "amount");
  if (!dateCol || !amountCol) return result;
  const sorted = sortRowsByDate(item.rows, dateCol.id, sortContext);
  let running = openingBalance;
  for (const row of sorted) {
    const override = balanceOverrides?.get(row.id);
    if (override !== undefined) {
      running = override;
    } else {
      // When an effective-amounts map is supplied, prefer it over the
      // stored cell — that's how formula rows get their evaluated value
      // into the running balance. Falls back to the cell so existing
      // call sites that haven't been threaded through the resolver
      // behave exactly as before.
      let amount: number;
      if (effectiveAmounts && effectiveAmounts.has(row.id)) {
        amount = effectiveAmounts.get(row.id) ?? 0;
      } else {
        const raw = row.cells[amountCol.id];
        amount = typeof raw === "number" ? raw : Number(raw) || 0;
      }
      running += amount;
    }
    result.set(row.id, running);
  }
  return result;
}

export function moveColumn(
  columns: Column[],
  fromId: string,
  toId: string,
): Column[] {
  if (fromId === toId) return columns;
  const fromIdx = columns.findIndex((c) => c.id === fromId);
  const toIdx = columns.findIndex((c) => c.id === toId);
  if (fromIdx < 0 || toIdx < 0) return columns;
  const next = [...columns];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

export function createEmptyRow(
  columns: Column[],
  defaults: Partial<Record<ColumnType, CellValue>> = {},
): Row {
  const cells: Record<string, CellValue> = {};
  for (const col of columns) {
    if (col.type in defaults) cells[col.id] = defaults[col.type] ?? null;
  }
  return { id: newId(), cells };
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

// A row only earns a slot in persisted storage once it carries the
// fields the sheet exists to record: a description and an amount.
// Rows that are blank or half-filled stay in memory while the user is
// editing them but never reach `localStorage`, so a refresh discards
// transient placeholders instead of resurrecting them.
export function isRowSavable(row: Row, columns: Column[]): boolean {
  const desc = findColumnByType(columns, "description");
  const amount = findColumnByType(columns, "amount");
  if (!desc || !amount) return true;
  // A formula row satisfies the amount requirement regardless of the
  // cached numeric cell — the effective amount comes from evaluation
  // at render time.
  const hasAmount =
    typeof row.cells[amount.id] === "number" ||
    typeof row.amountFormula === "string";
  return hasText(row.cells[desc.id]) && hasAmount;
}

// True when the row has one of description/amount but not both — the
// user has typed something they would lose on refresh.
export function isRowHalfDone(row: Row, columns: Column[]): boolean {
  const desc = findColumnByType(columns, "description");
  const amount = findColumnByType(columns, "amount");
  if (!desc || !amount) return false;
  const hasDesc = hasText(row.cells[desc.id]);
  const hasAmount =
    typeof row.cells[amount.id] === "number" ||
    typeof row.amountFormula === "string";
  return hasDesc !== hasAmount;
}

function hasText(value: CellValue): boolean {
  return typeof value === "string" && value.trim() !== "";
}

// Strip rows that aren't savable so the on-disk snapshot only ever
// holds rows the user has finished entering. Used as a pre-serialize
// transform by the storage hook. Descends through every sheet's items
// and filters the rows on each AccountBudget; non-AccountBudget items
// pass through untouched.
export function userDataWithSavableRows(data: UserData): UserData {
  return {
    ...data,
    sheets: data.sheets.map((s) => ({
      ...s,
      items: s.items.map((item) => {
        if (item.type !== "accountBudget") return item;
        return {
          ...item,
          rows: item.rows.filter((r) => isRowSavable(r, item.columns)),
        };
      }),
    })),
  };
}

export function userDataHasHalfDoneRows(data: UserData): boolean {
  return data.sheets.some((s) =>
    s.items.some(
      (item) =>
        item.type === "accountBudget" &&
        item.rows.some((r) => isRowHalfDone(r, item.columns)),
    ),
  );
}

// Every transfer with `accountId` on either end, ordered by date.
// Both incoming and outgoing transfers are included — callers
// decide the sign at render time from `selfAccountId` vs the
// transfer's `fromAccountId` / `toAccountId`.
export function transfersForAccount(
  transfers: readonly Transfer[],
  accountId: string,
): Transfer[] {
  const matches = transfers.filter(
    (tx) => tx.fromAccountId === accountId || tx.toAccountId === accountId,
  );
  return matches.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

// Synthesize a Row that represents one side of a transfer so the
// existing MonthTable + BudgetRow + Cell pipeline can render it without
// special-casing. The cells are keyed by the budget's column ids so the
// row drops straight into the existing grid. Marker fields
// (`transferId`, `peerAccountId`, `peerAccountName`) flag the
// synthesized origin — `Cell` / `BudgetRow` read them to disable inline
// editing and swap the action buttons. These fields are runtime-only;
// they're never written back to storage because synthesized rows live
// outside `item.rows`. The `accountsById` map carries names so the cell
// renderer can show "→ Savings" without re-walking the accounts list
// for every cell.
export function synthesizeTransferRow(
  tx: Transfer,
  selfAccountId: string,
  columns: Column[],
  accountsById: ReadonlyMap<string, string>,
): Row {
  const outgoing = tx.fromAccountId === selfAccountId;
  const peerAccountId = outgoing ? tx.toAccountId : tx.fromAccountId;
  // Always positive on the `to` side, negative on the `from` side, so
  // running-balance math from `computeBalances` agrees with intuition.
  const signedAmount = outgoing ? -tx.amount : tx.amount;
  const cells: Record<string, CellValue> = {};
  for (const col of columns) {
    switch (col.type) {
      case "date":
        cells[col.id] = tx.date;
        break;
      case "description":
        cells[col.id] = tx.description;
        break;
      case "amount":
        cells[col.id] = signedAmount;
        break;
      case "completed":
        cells[col.id] = tx.completed ?? false;
        break;
      // `balance` is derived at render time by computeBalances, so no
      // stored cell is needed.
    }
  }
  // Reuse the transfer id as the row id so React's keyed reconciler
  // stays stable across re-syntheses and so deletion paths (which key
  // by row id today) can be wired to a transfer lookup cleanly.
  const row: Row = {
    id: `tx:${tx.id}`,
    cells,
    transferId: tx.id,
    peerAccountId,
    peerAccountName: accountsById.get(peerAccountId) ?? "Unknown account",
  };
  if (tx.typeId) row.typeId = tx.typeId;
  return row;
}

// Synthesize one or more Rows from an imported bank-statement entry
// so the budget view can interleave them alongside user-authored
// rows without special-casing. Marker field `historyEntryId` flags
// the synthesized origin — `Cell` / `BudgetRow` read it to disable
// inline editing. Like `synthesizeTransferRow`, the synthesized
// rows never reach storage.
//
// Labels stack with rules winning over hints: an explicit pattern
// rule (user-authored glob) overrides any merchant hint (auto-
// recorded from the lossy normalised description) on the same
// entry. Either source contributes a category, typeId, and user-
// typed description; the entry's bank text is preserved on storage,
// only presentation changes.
//
// When the entry carries a non-empty `splits` array, the row chain is
// bypassed: each split renders as its own row with the split's
// description + signed amount + typeId. The splits' signed amounts
// are guaranteed by the validator to sum to `entry.amount`, so the
// account's running balance stays anchored to the bank's total.
export function synthesizeHistoryRow(
  entry: HistoryEntry,
  columns: Column[],
  hints: Readonly<Record<string, MerchantHint>> = {},
  rules: readonly MatchRule[] = [],
  companies: readonly Company[] = [],
  types: readonly EntryType[] = [],
): Row[] {
  const dateCol = findColumnByType(columns, "date");
  const descCol = findColumnByType(columns, "description");
  const amountCol = findColumnByType(columns, "amount");
  const completedCol = findColumnByType(columns, "completed");

  function buildCells(
    description: string,
    amount: number,
  ): Record<string, CellValue> {
    const cells: Record<string, CellValue> = {};
    if (dateCol) cells[dateCol.id] = entry.date;
    if (descCol) cells[descCol.id] = description;
    if (amountCol) cells[amountCol.id] = amount;
    // Imported bank entries already happened, so they're implicitly
    // completed.
    if (completedCol) cells[completedCol.id] = true;
    return cells;
  }

  if (entry.splits && entry.splits.length > 0) {
    return entry.splits.map((split, i) => {
      const row: Row = {
        id: `hist:${entry.id}:${i}`,
        cells: buildCells(split.description, split.amount),
        historyEntryId: entry.id,
      };
      if (split.typeId) row.typeId = split.typeId;
      if (split.companyId) row.companyId = split.companyId;
      // Carry the entry's transfer flag onto every split row so
      // `Settings.hideTransfers` hides them uniformly — the split is
      // just a presentation re-slice, not a re-classification.
      if (entry.isTransfer) row.isTransfer = true;
      return row;
    });
  }

  const { description, typeId, companyId } = resolveEntryLabels(
    entry,
    hints,
    rules,
    companies,
    types,
  );
  const row: Row = {
    id: `hist:${entry.id}`,
    cells: buildCells(description, entry.amount),
    historyEntryId: entry.id,
  };
  if (typeId) row.typeId = typeId;
  if (companyId) row.companyId = companyId;
  if (entry.isTransfer) row.isTransfer = true;
  return [row];
}

// Resolve the effective description, typeId, and companyId for a
// non-split history entry by walking the same per-field priority
// chain shared by `synthesizeHistoryRow` and the history-view modal:
//   1. per-entry override on the HistoryEntry itself
//      (`userDescription` / `userTypeId` / `userCompanyId`)
//   2. matching MatchRule
//   3. matching MerchantHint (skipped when `entry.hintIgnored`)
//   4. raw bank text / no type / no company
// `null` on a rule field is distinct from "absent" in the validator
// but the renderer reads null the same way as undefined here — both
// mean "no override".
//
// The description chain extends with company and type fallbacks so the
// synthesized cell never shows raw bank text when the user has tagged
// either side: descriptionOverride → companyName → typeName → bank
// text. `companies` and `types` are looked up by id; missing lookups
// fall through to the next step in the chain. Both default to empty
// arrays so legacy call sites that don't know about companies / types
// keep the previous "description override or bank text" behaviour.
export function resolveEntryLabels(
  entry: HistoryEntry,
  hints: Readonly<Record<string, MerchantHint>> = {},
  rules: readonly MatchRule[] = [],
  companies: readonly Company[] = [],
  types: readonly EntryType[] = [],
): {
  description: string;
  // The description before the company/type/bank-text fallbacks kick
  // in — i.e. only the user override, the matching rule, or the
  // merchant hint. Editors that pre-fill a description input read
  // this so an entry with only a type set doesn't seed the input
  // with the type's name (the type-name fallback is a render-time
  // convenience for the budget tables, not a real user description).
  userDescription: string | null;
  typeId: string | null;
  companyId: string | null;
} {
  const rule = findMatchingRule(rules, entry);
  const hint = entry.hintIgnored
    ? undefined
    : hints[normaliseDescription(entry.description)];
  const typeId =
    entry.userTypeId ??
    (rule && rule.typeId !== undefined && rule.typeId !== null
      ? rule.typeId
      : null) ??
    hint?.typeId ??
    null;
  const companyId =
    entry.userCompanyId ??
    (rule && rule.companyId !== undefined && rule.companyId !== null
      ? rule.companyId
      : null) ??
    hint?.companyId ??
    null;
  const userDescription =
    (entry.userDescription && entry.userDescription.trim() !== ""
      ? entry.userDescription
      : null) ??
    (rule?.description && rule.description.trim() !== ""
      ? rule.description
      : null) ??
    hint?.description ??
    null;
  let description = userDescription;
  if (description === null && companyId) {
    const company = companies.find((c) => c.id === companyId);
    if (company && company.name.trim() !== "") description = company.name;
  }
  if (description === null && typeId) {
    const type = types.find((t) => t.id === typeId);
    if (type && type.name.trim() !== "") description = type.name;
  }
  if (description === null) description = entry.description;
  return { description, userDescription, typeId, companyId };
}

// True when this row should be treated as an inter-account transfer
// for the `Settings.hideTransfers` filter. Three signals qualify a row:
//   1. a synthesized Transfer row carries `peerAccountId`
//   2. a synthesized history row whose underlying entry was flagged
//      `isTransfer` (propagated by `synthesizeHistoryRow`)
//   3. a budget row flagged `isTransfer` via the per-row eye action
// Centralised here so callers (display filter, balance-icon detector,
// expand toggle) never drift on what counts as a transfer.
export function isTransferRow(row: Row): boolean {
  return row.peerAccountId !== undefined || row.isTransfer === true;
}

// Build the full list of rows a `BudgetPage` would render for an
// `AccountBudget` item: the user-authored rows plus synthesized
// transfer rows and synthesized history rows. Centralised so the
// search index sees exactly what the user sees — extracting this from
// `BudgetPage` keeps the merge rules in one place and avoids drift if
// the synthesis logic changes later. Hidden history entries are
// dropped pre-synthesis. Returns `item.rows` unchanged when the
// budget has no account attached (no transfers or history to
// project).
export function buildVisibleRows(
  item: AccountBudget,
  transfers: readonly Transfer[],
  history: readonly HistoryEntry[],
  accountsById: ReadonlyMap<string, string>,
  merchantHints: Readonly<Record<string, MerchantHint>> = {},
  matchRules: readonly MatchRule[] = [],
  companies: readonly Company[] = [],
  types: readonly EntryType[] = [],
): Row[] {
  if (!item.accountId) return [...item.rows];
  const accountTxs = transfersForAccount(transfers, item.accountId);
  const transferRows = accountTxs.map((tx) =>
    synthesizeTransferRow(
      tx,
      item.accountId as string,
      item.columns,
      accountsById,
    ),
  );
  const historyRows = history
    .filter((e) => !e.hidden)
    .flatMap((e) =>
      synthesizeHistoryRow(
        e,
        item.columns,
        merchantHints,
        matchRules,
        companies,
        types,
      ),
    );
  return [...item.rows, ...transferRows, ...historyRows];
}

// Sum of the account's budget rows' amounts plus signed transfer
// amounts (outgoing subtract, incoming add), counting only entries
// that have actually taken place — i.e. dated on or before `today`.
// Future-dated budget rows and transfers are projections, not yet
// money in or out of the account, so they're excluded from the
// displayed balance. Undated rows are likewise excluded since we
// don't know when (or whether) they happen. Returns 0 when the
// account has neither past budget rows nor past transfers —
// those accounts are still listed on the Accounts sheet at zero so
// the user can add transfers against them later.
export function accountBalance(
  data: UserData,
  accountId: string,
  today: string = todayIso(),
): number {
  // Imported bank-statement entries carry the authoritative
  // post-transaction balance, so anchor on the latest such entry
  // dated on or before `today` and only sum items that happen after
  // it. Falling back to `openingBalance + Σ amounts` for accounts
  // that have never been seeded from history keeps the old
  // zero-anchored behaviour for free.
  const account = data.accounts.find((a) => a.id === accountId);
  const history = data.history[accountId] ?? [];
  let anchorDate = "";
  let total = account?.openingBalance ?? 0;
  let anchored = false;
  for (const entry of history) {
    if (entry.date > today) continue;
    if (entry.balance !== undefined && entry.date >= anchorDate) {
      anchorDate = entry.date;
      total = entry.balance;
      anchored = true;
    }
  }
  for (const entry of history) {
    if (entry.date > today) continue;
    if (anchored && entry.date <= anchorDate) continue;
    total += entry.amount;
  }
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      if (item.accountId !== accountId) continue;
      const amountCol = findColumnByType(item.columns, "amount");
      const dateCol = findColumnByType(item.columns, "date");
      if (!amountCol || !dateCol) continue;
      for (const row of item.rows) {
        const d = row.cells[dateCol.id];
        if (typeof d !== "string" || d === "" || d > today) continue;
        if (anchored && d <= anchorDate) continue;
        const v = row.cells[amountCol.id];
        if (typeof v === "number") total += v;
      }
    }
  }
  for (const tx of data.transfers) {
    if (tx.date > today) continue;
    if (anchored && tx.date <= anchorDate) continue;
    if (tx.fromAccountId === accountId) total -= tx.amount;
    if (tx.toAccountId === accountId) total += tx.amount;
  }
  return total;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Past-dated rows default to completed: the user is back-filling
// entries that already happened ("history items… obviously paid").
// Today and future rows stay open so the user can mark them done
// when they actually clear.
export function defaultCompletedForDate(
  date: string | null | undefined,
  today: string = todayIso(),
): boolean {
  return typeof date === "string" && date !== "" && date < today;
}

// Rows in the same series with a date >= `anchor`'s date (anchor included).
// Optionally clamped to an inclusive upper bound, used for the "until …"
// option on edit-scope dialogs. For non-series anchors, returns just the
// anchor so callers can treat scope-aware ops uniformly.
export function rowsInSeriesFrom(
  rows: Row[],
  anchor: Row,
  dateColumnId: string,
  untilIso?: string | null,
): Row[] {
  if (!anchor.seriesId) return [anchor];
  const anchorDate = anchor.cells[dateColumnId];
  if (typeof anchorDate !== "string") return [anchor];
  const matched = rows.filter((r) => {
    if (r.seriesId !== anchor.seriesId) return false;
    const d = r.cells[dateColumnId];
    if (typeof d !== "string") return false;
    if (d < anchorDate) return false;
    if (untilIso && d > untilIso) return false;
    return true;
  });
  return sortRowsByDate(matched, dateColumnId);
}

// Return the highest ISO date held by any row sharing `seriesId`, or
// null if the series has no rows with a string date in `dateColumnId`.
// Used by the edit-row modals to default the "until" picker so the
// scope-picker reaches the natural end of the series.
export function getLastSeriesDate(
  rows: readonly Row[],
  seriesId: string,
  dateColumnId: string,
): string | null {
  const dates = rows
    .filter((r) => r.seriesId === seriesId)
    .map((r) => r.cells[dateColumnId])
    .filter((d): d is string => typeof d === "string");
  return dates.length > 0 ? (dates.sort().at(-1) ?? null) : null;
}

// Standard column trio every AccountBudget surface relies on:
// date / description / amount, plus the optional completed column.
// Returning the columns instead of just their ids lets callers decide
// what to do when one is missing — a row-minting handler bails, a
// formatter that only needs `dateCol.id` can use optional chaining.
// Centralised here so a future migration that renames or splits one
// of these column types only touches this helper.
export type StandardColumns = {
  dateCol: Column | undefined;
  descCol: Column | undefined;
  amountCol: Column | undefined;
  completedCol: Column | undefined;
};
export function getStandardColumns(
  columns: readonly Column[],
): StandardColumns {
  return {
    dateCol: findColumnByType(columns, "date"),
    descCol: findColumnByType(columns, "description"),
    amountCol: findColumnByType(columns, "amount"),
    completedCol: findColumnByType(columns, "completed"),
  };
}

// Patch one AccountBudget inside `sheets` by `(sheetId, itemId)`.
// Returns the same `sheets` reference when no sheet matches, the item
// doesn't exist, the item isn't an AccountBudget, or `fn` returns the
// same item reference — the referential identity preservation lets
// callers detect "nothing changed" by comparing `next === sheets`.
//
// Replaces the hand-rolled `sheets.map(s => s.id === ? ... : s)` +
// `items.map(i => i.id === && i.type === "accountBudget" ? ... : i)`
// boilerplate that every item-targeting action used to inline.
export function updateAccountBudget(
  sheets: readonly Sheet[],
  sheetId: string,
  itemId: string,
  fn: (item: AccountBudget) => AccountBudget,
): Sheet[] {
  let changed = false;
  const next = sheets.map((sheet) => {
    if (sheet.id !== sheetId) return sheet;
    let itemChanged = false;
    const items = sheet.items.map((item) => {
      if (item.id !== itemId || item.type !== "accountBudget") return item;
      const replaced = fn(item);
      if (replaced === item) return item;
      itemChanged = true;
      return replaced;
    });
    if (!itemChanged) return sheet;
    changed = true;
    return { ...sheet, items };
  });
  return changed ? next : (sheets as Sheet[]);
}

// `rows.map(r => ids.has(r.id) ? transform(r) : r)` with a short name.
// The bulk action handlers all share this shape and used to spell it
// out inline, which obscured that they were doing the same operation
// with different transforms. Returns the same `rows` reference when
// `ids` is empty so callers can skip an enclosing spread.
export function mapRowsByIds(
  rows: readonly Row[],
  ids: ReadonlySet<string>,
  transform: (row: Row) => Row,
): Row[] {
  if (ids.size === 0) return rows as Row[];
  return rows.map((r) => (ids.has(r.id) ? transform(r) : r));
}

// Patch one entry inside `history[accountId]` by `entryId`. Mirrors
// `updateAccountBudget`: same identity-preserving behaviour, same
// "return the same map reference when nothing changed" contract.
// `fn` returns the same entry reference to signal "no change", and the
// helper short-circuits the whole map without rebuilding the account's
// entries array.
export function updateHistoryEntry(
  history: Readonly<Record<string, HistoryEntry[]>>,
  accountId: string,
  entryId: string,
  fn: (entry: HistoryEntry) => HistoryEntry,
): Record<string, HistoryEntry[]> {
  const entries = history[accountId];
  if (!entries) return history as Record<string, HistoryEntry[]>;
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return history as Record<string, HistoryEntry[]>;
  const replaced = fn(entries[idx]);
  if (replaced === entries[idx])
    return history as Record<string, HistoryEntry[]>;
  const nextEntries = entries.slice();
  nextEntries[idx] = replaced;
  return { ...history, [accountId]: nextEntries };
}

// Mint a budget Row carrying the standard (date, description, amount)
// cell trio, optionally tagged with a `seriesId` / `typeId`. Returns
// `null` when any of the three required columns is missing so the
// caller can bail (`return item` from its sheet-mapper) without
// re-implementing the validation.
export function mintBudgetRow(
  columns: readonly Column[],
  values: {
    date: string;
    description: string;
    amount: number;
    typeId?: string | null;
    companyId?: string | null;
    seriesId?: string;
  },
): Row | null {
  const { dateCol, descCol, amountCol } = getStandardColumns(columns);
  if (!dateCol || !descCol || !amountCol) return null;
  const cells: Record<string, CellValue> = {
    [dateCol.id]: values.date,
    [descCol.id]: values.description,
    [amountCol.id]: values.amount,
  };
  const row: Row = { id: newId(), cells };
  if (values.seriesId) row.seriesId = values.seriesId;
  if (values.typeId) row.typeId = values.typeId;
  if (values.companyId) row.companyId = values.companyId;
  return row;
}

// Set `cellColumnId` to `value` on the anchor and every later sibling in
// the same series, optionally clamped by `untilIso`. Returns `rows`
// unchanged when the anchor is not part of a series.
export function propagateCellInSeries(
  rows: Row[],
  anchor: Row,
  dateColumnId: string,
  cellColumnId: string,
  value: CellValue,
  untilIso: string | null,
): Row[] {
  if (!anchor.seriesId) return rows;
  const targetIds = new Set(
    rowsInSeriesFrom(rows, anchor, dateColumnId, untilIso).map((r) => r.id),
  );
  if (targetIds.size === 0) return rows;
  return rows.map((r) =>
    targetIds.has(r.id)
      ? { ...r, cells: { ...r.cells, [cellColumnId]: value } }
      : r,
  );
}

// Walk every `accountBudget` item in every sheet, calling `fn` to
// produce a (possibly identical) replacement. Sheets and the outer
// array preserve referential identity when `fn` returns the same
// reference everywhere, so reducers can short-circuit a no-op
// dispatch into a no-op state diff. Non-accountBudget items pass
// through untouched.
export function mapAccountBudgets(
  sheets: readonly Sheet[],
  fn: (item: AccountBudget) => AccountBudget,
): Sheet[] {
  let sheetsChanged = false;
  const next = sheets.map((sheet) => {
    let itemsChanged = false;
    const items = sheet.items.map((item) => {
      if (item.type !== "accountBudget") return item;
      const updated = fn(item);
      if (updated !== item) itemsChanged = true;
      return updated;
    });
    if (!itemsChanged) return sheet;
    sheetsChanged = true;
    return { ...sheet, items };
  });
  return sheetsChanged ? (next as Sheet[]) : (sheets as Sheet[]);
}
