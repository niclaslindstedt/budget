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
): Map<string, number> {
  const result = new Map<string, number>();
  const dateCol = findColumnByType(item.columns, "date");
  const amountCol = findColumnByType(item.columns, "amount");
  if (!dateCol || !amountCol) return result;
  const sorted = sortRowsByDate(item.rows, dateCol.id);
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
  const row: Row = {
    id: `tx:${tx.id}`,
    cells,
    transactionId: tx.id,
    peerAccountId,
    peerAccountName: accountsById.get(peerAccountId) ?? "Unknown account",
  };
  if (tx.typeId) row.typeId = tx.typeId;
  return row;
}

// Synthesize one or more Rows from an imported bank-statement entry
// so the budget view can interleave them alongside user-authored
// rows without special-casing. Marker field `historyEntryId` flags
// the synthesized origin — `Cell` / `SheetRow` read it to disable
// inline editing. Like `synthesizeTransactionRow`, the synthesized
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
      // Carry the entry's transfer flag onto every split row so
      // `Settings.hideTransfers` hides them uniformly — the split is
      // just a presentation re-slice, not a re-classification.
      if (entry.isTransfer) row.isTransfer = true;
      return row;
    });
  }

  const rule = findMatchingRule(rules, entry);
  const hint = hints[normaliseDescription(entry.description)];
  // Field-by-field merge with a four-step priority:
  //   1. per-entry override on the HistoryEntry itself (set by the
  //      pen-button modal and inline editors on a history row)
  //   2. matching MatchRule
  //   3. matching MerchantHint
  //   4. raw bank text / no type
  // `null` on a rule field is distinct from "absent" in the validator
  // but the renderer reads null the same way as undefined here — both
  // mean "no override".
  const description =
    (entry.userDescription && entry.userDescription.trim() !== ""
      ? entry.userDescription
      : null) ??
    (rule?.description && rule.description.trim() !== ""
      ? rule.description
      : null) ??
    hint?.description ??
    entry.description;
  const typeId =
    entry.userTypeId ??
    (rule && rule.typeId !== undefined && rule.typeId !== null
      ? rule.typeId
      : null) ??
    hint?.typeId ??
    null;
  const row: Row = {
    id: `hist:${entry.id}`,
    cells: buildCells(description, entry.amount),
    historyEntryId: entry.id,
  };
  if (typeId) row.typeId = typeId;
  if (entry.isTransfer) row.isTransfer = true;
  return [row];
}

// True when this row should be treated as an inter-account transfer
// for the `Settings.hideTransfers` filter. Three signals qualify a row:
//   1. a synthesized Transaction row carries `peerAccountId`
//   2. a synthesized history row whose underlying entry was flagged
//      `isTransfer` (propagated by `synthesizeHistoryRow`)
//   3. a budget row flagged `isTransfer` via the per-row eye action
// Centralised here so callers (display filter, balance-icon detector,
// expand toggle) never drift on what counts as a transfer.
export function isTransferRow(row: Row): boolean {
  return row.peerAccountId !== undefined || row.isTransfer === true;
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
  for (const tx of data.transactions) {
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
