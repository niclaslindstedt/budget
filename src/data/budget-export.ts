// Shape an AccountBudget plus its surrounding context (imported
// history, cross-account transfers, opening balance) into a flat
// row stream ready for CSV / XLSX export. The shape mirrors what the
// user sees in `BudgetPage`, with the same merge of authored rows +
// transfers + history entries and the same running balance.

import {
  computeBalances,
  sortRowsByDate,
  type RowSortContext,
} from "./budget-rows";
import {
  synthesizeHistoryRow,
  synthesizeTransferRow,
  transfersForAccount,
} from "./budget-synthesis";
import { findColumnByType } from "./sheet";
import type {
  AccountBudget,
  Category,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Transfer,
} from "./types";

export type ExportRow = {
  date: string;
  type: string;
  category: string;
  description: string;
  amount: number | null;
  balance: number | null;
};

export type BuildBudgetExportArgs = {
  item: AccountBudget;
  openingBalance: number;
  // Pulled from `UserData.history[accountId]`. Hidden entries are
  // filtered out — they belong to the user's noise pile, not the
  // export.
  history: readonly HistoryEntry[];
  // Workspace-wide transfers. The exporter filters to the ones
  // touching `item.accountId`.
  transfers: readonly Transfer[];
  // Resolved by name lookup so transfer rows render "→ Savings"
  // instead of a bare id.
  accountsById: ReadonlyMap<string, string>;
  // Effective type list (presets + user-added, visible only) so the
  // type label can be rendered even when an id resolves to a preset.
  types: readonly EntryType[];
  categories: readonly Category[];
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  // ISO YYYY-MM-DD. Rows dated strictly before this are "history",
  // everything else is "future". Defaults to today.
  today?: string;
  includeHistory: boolean;
  includeFuture: boolean;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Build the flat list of export rows for one budget. Returns a
// chronologically sorted array — empty when the budget has no rows and
// no synthesized history / transfers.
export function buildBudgetExportRows(
  args: BuildBudgetExportArgs,
): ExportRow[] {
  const {
    item,
    openingBalance,
    history,
    transfers,
    accountsById,
    types,
    categories,
    merchantHints,
    matchRules,
    includeHistory,
    includeFuture,
  } = args;
  const today = args.today ?? todayIso();

  const typesById = new Map<string, EntryType>();
  for (const t of types) typesById.set(t.id, t);
  const categoriesById = new Map<string, Category>();
  for (const c of categories) categoriesById.set(c.id, c);

  const dateCol = findColumnByType(item.columns, "date");
  const descCol = findColumnByType(item.columns, "description");
  const amountCol = findColumnByType(item.columns, "amount");
  if (!dateCol || !descCol || !amountCol) return [];

  // Synthesize the same rows BudgetPage shows so the running balance and
  // descriptions line up with what's on screen.
  const transferRows: Row[] = item.accountId
    ? transfersForAccount(transfers, item.accountId).map((tx) =>
        synthesizeTransferRow(
          tx,
          item.accountId as string,
          item.columns,
          accountsById,
        ),
      )
    : [];
  const historyRows: Row[] = item.accountId
    ? history
        .filter((e) => !e.hidden)
        .flatMap((e) =>
          synthesizeHistoryRow(e, item.columns, merchantHints, matchRules),
        )
    : [];

  const merged: AccountBudget = {
    ...item,
    rows: [...item.rows, ...transferRows, ...historyRows],
  };

  // Mirror BudgetPage's silent balance-correction pinning so the
  // exported running balance lines up with what's on screen — each
  // imported history entry's stored balance overrides the cumulative
  // amount sum at that row. Split entries pin at the LAST split row
  // so the post-split running total matches the bank's figure.
  const balanceOverrides = new Map<string, number>();
  for (const e of history) {
    if (e.hidden) continue;
    if (e.balance === undefined) continue;
    const anchorId =
      e.splits && e.splits.length > 0
        ? `hist:${e.id}:${e.splits.length - 1}`
        : `hist:${e.id}`;
    balanceOverrides.set(anchorId, e.balance);
  }

  const sortContext: RowSortContext = {
    descriptionColumnId: descCol.id,
    amountColumnId: amountCol.id,
    typesById,
  };
  const balances = computeBalances(
    merged,
    openingBalance,
    undefined,
    balanceOverrides,
    sortContext,
  );
  const sorted = sortRowsByDate(merged.rows, dateCol.id, sortContext);

  const out: ExportRow[] = [];
  for (const row of sorted) {
    const rawDate = row.cells[dateCol.id];
    const date = typeof rawDate === "string" ? rawDate : "";
    const isPast = date !== "" && date < today;
    if (isPast && !includeHistory) continue;
    if (!isPast && !includeFuture) continue;

    const rawAmount = row.cells[amountCol.id];
    const amount = typeof rawAmount === "number" ? rawAmount : null;
    const balance = balances.get(row.id) ?? null;

    const type = row.typeId ? (typesById.get(row.typeId) ?? null) : null;
    const category = type
      ? (categoriesById.get(type.categoryId) ?? null)
      : null;

    // History rows: when a type has been resolved (via merchant hint
    // or match rule), use the type name in place of the bank-supplied
    // description so the export reads as "categorised history" rather
    // than the raw statement noise.
    let description: string;
    const rawDesc = row.cells[descCol.id];
    if (row.historyEntryId && type) {
      description = type.name;
    } else {
      description = typeof rawDesc === "string" ? rawDesc : "";
    }

    out.push({
      date,
      type: type ? type.name : "",
      category: category ? category.name : "",
      description,
      amount,
      balance,
    });
  }
  return out;
}

// Header labels expected by the CSV / XLSX writers. Kept in source so
// the column order is identical across both formats; the i18n strings
// are mirrored from `sheet.*` keys but resolved at the call site so
// this module stays React-free.
export type ExportHeaders = {
  date: string;
  type: string;
  category: string;
  description: string;
  amount: string;
  balance: string;
};

export function exportRowsToTable(
  rows: readonly ExportRow[],
  headers: ExportHeaders,
): (string | number | null)[][] {
  const out: (string | number | null)[][] = [];
  out.push([
    headers.date,
    headers.description,
    headers.type,
    headers.category,
    headers.amount,
    headers.balance,
  ]);
  for (const r of rows) {
    out.push([r.date, r.description, r.type, r.category, r.amount, r.balance]);
  }
  return out;
}

// CSV serialiser tuned for spreadsheet apps: comma-separated, CRLF
// line endings, every string field quoted to dodge embedded commas /
// quotes / newlines. Numbers render with a `.` decimal regardless of
// the user's setting — CSV is consumed by other software, not the
// budget's own display, and a `.` decimal is the universally portable
// choice.
export function rowsToCsv(rows: readonly (string | number | null)[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = row.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (typeof cell === "number")
        return Number.isFinite(cell) ? String(cell) : "";
      const escaped = String(cell).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

export const CSV_MIME_TYPE = "text/csv;charset=utf-8";
