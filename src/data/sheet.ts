import { DEFAULT_SHEET_COLOR, DEFAULT_SHEET_GLYPH } from "./constants";
import { getSheetTypeDescriptor } from "./sheet-types";
import type {
  AccountBudget,
  CellValue,
  Column,
  ColumnType,
  HistoryEntry,
  Row,
  Sheet,
  SheetGlyph,
  SheetType,
} from "./types";

// Universal id minter for every entity the workspace holds (sheets,
// rows, columns, transfers, history entries, …). Uses `crypto.randomUUID`
// when available and a deterministic-ish fallback otherwise so the
// helper works in Node test environments and older browsers alike.
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  const descriptor = getSheetTypeDescriptor(type);
  return {
    id: newId(),
    name,
    type,
    glyph: overrides.glyph ?? DEFAULT_SHEET_GLYPH,
    color: overrides.color ?? DEFAULT_SHEET_COLOR,
    description: overrides.description ?? "",
    items: [descriptor.createDefaultItem({ accountId })],
  };
}

export function findColumnByType(
  columns: readonly Column[],
  type: ColumnType,
): Column | undefined {
  return columns.find((c) => c.type === type);
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
