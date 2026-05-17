import { findColumnByType } from "../data/sheet";
import type { Category, CellValue, Column, Row, Settings } from "../data/types";
import {
  formatAmountForInput,
  withCurrency,
} from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { AddRowButton } from "./AddRowButton";
import { ColumnHeader } from "./ColumnHeader";
import { SheetRow } from "./SheetRow";

type Props = {
  monthKey: string;
  rows: Row[];
  columns: Column[];
  balances: Map<string, number>;
  categories: Category[];
  settings: Settings;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  canTransfer: boolean;
  amountChars: number;
  balanceChars: number;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddComplex: () => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onTransactionRequest: (row: Row) => void;
  onCorrectionDeleteRequest: (row: Row) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

function formatMonth(key: string): string {
  if (key === "undated") return "Undated";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormat.format(new Date(y, m - 1, 1));
}

export function MonthTable({
  monthKey,
  rows,
  columns,
  balances,
  categories,
  settings,
  selectMode,
  selectedIds,
  canTransfer,
  amountChars,
  balanceChars,
  onUpdateCell,
  onCommitCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onTransactionRequest,
  onCorrectionDeleteRequest,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onCreateCategory,
}: Props) {
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

  return (
    <section>
      <h3
        className={`sticky top-[var(--app-header-h)] z-20 mb-1 bg-page-bg py-1 text-xs font-bold tracking-wider uppercase md:mb-2 md:py-1.5 ${
          headerColor ? "" : "text-fg-bright"
        }`}
        style={headerColor ? { color: headerColor } : undefined}
      >
        {formatMonth(monthKey)}
      </h3>
      <div
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
                  aria-label="Select all in month"
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
                        ? "Deselect all rows in month"
                        : "Select all rows in month"
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
                aria-label="row actions"
              />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
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
                  categories={categories}
                  settings={settings}
                  selectMode={selectMode}
                  selected={selectedIds.has(row.id)}
                  canTransfer={canTransfer}
                  onUpdateCell={onUpdateCell}
                  onCommitCell={onCommitCell}
                  onDeleteRequest={onDeleteRequest}
                  onEditRequest={onEditRequest}
                  onTransactionRequest={onTransactionRequest}
                  onToggleSelect={onToggleSelect}
                  onCreateCategory={onCreateCategory}
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
                <AddRowButton onAdd={onAddRow} onComplex={onAddComplex} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

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
  const sign = amount >= 0 ? "+" : "−";
  const magnitude = withCurrency(
    formatAmountForInput(Math.abs(amount), settings),
    settings,
  );
  const amountClass = amount >= 0 ? "text-positive" : "text-negative";
  return (
    <tr className="correction-row">
      <td colSpan={colSpan} className="border-b border-line bg-surface p-0">
        <button
          type="button"
          onClick={onClick}
          aria-label={`Remove balance correction of ${sign}${magnitude}`}
          title="Remove balance correction"
          className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-xs text-muted hover:text-fg-bright focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="whitespace-nowrap">
            balance correction{" "}
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
