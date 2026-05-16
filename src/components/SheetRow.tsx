import { useRef, useState } from "react";

import { findColumnByType } from "../data/sheet";
import type { CellValue, Column, Row } from "../data/types";
import { Cell } from "./Cell";
import { IconTrash } from "./icons";

type Props = {
  row: Row;
  columns: Column[];
  balances: Map<string, number>;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onDeleteRow: (rowId: string) => void;
};

const SWIPE_THRESHOLD = 40;

export function SheetRow({
  row,
  columns,
  balances,
  onUpdateCell,
  onDeleteRow,
}: Props) {
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  const completedCol = findColumnByType(columns, "completed");
  const isCompleted =
    completedCol !== undefined && row.cells[completedCol.id] === true;

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
    "row",
    swiped ? "is-swiped" : "",
    isCompleted ? "is-completed" : "",
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
          <IconTrash />
        </button>
      </td>
    </tr>
  );
}
