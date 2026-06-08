import { useRef, useState, type TouchEvent } from "react";

import { dominantAxis, TOUCH_AXIS_ARM_PX } from "./touch-gestures";
import { readIsStandalone } from "./useIsStandalone";
import { isInSheetSwipeEdgeBand } from "./useSheetSwipe";

// Shared swipe-to-reveal gesture used by every per-row action strip
// (budget rows, account rows, transfer rows). A left-swipe past
// SWIPE_THRESHOLD flips `swiped` true so the row's CSS slides its
// content left and reveals the action cell from behind. A right-
// swipe past the same threshold dismisses it. Touches that start in
// the standalone-mode edge band are surrendered to the document-
// level sheet-switch gesture (see `useSheetSwipe.ts`) so the two
// can't fight for the same touch.
const SWIPE_THRESHOLD = 40;

type Options = {
  // Disable the gesture without unmounting — `BudgetRow` uses this
  // to suppress per-row swipes while bulk-select mode is active.
  disabled?: boolean;
};

export type RowSwipeOptions = Options;

export type RowSwipe = {
  swiped: boolean;
  setSwiped: (next: boolean) => void;
  touchHandlers: {
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: (e: TouchEvent) => void;
  };
};

export function useRowSwipe(options: Options = {}): RowSwipe {
  const { disabled = false } = options;
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    if (disabled) return;
    const t = e.touches[0];
    if (
      readIsStandalone() &&
      isInSheetSwipeEdgeBand(t.clientX, window.innerWidth)
    ) {
      startX.current = null;
      startY.current = null;
      moved.current = false;
      return;
    }
    startX.current = t.clientX;
    startY.current = t.clientY;
    moved.current = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (disabled) return;
    if (startX.current === null || startY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (dominantAxis(dx, dy, TOUCH_AXIS_ARM_PX) === "horizontal") {
      moved.current = true;
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (disabled) return;
    if (startX.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX.current;
    startX.current = null;
    startY.current = null;
    if (!moved.current) return;
    if (dx < -SWIPE_THRESHOLD) setSwiped(true);
    else if (dx > SWIPE_THRESHOLD) setSwiped(false);
  };

  return {
    swiped,
    setSwiped,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
