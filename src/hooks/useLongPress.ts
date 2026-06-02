import { useCallback, useRef } from "react";

// Default hold duration before a press counts as "long", and the
// movement tolerance past which the press is abandoned (a drag, a
// scroll, or a swipe rather than a deliberate hold). Every call site
// shared these two values, so they live here as the hook's defaults.
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 8;

export type UseLongPressOptions = {
  // Fired when the pointer is held past `ms` without moving past the
  // tolerance, or immediately on a right-click (contextmenu).
  onLongPress: () => void;
  // When false, pointerdown / contextmenu are no-ops — the affordance
  // is suppressed without unwiring the handlers. Defaults to true.
  enabled?: boolean;
  ms?: number;
  moveTolerancePx?: number;
  // Optional per-event guard run after the `enabled` (and, for
  // pointerdown, the primary-button) check: return true to skip the
  // press entirely. Lets a row-level handler bow out when the tap
  // landed on an interactive control or an action cell so the press
  // doesn't race that control's own click.
  shouldSkip?: (e: React.PointerEvent | React.MouseEvent) => boolean;
};

// Pointer long-press / right-click state machine, shared by every
// tappable affordance that opens a secondary action on hold (sheet
// tabs, the add-row button, budget rows, the description pill). A timer
// armed on pointerdown fires `onLongPress` after the threshold; moving
// past the tolerance or lifting before it cancels. `consumeTriggered`
// lets the trailing click (which fires after pointerup) swallow itself
// so the same gesture doesn't also fire the element's tap action.
//
// The returned handlers are stable across renders, so memoised cells
// that previously held their own `useCallback`-wrapped handlers keep
// the same identity guarantees.
export function useLongPress({
  onLongPress,
  enabled = true,
  ms = LONG_PRESS_MS,
  moveTolerancePx = LONG_PRESS_MOVE_PX,
  shouldSkip,
}: UseLongPressOptions) {
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      if (shouldSkip?.(e)) return;
      triggered.current = false;
      startX.current = e.clientX;
      startY.current = e.clientY;
      cancel();
      timer.current = window.setTimeout(() => {
        triggered.current = true;
        timer.current = null;
        onLongPress();
      }, ms);
    },
    [enabled, shouldSkip, cancel, ms, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (timer.current === null) return;
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;
      if (Math.hypot(dx, dy) > moveTolerancePx) cancel();
    },
    [cancel, moveTolerancePx],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      if (shouldSkip?.(e)) return;
      e.preventDefault();
      cancel();
      triggered.current = true;
      onLongPress();
    },
    [enabled, shouldSkip, cancel, onLongPress],
  );

  // Read-and-reset the "a long-press just fired" flag. Call it from the
  // trailing click handler: returns true (and clears the flag) when the
  // click should be swallowed, false when it's an ordinary tap.
  const consumeTriggered = useCallback(() => {
    if (!triggered.current) return false;
    triggered.current = false;
    return true;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    // Wire to onPointerUp / onPointerCancel / onPointerLeave.
    onPointerUp: cancel,
    onContextMenu,
    consumeTriggered,
    cancel,
  };
}
