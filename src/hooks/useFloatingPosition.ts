import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// {top, left, width} for a floating element (dropdown, popover) anchored
// to a trigger element. `null` until the first measurement lands — call
// sites short-circuit rendering until then.
export type FloatingRect = {
  top: number;
  left: number;
  width: number;
};

// How wide the floating element should be.
// `min`: at least `minPx`, grows to trigger width if larger (pickers).
// `max`: at most `maxPx`, capped by the viewport minus margins (popovers).
export type FloatingWidth =
  | { kind: "min"; minPx: number }
  | { kind: "max"; maxPx: number };

export type FloatingPlacement = {
  width: FloatingWidth;
  // Which edge of the trigger drives the floating element's left
  // coordinate. `"left"` aligns left edges; `"right"` aligns right
  // edges (so the floating element opens "down and to the left" of
  // narrow chip triggers).
  anchor: "left" | "right";
  // Vertical gap between trigger bottom and floating top, in px.
  gap?: number;
  // Margin from the viewport edges the floating element must respect.
  viewportMargin?: number;
  // `"viewport"` returns coordinates relative to the visual viewport
  // (use with `position: fixed`). `"document"` adds `window.scroll{X,Y}`
  // so the floating element scrolls with the page (use with
  // `position: absolute` when the parent's stacking context can be
  // moved by the platform — iOS shifts the visual viewport up to fit
  // the soft keyboard, which yanks `position: fixed` popovers off
  // screen).
  coordinateSpace: "viewport" | "document";
};

function compute(rect: DOMRect, placement: FloatingPlacement): FloatingRect {
  const gap = placement.gap ?? 4;
  const margin = placement.viewportMargin ?? 8;
  const document = placement.coordinateSpace === "document";

  let width: number;
  if (placement.width.kind === "min") {
    width = Math.max(placement.width.minPx, rect.width);
  } else {
    width = Math.min(placement.width.maxPx, window.innerWidth - 2 * margin);
  }

  const scrollX = document ? window.scrollX : 0;
  const scrollY = document ? window.scrollY : 0;

  let left =
    placement.anchor === "right"
      ? rect.right - width + scrollX
      : rect.left + scrollX;
  const minLeft = scrollX + margin;
  const maxLeft = scrollX + window.innerWidth - margin - width;
  if (left > maxLeft) left = maxLeft;
  if (left < minLeft) left = minLeft;

  return { top: rect.bottom + gap + scrollY, left, width };
}

// Measures `triggerRef` while `open` is true and returns its
// {top, left, width}. Recomputes on window resize and on any
// ancestor scroll (capture phase). Reads `placement` through a
// latest-ref, so callers can pass a fresh placement object each
// render without re-attaching listeners or re-measuring needlessly —
// the placement that wins is whichever one applies at the next
// measurement (open, resize, or scroll).
export function useFloatingPosition(
  triggerRef: RefObject<HTMLElement | null>,
  open: boolean,
  placement: FloatingPlacement,
): FloatingRect | null {
  const [rect, setRect] = useState<FloatingRect | null>(null);
  const placementRef = useRef(placement);
  placementRef.current = placement;

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function measure() {
      const el = triggerRef.current;
      if (!el) return;
      setRect(compute(el.getBoundingClientRect(), placementRef.current));
    }
    measure();
    window.addEventListener("resize", measure);
    // Capture phase catches scrolls on any ancestor (e.g. the page body).
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, triggerRef]);

  return rect;
}
