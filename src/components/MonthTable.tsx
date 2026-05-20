import { memo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { findColumnByType } from "../data/sheet";
import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Row,
  Settings,
} from "../data/types";
import { type TFunction, useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import { formatNumber, withCurrency } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { AddRowButton } from "./AddRowButton";
import { ColumnHeader } from "./ColumnHeader";
import { SheetRow } from "./SheetRow";

type Props = {
  monthKey: string;
  rows: Row[];
  columns: Column[];
  balances: Map<string, number>;
  types: readonly EntryType[];
  categories: readonly Category[];
  typeUsageById: ReadonlyMap<string, number>;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  settings: Settings;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  canTransfer: boolean;
  amountChars: number;
  balanceChars: number;
  collapsed: boolean;
  // True when this month is fully covered by imported bank history.
  // The footer's "+ Add row" button is hidden in covered months — the
  // bank has authoritative data there, so a user-added row would
  // double-count.
  covered: boolean;
  onToggleCollapsed: () => void;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddComplex: () => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onEditRowRequest: (row: Row) => void;
  onTransactionRequest: (row: Row) => void;
  onMatchRuleRequest: (row: Row) => void;
  onEditHistoryRequest: (row: Row) => void;
  onCorrectionDeleteRequest: (row: Row) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
};

const monthFormatCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFormatFor(lang: Lang): Intl.DateTimeFormat {
  let fmt = monthFormatCache.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    monthFormatCache.set(lang, fmt);
  }
  return fmt;
}

function formatMonth(key: string, lang: Lang, t: TFunction): string {
  if (key === "undated") return t("sheet.undated");
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormatFor(lang).format(new Date(y, m - 1, 1));
}

