import { useRef } from "react";
import { Plus } from "lucide-react";

import type { Sheet } from "../data/types";
import { CategoryIconGlyph } from "./icons";

type Props = {
  sheets: Sheet[];
  activeSheetId: string;
  onSelect: (sheetId: string) => void;
  onEdit: (sheetId: string) => void;
  onAdd: () => void;
};

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 8;

// Bottom-pinned overlay listing every sheet as a coloured glyph (with
// its name beside it at desktop widths). A trailing + opens the new-
// sheet modal. Tap a glyph to switch sheets; long-press (or
// right-click on desktop) opens the edit modal so the colour, glyph,
// or account assignment can be tweaked without leaving the workspace.
export function SheetTabs({
  sheets,
  activeSheetId,
  onSelect,
  onEdit,
  onAdd,
}: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface-2/95 px-2 py-1.5 shadow-2xl backdrop-blur">
        {sheets.map((sheet) => (
          <SheetTab
            key={sheet.id}
            sheet={sheet}
            active={sheet.id === activeSheetId}
            onSelect={() => onSelect(sheet.id)}
            onEdit={() => onEdit(sheet.id)}
          />
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          onClick={onAdd}
          aria-label="New sheet"
          title="New sheet"
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
        >
          <Plus size={18} aria-hidden focusable={false} />
        </button>
      </div>
    </div>
  );
}

function SheetTab({
  sheet,
  active,
  onSelect,
  onEdit,
}: {
  sheet: Sheet;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  // Long-press / right-click both open the edit modal. Mirrors the
  // AddRowButton pattern: a timer fires after LONG_PRESS_MS and a
  // `triggered` flag guards the trailing click so the tap doesn't
  // also fire a sheet switch.
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    triggered.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    clearTimer();
    timer.current = window.setTimeout(() => {
      triggered.current = true;
      timer.current = null;
      onEdit();
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (timer.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) clearTimer();
  }

  function handlePointerUp() {
    clearTimer();
  }

  function handleClick() {
    if (triggered.current) {
      triggered.current = false;
      return;
    }
    onSelect();
  }

  function handleContextMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    clearTimer();
    triggered.current = true;
    onEdit();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
      aria-pressed={active}
      aria-label={`${sheet.name} (long-press to edit)`}
      title={
        sheet.description ? `${sheet.name} — ${sheet.description}` : sheet.name
      }
      className={`sheet-tab inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        active ? "border-current" : "border-transparent hover:bg-surface"
      }`}
      style={{
        color: sheet.color,
        backgroundColor: active
          ? `color-mix(in srgb, ${sheet.color} 18%, transparent)`
          : undefined,
      }}
    >
      <CategoryIconGlyph name={sheet.glyph} size={16} />
      <span
        className={`max-w-[10rem] truncate text-xs font-bold tracking-wide ${
          active ? "" : "hidden md:inline"
        }`}
      >
        {sheet.name}
      </span>
    </button>
  );
}
