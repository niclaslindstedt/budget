import type { CellValue, Column, Row } from "../data/types";
import { ColumnHeader } from "./ColumnHeader";
import { IconPlus } from "./icons";
import { SheetRow } from "./SheetRow";

type Props = {
  monthKey: string;
  rows: Row[];
  columns: Column[];
  balances: Map<string, number>;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onDeleteRow: (rowId: string) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
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
  onUpdateCell,
  onAddRow,
  onDeleteRow,
  onReorderColumns,
}: Props) {
  return (
    <section className="month">
      <h3 className="month-heading">{formatMonth(monthKey)}</h3>
      <div className="month-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  column={col}
                  onReorder={onReorderColumns}
                />
              ))}
              <th className="col-actions" aria-label="row actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <SheetRow
                key={row.id}
                row={row}
                columns={columns}
                balances={balances}
                onUpdateCell={onUpdateCell}
                onDeleteRow={onDeleteRow}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={columns.length + 1} className="month-footer">
                <button
                  type="button"
                  className="row-add"
                  onClick={onAddRow}
                  aria-label="Add row"
                >
                  <IconPlus />
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
