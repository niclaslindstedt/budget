import type { Category, CellValue, Column, Row, Settings } from "../data/types";
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
  amountChars: number;
  balanceChars: number;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddComplex: () => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
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
  amountChars,
  balanceChars,
  onUpdateCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onCreateCategory,
}: Props) {
  const rowIds = rows.map((r) => r.id);
  const allSelected =
    rowIds.length > 0 && rowIds.every((id) => selectedIds.has(id));
  const someSelected = rowIds.some((id) => selectedIds.has(id)) && !allSelected;
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
                    onClick={() => onToggleSelectMonth(rowIds, !allSelected)}
                    disabled={rowIds.length === 0}
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
            {rows.map((row) => (
              <SheetRow
                key={row.id}
                row={row}
                columns={columns}
                balances={balances}
                categories={categories}
                settings={settings}
                selectMode={selectMode}
                selected={selectedIds.has(row.id)}
                onUpdateCell={onUpdateCell}
                onDeleteRequest={onDeleteRequest}
                onEditRequest={onEditRequest}
                onToggleSelect={onToggleSelect}
                onCreateCategory={onCreateCategory}
              />
            ))}
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
