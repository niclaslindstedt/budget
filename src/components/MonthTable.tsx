import { Plus } from "lucide-react";

import type { CellValue, Column, Row } from "../data/types";
import { ColumnHeader } from "./ColumnHeader";
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
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
        {formatMonth(monthKey)}
      </h3>
      <div className="overflow-hidden rounded-md border border-line bg-surface md:overflow-x-auto">
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
                onUpdateCell={onUpdateCell}
                onDeleteRow={onDeleteRow}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={columns.length + 1}
                className="border-r-0 bg-surface-2 p-0 text-center"
              >
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center justify-center rounded-full p-2.5 text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={onAddRow}
                  aria-label="Add row"
                >
                  <Plus size={22} aria-hidden focusable={false} />
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
