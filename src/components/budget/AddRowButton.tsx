import { useRef } from "react";
import { Plus, Sparkles } from "lucide-react";

import { useT } from "../../i18n";
import { useActiveRowHasActive } from "../useActiveRow";

type Props = {
  onAdd: () => void;
  onComplex: () => void;
};

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 8;

// Plus button with a long-press / right-click escape hatch that opens
// the complex-entry modal. Tap = add a blank row (the existing path);
// hold (or right-click on desktop) = open the modal for a recurring
// or categorised entry.
export function AddRowButton({ onAdd, onComplex }: Props) {
  const t = useT();
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  // Disabled while any row in the same sheet is swiped or otherwise
  // active. The first tap outside that row dismisses it via the
  // ActiveRowProvider — we don't want the same tap to also add a new
  // blank row when it landed on this button by mistake.
  const disabled = useActiveRowHasActive();

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
      onComplex();
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
    // Pointerup fires before click — if the long-press already triggered,
    // swallow the click so we don't also add a blank row.
    if (triggered.current) {
      triggered.current = false;
      return;
    }
    onAdd();
  }

  function handleContextMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    clearTimer();
    triggered.current = true;
    onComplex();
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className="add-row-button group relative flex w-full cursor-pointer items-center justify-center py-3 text-accent select-none hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
      aria-label={t("addRow.ariaLabel")}
    >
      <Plus size={22} aria-hidden focusable={false} />
      <Sparkles
        size={10}
        aria-hidden
        focusable={false}
        className="absolute right-2 bottom-1.5 text-muted opacity-60 group-hover:text-meta"
      />
    </button>
  );
}
