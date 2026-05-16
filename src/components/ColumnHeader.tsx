import { useState } from "react";

import type { Column } from "../data/types";

type Props = {
  column: Column;
  onReorder: (fromId: string, toId: string) => void;
};

const DRAG_MIME = "application/x-budget-column";

export function ColumnHeader({ column, onReorder }: Props) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <th
      className={`col-header col-${column.type}${dragOver ? " is-drop-target" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, column.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const fromId = e.dataTransfer.getData(DRAG_MIME);
        if (fromId && fromId !== column.id) onReorder(fromId, column.id);
      }}
    >
      <span className="col-header-label">{column.label}</span>
    </th>
  );
}
