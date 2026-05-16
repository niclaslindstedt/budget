import { useState } from "react";

import type { Column } from "../data/types";
import { ColumnIcon } from "./icons";

type Props = {
  column: Column;
  onReorder: (fromId: string, toId: string) => void;
};

const DRAG_MIME = "application/x-budget-column";

export function ColumnHeader({ column, onReorder }: Props) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <th
      className={`cursor-grab border-r border-b border-line bg-surface-3 text-left text-xs font-bold tracking-wider text-muted uppercase whitespace-nowrap select-none active:cursor-grabbing last:border-r-0 ${
        column.type === "description" ? "md:w-full" : ""
      } ${
        dragOver ? "outline outline-2 -outline-offset-2 outline-accent" : ""
      }`}
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
      <span className="flex items-center justify-center gap-1.5 px-2.5 py-2 md:justify-start md:gap-2">
        <ColumnIcon
          type={column.type}
          className="shrink-0 text-accent md:text-accent"
        />
        <span className="hidden md:inline">{column.label}</span>
      </span>
    </th>
  );
}
