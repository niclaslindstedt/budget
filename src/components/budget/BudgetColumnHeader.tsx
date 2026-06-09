import { useState } from "react";

import type { Column } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { ColumnIcon } from "../icons";

type Props = {
  column: Column;
  onReorder: (fromId: string, toId: string) => void;
};

const DRAG_MIME = "application/x-budget-column";

export function BudgetColumnHeader({ column, onReorder }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const { headerJustifyClass } = useAmountColumns();
  // The money columns align their header glyph over the figures beneath
  // them (right by default, via the shared amount-column knob); the
  // descriptive columns keep their centered glyph.
  const isMoney = column.type === "amount" || column.type === "balance";
  const glyphJustify = isMoney ? headerJustifyClass : "justify-center";

  return (
    <th
      scope="col"
      // The label `<span>` below is `hidden` on mobile (display: none),
      // which also removes it from the accessible name on small screens
      // — leaving the column as just an icon. Pin the name as
      // `aria-label` so VoiceOver / TalkBack hear "Date column" / etc.
      // regardless of viewport.
      aria-label={column.label}
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
      <span
        className={`column-header-cell flex items-center gap-1.5 px-[var(--table-cell-px)] py-[var(--table-cell-py)] md:gap-2 ${glyphJustify}`}
      >
        <ColumnIcon
          type={column.type}
          className="shrink-0 text-accent md:text-accent"
        />
        <span className="column-header-label hidden md:inline">
          {column.label}
        </span>
      </span>
    </th>
  );
}
