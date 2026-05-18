import { DEFAULT_SHEET_COLOR, DEFAULT_SHEET_GLYPH } from "./constants";
import { normaliseDescription } from "./description-normaliser";
import { findMatchingRule } from "./match-rules";
import type {
  AccountBudget,
  AccountsView,
  CellValue,
  Column,
  ColumnType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Sheet,
  SheetGlyph,
  SheetItem,
  SheetType,
  Transaction,
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
    { id: newId(), type: "category", label: "Category" },
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
  name = "Sheet 1",
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
  columns: Column[],
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

export function groupRowsByMonth(
  rows: Row[],
  dateColumnId: string,
  startOfMonth: number = 1,
): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = getMonthKey(row.cells[dateColumnId], startOfMonth);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
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

export function sortMonthKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((a, b) => {
    if (a === "undated") return 1;
    if (b === "undated") return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export function sortRowsByDate(rows: Row[], dateColumnId: string): Row[] {
  return [...rows].sort((a, b) => {
    const da = a.cells[dateColumnId];
    const db = b.cells[dateColumnId];
    const sa = typeof da === "string" ? da : "";
    const sb = typeof db === "string" ? db : "";
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
}

// Running balance per row, chronological across the whole AccountBudget
// so the total carries across months. Returns a map keyed by row id.
// `openingBalance` seeds the running total — it represents money the
// account already held before the first row in the view (e.g. the
// pre-statement balance anchored by an imported history file). Pass
// 0 for the historical behaviour.
export function computeBalances(
  item: AccountBudget,
  openingBalance = 0,
): Map<string, number> {
  const result = new Map<string, number>();
  const dateCol = findColumnByType(item.columns, "date");
  const amountCol = findColumnByType(item.columns, "amount");
  if (!dateCol || !amountCol) return result;
  const sorted = sortRowsByDate(item.rows, dateCol.id);
  let running = openingBalance;
  for (const row of sorted) {
    const raw = row.cells[amountCol.id];
    const amount = typeof raw === "number" ? raw : Number(raw) || 0;
    running += amount;
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
  return (
    hasText(row.cells[desc.id]) && typeof row.cells[amount.id] === "number"
  );
}

// True when the row has one of description/amount but not both — the
// user has typed something they would lose on refresh.
export function isRowHalfDone(row: Row, columns: Column[]): boolean {
  const desc = findColumnByType(columns, "description");
  const amount = findColumnByType(columns, "amount");
  if (!desc || !amount) return false;
  const hasDesc = hasText(row.cells[desc.id]);
  const hasAmount = typeof row.cells[amount.id] === "number";
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

// Every transaction with `accountId` on either end, ordered by date.
// Both incoming and outgoing transactions are included — callers
// decide the sign at render time from `selfAccountId` vs the
// transaction's `fromAccountId` / `toAccountId`.
export function transactionsForAccount(
  transactions: readonly Transaction[],
  accountId: string,
): Transaction[] {
  const matches = transactions.filter(
    (tx) => tx.fromAccountId === accountId || tx.toAccountId === accountId,
  );
  return matches.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

// Synthesize a Row that represents one side of a transaction so the
// existing MonthTable + SheetRow + Cell pipeline can render it without
// special-casing. The cells are keyed by the budget's column ids so the
// row drops straight into the existing grid. Marker fields
// (`transactionId`, `peerAccountId`, `peerAccountName`) flag the
// synthesized origin — `Cell` / `SheetRow` read them to disable inline
// editing and swap the action buttons. These fields are runtime-only;
// they're never written back to storage because synthesized rows live
// outside `item.rows`. The `accountsById` map carries names so the cell
// renderer can show "→ Savings" without re-walking the accounts list
// for every cell.
export function synthesizeTransactionRow(
  tx: Transaction,
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
      case "category":
        cells[col.id] = tx.categoryId ?? null;
        break;
      case "completed":
        cells[col.id] = tx.completed ?? false;
        break;
      // `balance` is derived at render time by computeBalances, so no
      // stored cell is needed.
    }
  }
  // Reuse the transaction id as the row id so React's keyed reconciler
  // stays stable across re-syntheses and so deletion paths (which key
  // by row id today) can be wired to a transaction lookup cleanly.
  return {
    id: `tx:${tx.id}`,
    cells,
    transactionId: tx.id,
    peerAccountId,
    peerAccountName: accountsById.get(peerAccountId) ?? "Unknown account",
  };
}

// Synthesize a Row from an imported bank-statement entry so the
// budget view can interleave it alongside user-authored rows without
// special-casing. Marker field `historyEntryId` flags the synthesized
// origin — `Cell` / `SheetRow` read it to disable inline editing.
// Like `synthesizeTransactionRow`, the row never reaches storage.
//
// Labels stack with rules winning over hints: an explicit pattern
// rule (user-authored glob) overrides any merchant hint (auto-
// recorded from the lossy normalised description) on the same
// entry. Either source contributes a category, typeId, and user-
// typed description; the entry's bank text is preserved on storage,
// only presentation changes.
export function synthesizeHistoryRow(
  entry: HistoryEntry,
  columns: Column[],
  hints: Readonly<Record<string, MerchantHint>> = {},
  rules: readonly MatchRule[] = [],
): Row {
  const rule = findMatchingRule(rules, entry);
  const hint = hints[normaliseDescription(entry.description)];
  // Field-by-field merge: prefer rule when it sets a label, fall back
  // to hint, fall back to the raw entry. `null` on a rule field is
  // distinct from "absent" in the validator but the renderer reads
  // null the same way as undefined here — both mean "no override".
  const description =
    (rule?.description && rule.description.trim() !== ""
      ? rule.description
      : null) ??
    hint?.description ??
    entry.description;
  const categoryId =
    (rule && rule.categoryId !== undefined && rule.categoryId !== null
      ? rule.categoryId
      : null) ??
    hint?.categoryId ??
    null;
  const typeId =
    (rule && rule.typeId !== undefined && rule.typeId !== null
      ? rule.typeId
      : null) ??
    hint?.typeId ??
    null;
  const cells: Record<string, CellValue> = {};
  for (const col of columns) {
    switch (col.type) {
      case "date":
        cells[col.id] = entry.date;
        break;
      case "description":
        cells[col.id] = description;
        break;
      case "amount":
        cells[col.id] = entry.amount;
        break;
      case "category":
        cells[col.id] = categoryId;
        break;
      case "completed":
        // Imported bank entries already happened, so they're
        // implicitly completed.
        cells[col.id] = true;
        break;
    }
  }
  const row: Row = {
    id: `hist:${entry.id}`,
    cells,
    historyEntryId: entry.id,
  };
  if (typeId) row.typeId = typeId;
  return row;
}

// Sum of the account's budget rows' amounts plus signed transaction
// amounts (outgoing subtract, incoming add), counting only entries
// that have actually taken place — i.e. dated on or before `today`.
// Future-dated budget rows and transactions are projections, not yet
// money in or out of the account, so they're excluded from the
// displayed balance. Undated rows are likewise excluded since we
// don't know when (or whether) they happen. Returns 0 when the
// account has neither past budget rows nor past transactions —
// those accounts are still listed on the Accounts sheet at zero so
// the user can add transactions against them later.
export function accountBalance(
  data: UserData,
  accountId: string,
  today: string = todayIso(),
): number {
  // Imported bank history anchors the sum: the account's
  // `openingBalance` is what the account held the day BEFORE the
  // earliest imported entry, so adding every historical amount on
  // top of it reconstructs the bank's running balance. Accounts
  // without imported history use 0 as the implicit opening.
  const account = data.accounts.find((a) => a.id === accountId);
  let total = account?.openingBalance ?? 0;
  const history = data.history[accountId] ?? [];
  for (const entry of history) {
    if (entry.date > today) continue;
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
        const v = row.cells[amountCol.id];
        if (typeof v === "number") total += v;
      }
    }
  }
  for (const tx of data.transactions) {
    if (tx.date > today) continue;
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
