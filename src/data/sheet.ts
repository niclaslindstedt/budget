import type { CellValue, Column, ColumnType, Row, Sheet } from "./types";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDefaultSheet(name = "Sheet 1"): Sheet {
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
    name,
    columns,
    rows: [],
  };
}

export function findColumnByType(
  columns: Column[],
  type: ColumnType,
): Column | undefined {
  return columns.find((c) => c.type === type);
}

export function getMonthKey(value: CellValue): string {
  if (typeof value !== "string" || value.length < 7) return "undated";
  return value.slice(0, 7);
}

export function groupRowsByMonth(
  rows: Row[],
  dateColumnId: string,
): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = getMonthKey(row.cells[dateColumnId]);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
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

// Running balance per row, chronological across the whole sheet so the
// total carries across months. Returns a map keyed by row id.
export function computeBalances(sheet: Sheet): Map<string, number> {
  const result = new Map<string, number>();
  const dateCol = findColumnByType(sheet.columns, "date");
  const amountCol = findColumnByType(sheet.columns, "amount");
  if (!dateCol || !amountCol) return result;
  const sorted = sortRowsByDate(sheet.rows, dateCol.id);
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
