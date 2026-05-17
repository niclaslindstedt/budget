import { DEFAULT_SHEET_COLOR, DEFAULT_SHEET_GLYPH } from "./constants";
import type {
  AccountBudget,
  CellValue,
  Column,
  ColumnType,
  Row,
  Sheet,
  SheetGlyph,
  SheetType,
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
  return {
    id: newId(),
    name,
    type: overrides.type ?? "budget",
    glyph: overrides.glyph ?? DEFAULT_SHEET_GLYPH,
    color: overrides.color ?? DEFAULT_SHEET_COLOR,
    description: overrides.description ?? "",
    items: [createDefaultAccountBudget(accountId)],
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
export function computeBalances(item: AccountBudget): Map<string, number> {
  const result = new Map<string, number>();
  const dateCol = findColumnByType(item.columns, "date");
  const amountCol = findColumnByType(item.columns, "amount");
  if (!dateCol || !amountCol) return result;
  const sorted = sortRowsByDate(item.rows, dateCol.id);
  let running = 0;
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
