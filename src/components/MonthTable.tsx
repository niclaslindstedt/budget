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
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddComplex: () => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
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
  onUpdateCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onReorderColumns,
  onCreateCategory,
}: Props) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 mb-2 bg-page-bg py-1.5 text-xs font-bold tracking-wider text-fg-bright uppercase">
        {formatMonth(monthKey)}
      </h3>
      <div className="overflow-hidden rounded border border-line bg-surface md:overflow-x-auto">
        <table className="sheet-table w-full border-collapse text-sm md:text-[13px]">
          <thead>
            <tr>
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
                onUpdateCell={onUpdateCell}
                onDeleteRequest={onDeleteRequest}
                onEditRequest={onEditRequest}
                onCreateCategory={onCreateCategory}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={columns.length + 1}
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
