import type { Category, CellValue, Column, Row } from "../data/types";
import { AddRowButton } from "./AddRowButton";
import { ColumnHeader } from "./ColumnHeader";
import { SheetRow } from "./SheetRow";

type Props = {
  monthKey: string;
  rows: Row[];
  columns: Column[];
  balances: Map<string, number>;
  categories: Category[];
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
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
  selectMode,
  selectedIds,
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

  return (
    <section>
      <h3 className="sticky top-0 z-10 mb-2 bg-page-bg py-1.5 text-xs font-bold tracking-wider text-fg-bright uppercase">
        {formatMonth(monthKey)}
      </h3>
      <div
        className={`overflow-hidden rounded border border-line bg-surface md:overflow-x-auto ${
          selectMode ? "sheet-table-selecting" : ""
        }`}
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
