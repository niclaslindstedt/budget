import { todayIso } from "../../utils/date";
import {
  synthesizeHistoryRow,
  synthesizeTransferRow,
  transfersForAccount,
} from "./synthesis";
import { findColumnByType, getStandardColumns, newId } from "../sheet";
import type {
  AccountBudget,
  CellValue,
  Column,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Transfer,
  UserData,
} from "../types";

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

// `String.prototype.localeCompare` allocates a fresh Intl.Collator on
// every call. Caching one collator at module scope and calling
// `.compare` directly is 10–50x faster, which matters because the
// description tiebreaker fires inside the sort comparator — N log N
// times per sort, and the sort itself runs multiple times per data
// change in the budget render path.
const DESC_COLLATOR = new Intl.Collator(undefined, { usage: "sort" });

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
    // Cached `${date}|i|e` bucket id + the category sum for this row
    // within that bucket. Resolved once per row below so the sort
    // comparator avoids re-allocating a fresh template-literal string
    // and doing two Map lookups on every comparison — for n rows the
    // sort does ~n log n comparisons, so the saved per-call work is the
    // bulk of `sortRowsByDate`'s cost.
    bucketSum: number;
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
      bucketSum: 0,
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
  // Second pass: stamp each aux row with its precomputed bucket sum so
  // the comparator below reads a plain number instead of rebuilding the
  // bucket key + looking up two nested maps on every comparison.
  for (const aux of auxes) {
    const bucketKey = `${aux.date}|${aux.isIncome ? "i" : "e"}`;
    aux.bucketSum = sumByBucket.get(bucketKey)?.get(aux.categoryKey) ?? 0;
  }
  return auxes
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.isIncome !== b.isIncome) return a.isIncome ? -1 : 1;
      if (a.bucketSum !== b.bucketSum) return b.bucketSum - a.bucketSum;
      // Two categories with the same sum still need a stable grouping
      // so their rows don't interleave — break sum-ties by category id.
      if (a.categoryKey !== b.categoryKey) {
        return a.categoryKey < b.categoryKey ? -1 : 1;
      }
      if (a.absAmount !== b.absAmount) return b.absAmount - a.absAmount;
      return DESC_COLLATOR.compare(a.desc, b.desc);
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

// A row earns a slot in persisted storage once it carries any
// user-meaningful field: a description, an amount, a typeId, or a
// companyId. Rows with nothing but the column defaults (date +
// completed) stay in memory while the user is editing them but never
// reach `localStorage`, so a refresh discards transient placeholders
// without resurrecting them. Crucially, a row that was savable and
// then had one critical field cleared (e.g. the user removed the
// description but the amount is still there) stays savable — the
// cleared field persists as the user authored it, instead of the row
// silently vanishing from storage.
export function isRowSavable(row: Row, columns: Column[]): boolean {
  const { descCol, amountCol } = getStandardColumns(columns);
  if (!descCol || !amountCol) return true;
  // A formula row satisfies the amount requirement regardless of the
  // cached numeric cell — the effective amount comes from evaluation
  // at render time.
  const hasAmount =
    typeof row.cells[amountCol.id] === "number" ||
    typeof row.amountFormula === "string";
  return (
    hasText(row.cells[descCol.id]) ||
    hasAmount ||
    typeof row.typeId === "string" ||
    typeof row.companyId === "string"
  );
}

// True when the row has one of description/amount but not both — the
// user has typed something they would lose on refresh.
export function isRowHalfDone(row: Row, columns: Column[]): boolean {
  const { descCol, amountCol } = getStandardColumns(columns);
  if (!descCol || !amountCol) return false;
  const hasDesc = hasText(row.cells[descCol.id]);
  const hasAmount =
    typeof row.cells[amountCol.id] === "number" ||
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

// Mirror of `userDataWithSavableRows`'s strip predicate. The storage
// hook's `dirty` flag uses this to detect "in-memory has rows the
// auto-save would omit" without paying for a full JSON serialize of
// the entire UserData on every render.
export function userDataHasUnsavableRows(data: UserData): boolean {
  return data.sheets.some((s) =>
    s.items.some(
      (item) =>
        item.type === "accountBudget" &&
        item.rows.some((r) => !isRowSavable(r, item.columns)),
    ),
  );
}

// Synthesize the transfer + history rows for an account budget — the
// projected, non-persisted rows the budget view interleaves with
// `item.rows`. Split out from `buildVisibleRows` so callers (today
// just `BudgetPage`) can memoize the synthesis independently of
// `item.rows`. The user-row reference flips on every cell keystroke;
// the inputs here (history, transfers, hints, rules, companies, types,
// columns, accountId) don't, so a separate memo skips ~all the
// per-entry `normaliseDescription` + `findMatchingRule` work that
// `synthesizeHistoryRow` does during regular editing. Returns an empty
// array when the budget has no account attached (no transfers or
// history to project).
export function buildSynthesizedRows(
  columns: Column[],
  accountId: string | null,
  transfers: readonly Transfer[],
  history: readonly HistoryEntry[],
  accountsById: ReadonlyMap<string, string>,
  merchantHints: Readonly<Record<string, MerchantHint>> = {},
  matchRules: readonly MatchRule[] = [],
  companies: readonly Company[] = [],
  types: readonly EntryType[] = [],
): Row[] {
  if (!accountId) return [];
  const accountTxs = transfersForAccount(transfers, accountId);
  const transferRows = accountTxs.map((tx) =>
    synthesizeTransferRow(tx, accountId, columns, accountsById),
  );
  // Build id-indexed maps once per call so the per-entry fallbacks in
  // `resolveEntryLabels` (company/type-name description) don't scan the
  // arrays linearly for every synthesized history row.
  const companiesById = new Map<string, Company>();
  for (const c of companies) companiesById.set(c.id, c);
  const typesById = new Map<string, EntryType>();
  for (const t of types) typesById.set(t.id, t);
  const historyRows: Row[] = [];
  for (const e of history) {
    if (e.hidden) continue;
    const rows = synthesizeHistoryRow(
      e,
      columns,
      merchantHints,
      matchRules,
      companiesById,
      typesById,
    );
    for (const r of rows) historyRows.push(r);
  }
  return [...transferRows, ...historyRows];
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
  const synthesized = buildSynthesizedRows(
    item.columns,
    item.accountId,
    transfers,
    history,
    accountsById,
    merchantHints,
    matchRules,
    companies,
    types,
  );
  return [...item.rows, ...synthesized];
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
//
// Single-pass max instead of the obvious `.filter().sort().at(-1)` —
// we only need the maximum, not the full ordering, so the O(N log N)
// sort + the three intermediate arrays it allocated were pure waste.
export function getLastSeriesDate(
  rows: readonly Row[],
  seriesId: string,
  dateColumnId: string,
): string | null {
  let best: string | null = null;
  for (const r of rows) {
    if (r.seriesId !== seriesId) continue;
    const d = r.cells[dateColumnId];
    if (typeof d !== "string") continue;
    if (best === null || d > best) best = d;
  }
  return best;
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
