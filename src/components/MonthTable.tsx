import type { CellValue, Column, Row } from "../data/types";
import { Cell } from "./Cell";
import { ColumnHeader } from "./ColumnHeader";

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
            {rows.length === 0 && (
              <tr className="row-empty">
                <td colSpan={columns.length + 1}>No rows yet.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((col) => (
                  <Cell
                    key={col.id}
                    column={col}
                    value={row.cells[col.id] ?? null}
                    computedBalance={
                      col.type === "balance" ? balances.get(row.id) : undefined
                    }
                    onChange={(value) => onUpdateCell(row.id, col.id, value)}
                  />
                ))}
                <td className="cell cell-actions">
                  <button
                    type="button"
                    className="row-delete"
                    aria-label="Delete row"
                    onClick={() => onDeleteRow(row.id)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={columns.length + 1} className="month-footer">
                <button type="button" className="row-add" onClick={onAddRow}>
                  + Add row
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
