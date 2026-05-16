import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { findColumnByType } from "../data/sheet";
import type { Category, CellValue, Column, Row } from "../data/types";
import { Cell } from "./Cell";

type Props = {
  row: Row;
  columns: Column[];
  balances: Map<string, number>;
  categories: Category[];
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

const SWIPE_THRESHOLD = 40;

export function SheetRow({
  row,
  columns,
  balances,
  categories,
  onUpdateCell,
  onDeleteRequest,
  onEditRequest,
  onCreateCategory,
}: Props) {
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  const completedCol = findColumnByType(columns, "completed");
  const isCompleted =
    completedCol !== undefined && row.cells[completedCol.id] === true;
  const isSeries = !!row.seriesId;

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      moved.current = true;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX.current;
    startX.current = null;
    startY.current = null;
    if (!moved.current) return;
    if (dx < -SWIPE_THRESHOLD) setSwiped(true);
    else if (dx > SWIPE_THRESHOLD) setSwiped(false);
  };

  const rowClass = [
    swiped ? "is-swiped" : "",
    isCompleted ? "is-completed" : "",
    isSeries ? "is-series" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      className={rowClass}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {columns.map((col) => (
        <Cell
          key={col.id}
          column={col}
          value={row.cells[col.id] ?? null}
          computedBalance={
            col.type === "balance" ? balances.get(row.id) : undefined
          }
          categories={categories}
          onChange={(value) => onUpdateCell(row.id, col.id, value)}
          onCreateCategory={onCreateCategory}
        />
      ))}
      <td className="action-cell border-r border-b border-line bg-surface-3 p-0 text-center last:border-r-0">
        <div className="action-stack flex h-full w-full items-stretch">
          <button
            type="button"
            className="action-btn action-btn-edit inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
            aria-label={isSeries ? "Edit recurring entry" : "Make recurring"}
            onClick={() => onEditRequest(row)}
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
            aria-label="Delete row"
            onClick={() => onDeleteRequest(row)}
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
        </div>
      </td>
    </tr>
  );
}