function MonthTableImpl({
  monthKey,
  rows,
  columns,
  balances,
  types,
  categories,
  typeUsageById,
  onCreateType,
  settings,
  selectMode,
  selectedIds,
  canTransfer,
  amountChars,
  balanceChars,
  collapsed,
  covered,
  onToggleCollapsed,
  onUpdateCell,
  onCommitCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onEditRowRequest,
  onTransactionRequest,
  onMatchRuleRequest,
  onEditHistoryRequest,
  onCorrectionDeleteRequest,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Synthesized transaction rows live in `rows` (the parent merges them
  // in) but they are not selectable for bulk operations — they aren't
  // real budget rows, so a delete or move that targets them would do
  // nothing. Correction rows render as a divider line rather than a
  // columned row, so a bulk-edit selection on one would have nothing to
  // act on either; both are filtered out of selection helpers.
  const selectableRowIds = rows
    .filter((r) => r.transactionId === undefined && !r.isCorrection)
    .map((r) => r.id);
  const amountCol = findColumnByType(columns, "amount");
  // Columns + action cell + (optional) select cell = total td count we
  // need to colSpan when rendering a correction row as a full-width
  // divider line.
  const correctionColSpan = columns.length + 1 + (selectMode ? 1 : 0);
  const allSelected =
    selectableRowIds.length > 0 &&
    selectableRowIds.every((id) => selectedIds.has(id));
  const someSelected =
    selectableRowIds.some((id) => selectedIds.has(id)) && !allSelected;
  // Tint the sticky header with the month's pastel — `undated` has no
  // calendar month so it stays on the neutral `fg-bright` colour.
  const headerMonthNum = monthNumberFromKey(monthKey);
  const headerColor =
    headerMonthNum !== null ? monthColorVar(headerMonthNum) : undefined;

  const monthLabel = formatMonth(monthKey, lang, t);
  return (
    <section>
      <h3
        className={`sticky top-[var(--app-header-h)] z-20 bg-page-bg text-xs font-bold tracking-wider uppercase ${
          headerColor ? "" : "text-fg-bright"
        }`}
        style={headerColor ? { color: headerColor } : undefined}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t("sheet.expandMonth", { month: monthLabel })
              : t("sheet.collapseMonth", { month: monthLabel })
          }
          className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent pt-1 pb-2 pl-2 text-left text-[inherit] font-bold tracking-wider uppercase hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:pt-1.5 md:pb-3.5 md:pl-3"
        >
          {collapsed ? (
            <ChevronRight size={14} aria-hidden focusable={false} />
          ) : (
            <ChevronDown size={14} aria-hidden focusable={false} />
          )}
          <span>{monthLabel}</span>
        </button>
      </h3>
      <div
        hidden={collapsed}
        className={`overflow-clip rounded border border-line bg-surface ${
          selectMode ? "sheet-table-selecting" : ""
        }`}
        style={
          {
            "--amount-col-ch": amountChars,
            "--balance-col-ch": balanceChars,
          } as React.CSSProperties
        }
      >
        <table
          className={`sheet-table w-full border-collapse text-sm md:text-[13px] ${
            selectMode ? "is-selecting" : ""
          }`}
        >
          <thead>
            <tr>
              {selectMode && (
                <th
                  className="select-cell bg-surface-3 text-center"
                  aria-label={t("sheet.selectAllInMonth")}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onToggleSelectMonth(selectableRowIds, !allSelected)
                    }
                    disabled={selectableRowIds.length === 0}
                    className="flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-1.5 text-muted disabled:opacity-30"
                    aria-label={
                      allSelected
                        ? t("sheet.deselectAllInMonth")
                        : t("sheet.selectAllRowsInMonth")
                    }
                    aria-pressed={allSelected}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                        allSelected
                          ? "border-accent bg-accent text-page-bg"
                          : someSelected
                            ? "border-accent text-accent"
                            : "border-muted"
                      }`}
                    >
                      {allSelected ? "✓" : someSelected ? "–" : ""}
                    </span>
                  </button>
                </th>
              )}
              {columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  column={col}
                  onReorder={onReorderColumns}
                />
              ))}
              <th
                className="action-cell w-8 bg-surface-3"
                aria-label={t("sheet.rowActions")}
              />
            </tr>
          </thead>
          <tbody>
            {/* Skip building the row tree entirely when the month is
               collapsed. The container above is `hidden`, so rendering
               into it would only feed React's reconciler — building
               1000s of cells worth of vnodes for a month the user can't
               see is pure overhead and dominates the work when many
               years of history are revealed via "Show more". */}
            {!collapsed &&
              rows.map((row) => {
                if (row.isCorrection) {
                  const amount =
                    amountCol && typeof row.cells[amountCol.id] === "number"
                      ? (row.cells[amountCol.id] as number)
                      : 0;
                  return (
                    <CorrectionLine
                      key={row.id}
                      colSpan={correctionColSpan}
                      amount={amount}
                      settings={settings}
                      onClick={() => onCorrectionDeleteRequest(row)}
                    />
                  );
                }
                return (
                  <SheetRow
                    key={row.id}
                    row={row}
                    columns={columns}
                    balances={balances}
                    types={types}
                    categories={categories}
                    typeUsageById={typeUsageById}
                    onCreateType={onCreateType}
                    settings={settings}
                    selectMode={selectMode}
                    selected={selectedIds.has(row.id)}
                    canTransfer={canTransfer}
                    onUpdateCell={onUpdateCell}
                    onCommitCell={onCommitCell}
                    onDeleteRequest={onDeleteRequest}
                    onEditRequest={onEditRequest}
                    onEditRowRequest={onEditRowRequest}
                    onTransactionRequest={onTransactionRequest}
                    onMatchRuleRequest={onMatchRuleRequest}
                    onEditHistoryRequest={onEditHistoryRequest}
                    onToggleSelect={onToggleSelect}
                  />
                );
              })}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={columns.length + (selectMode ? 2 : 1)}
                className="border-r-0 bg-surface-3 p-0"
              >
                {covered ? (
                  <div className="px-3 py-1.5 text-xs text-muted">
                    {t("sheet.historyCoversMonth")}
                  </div>
                ) : (
                  <AddRowButton onAdd={onAddRow} onComplex={onAddComplex} />
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// Memoized so SheetView re-renders (driven by other months, by typing
// in a single cell, or by a state flip elsewhere in the app) don't
// rebuild every month's row tree. Shallow compare suffices — SheetView
// memoizes the per-month `rows` array (via `sortedMonthGroups`) and the
// other props are stable references coming from the workspace data.
export const MonthTable = memo(MonthTableImpl);

// One-row stand-in for a balance-correction Row. Renders as a single
// full-width <td> showing "——— balance correction ±X kr ———" — no
// columns, no action buttons. The whole line is a button so clicking
// it opens the delete-confirmation prompt (the parent handler shows a
// ConfirmDialog and dispatches the actual deletion).
function CorrectionLine({
  colSpan,
  amount,
  settings,
  onClick,
}: {
  colSpan: number;
  amount: number;
  settings: Settings;
  onClick: () => void;
}) {
  const t = useT();
  const sign = amount >= 0 ? "+" : "−";
  const magnitude = withCurrency(
    formatNumber(Math.abs(amount), settings),
    settings,
  );
  const amountClass = amount >= 0 ? "text-positive" : "text-negative";
  return (
    <tr className="correction-row">
      <td colSpan={colSpan} className="border-b border-line bg-surface p-0">
        <button
          type="button"
          onClick={onClick}
          aria-label={t("sheet.correctionRemoveAria", {
            amount: `${sign}${magnitude}`,
          })}
          title={t("app.removeBalanceCorrection")}
          className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-xs text-muted hover:text-fg-bright focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="whitespace-nowrap">
            {t("sheet.correctionLine")}{" "}
            <span className={`font-mono tabular-nums ${amountClass}`}>
              {sign}
              {magnitude}
            </span>
          </span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </button>
      </td>
    </tr>
  );
}
