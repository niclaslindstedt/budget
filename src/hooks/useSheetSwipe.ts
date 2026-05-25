import { useEffect, useRef } from "react";

import { unlock } from "../data/achievements";

// Touch-driven sheet-switch fallback. Listens at the document level
// for a horizontal swipe that originates on a "neutral" page area —
// anywhere that doesn't already own a horizontal gesture — and fires
// `onSwipeLeft` / `onSwipeRight` once the user crosses
// `thresholdPx()` and lets go.
//
// Deliberately touch-only — desktop has the BottomBar tablist's
// Arrow-Left / Right shortcuts already (`src/components/BottomBar.tsx`,
// `onTabKey`). Pointer events would also pick up trackpad two-finger
// scrolls and mouse drags, which both feel wrong as a "switch app
// page" gesture.
//
// Opt-outs: an origin inside `[data-swipe-handled]` (rows, the
// BottomBar), `[data-active-portal]` (FloatingPanel, Modal,
// DismissBackdrop), `[aria-modal="true"]` (any open modal), or a
// form-interactive control (input / textarea / select /
// contenteditable) is ignored — *except* when the touch starts
// inside the absolute-edge band (`isInSheetSwipeEdgeBand`). The
// hook is gated on standalone PWA mode by its caller
// (`AppShell.tsx`), so there's no browser edge-back gesture left
// to fight; those few edge pixels are reserved for the sheet switch
// so a user can swipe between sheets even when their thumb lands on
// a row with its own left-swipe action menu. Row swipe handlers
// (`BudgetRow.tsx`, `AccountsPage.tsx`) read the same band and
// stay disarmed for touches that originate inside it.

// Minimum horizontal travel before the swipe fires. The viewport-
// relative term scales the threshold up on wide phones / foldables;
// the 60 px floor keeps the gesture deliberate on narrow viewports
// (a row swipe arms at 40 px, so this stays comfortably above it).
function thresholdPx(): number {
  return Math.max(60, window.innerWidth * 0.15);
}

// Discrimination tolerance — the gesture has to commit to one axis
// before we'll either bail (vertical) or arm (horizontal). 10 px is
// the same threshold the row-swipe handler uses
// (`src/components/BudgetRow.tsx`).
const AXIS_LOCK_PX = 10;

// Width of the absolute-edge band on each vertical side of the
// viewport. Touches that start inside this band bypass the
// `data-swipe-handled` opt-out so a swipe begun at the screen edge
// drives a sheet switch even when the user's thumb landed on a row.
// Kept narrow enough that the bulk of every row still belongs to the
// row's own left-swipe action menu.
const EDGE_OVERRIDE_PX = 20;

export function isInSheetSwipeEdgeBand(
  clientX: number,
  viewportWidth: number,
): boolean {
  return (
    clientX < EDGE_OVERRIDE_PX || clientX > viewportWidth - EDGE_OVERRIDE_PX
  );
}

type Options = {
  // When false, the listener is mounted but no-ops. Mirrors the
  // `enabled` flag on `usePullToRefresh` — useful for gating during
  // initial load / conflict modals, or when there's only one sheet.
  enabled?: boolean;
};

function hasOpenModal(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

function isOptedOut(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      '[data-swipe-handled], [data-active-portal], input, textarea, select, [contenteditable="true"]',
    ) !== null
  );
}

type Axis = "none" | "horizontal" | "vertical";

export function useSheetSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  options: Options = {},
): void {
  const { enabled = true } = options;

  // Refs so the document listeners don't churn when callbacks change.
  const onLeftRef = useRef(onSwipeLeft);
  const onRightRef = useRef(onSwipeRight);
  onLeftRef.current = onSwipeLeft;
  onRightRef.current = onSwipeRight;

  useEffect(() => {
    if (!enabled) return;

    let startX: number | null = null;
    let startY: number | null = null;
    let axis: Axis = "none";

    const reset = () => {
      startX = null;
      startY = null;
      axis = "none";
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      if (hasOpenModal()) return;
      const t = e.touches[0];
      // A touch starting inside the absolute-edge band always counts
      // as a sheet-switch candidate, even when the user's thumb
      // lands on a row that would otherwise own the gesture. Outside
      // the band, defer to whatever element owns the touch.
      const onEdge = isInSheetSwipeEdgeBand(t.clientX, window.innerWidth);
      if (!onEdge && isOptedOut(e.target)) return;
      startX = t.clientX;
      startY = t.clientY;
      axis = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startX === null || startY === null) return;
      if (e.touches.length !== 1) {
        reset();
        return;
      }
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (axis === "none") {
        if (Math.abs(dy) > AXIS_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
          // User is scrolling — give the page its gesture back.
          axis = "vertical";
          reset();
        } else if (Math.abs(dx) > AXIS_LOCK_PX && Math.abs(dx) > Math.abs(dy)) {
          axis = "horizontal";
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (startX === null) {
        reset();
        return;
      }
      const endX = e.changedTouches[0]?.clientX ?? startX;
      const dx = endX - startX;
      const wasHorizontal = axis === "horizontal";
      reset();
      if (!wasHorizontal) return;
      if (Math.abs(dx) <= thresholdPx()) return;
      unlock("swiper");
      if (dx < 0) onLeftRef.current();
      else onRightRef.current();
    };

    const onTouchCancel = () => {
      reset();
    };

    // All listeners stay passive — unlike pull-to-refresh, this hook
    // does not call `preventDefault()`. Suppressing the default would
    // also kill iOS rubber-band feedback and any nested horizontal
    // scroll the page might grow in the future. The opt-out attribute
    // is enough to keep us out of the way of established gestures.
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled]);
}
