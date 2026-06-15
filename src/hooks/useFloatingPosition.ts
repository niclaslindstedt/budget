import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// {top, left, width, maxHeight, placement} for a floating element
// (dropdown, popover) anchored to a trigger element. `null` until the
// first measurement lands — call sites short-circuit rendering until
// then. `maxHeight` is the room left along the chosen axis (between
// the panel's top and the visible bottom for "below", or between the
// visible top and the panel's bottom for "above"). Call sites apply
// it as `max-height` with `overflow-y: auto` so the panel scrolls
// internally when its content is taller than the available space —
// keeps an input inside the panel reachable when the keyboard opens.
// `arrowLeft` is the trigger's horizontal centre, expressed in panel-
// local coordinates (pixels from the panel's left edge), and clamped
// into the panel's interior so it stays a sensible tip position even
// when the panel got shoved sideways to fit the viewport. Used by
// `FloatingPanel` to pin an optional pointer to the trigger.
//
// `placement` says which side of the trigger the panel sits on:
// - "below": `top` is the panel's TOP edge y-coordinate; the panel
//   grows downward from there.
// - "above": `top` is the y-coordinate where the panel's BOTTOM edge
//   should sit; consumers apply `transform: translateY(-100%)` to
//   anchor the bottom there without needing to measure panel height.
export type FloatingRect = {
  top: number;
  left: number;
  width: number;
  // The widest the panel may render before it would cross the viewport
  // edge, measured from the (clamped) `left` to the far margin. `width`
  // is only a *minimum* for `kind: "min"` panels, so intrinsic content
  // (long option hints) can otherwise balloon the panel off-screen in a
  // narrow column. Consumers apply this as `max-width` so the content
  // truncates instead of overflowing.
  maxWidth: number;
  maxHeight: number;
  arrowLeft: number;
  placement: "below" | "above";
};

// How wide the floating element should be.
// `min`: at least `minPx`, grows to trigger width if larger (pickers).
// `max`: at most `maxPx`, capped by the viewport minus margins (popovers).
// `grow`: at least `minPx`, otherwise sized to its content — the panel
//   grows horizontally with what it holds, capped only by the room left
//   to the viewport edge (so a long line widens the panel toward the
//   page edge instead of wrapping into a tall, scrolling column). The
//   description popover uses this so a long bank memo fills the width
//   before it ever wraps downward.
export type FloatingWidth =
  | { kind: "min"; minPx: number }
  | { kind: "max"; maxPx: number }
  | { kind: "grow"; minPx: number };

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

type VisualViewportSnapshot = {
  offsetTop: number;
  height: number;
};

function readVisualViewport(): VisualViewportSnapshot {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) {
    return {
      offsetTop: 0,
      height: typeof window !== "undefined" ? window.innerHeight : 0,
    };
  }
  return { offsetTop: vv.offsetTop, height: vv.height };
}

// Exported for unit tests. Production callers go through
// `useFloatingPosition`, which reads `vv` from `window.visualViewport`
// directly.
export function computeFloatingRect(
  rect: DOMRect,
  placement: FloatingPlacement,
  vv: VisualViewportSnapshot,
  win: {
    innerWidth: number;
    innerHeight: number;
    scrollX: number;
    scrollY: number;
  },
): FloatingRect {
  return compute(rect, placement, vv, win);
}

function compute(
  rect: DOMRect,
  placement: FloatingPlacement,
  vv: VisualViewportSnapshot,
  win: {
    innerWidth: number;
    innerHeight: number;
    scrollX: number;
    scrollY: number;
  } = {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  },
): FloatingRect {
  const gap = placement.gap ?? 4;
  const margin = placement.viewportMargin ?? 8;
  const document = placement.coordinateSpace === "document";

  let width: number;
  if (placement.width.kind === "min") {
    width = Math.max(placement.width.minPx, rect.width);
  } else if (placement.width.kind === "max") {
    width = Math.min(placement.width.maxPx, win.innerWidth - 2 * margin);
  } else {
    // `grow`: `width` is only the floor (applied as `min-width`).
    // Content drives the rendered width; the panel grows up to
    // `maxWidth` (the room to the viewport edge, computed below), then
    // wraps downward. Clamp the floor itself to the viewport so a wide
    // floor on a narrow screen can't push the panel off-screen.
    width = Math.min(placement.width.minPx, win.innerWidth - 2 * margin);
  }

  const scrollX = document ? win.scrollX : 0;
  const scrollY = document ? win.scrollY : 0;

  let left =
    placement.anchor === "right"
      ? rect.right - width + scrollX
      : rect.left + scrollX;
  const minLeft = scrollX + margin;
  const maxLeft = scrollX + win.innerWidth - margin - width;
  if (left > maxLeft) left = maxLeft;
  if (left < minLeft) left = minLeft;

  // Room from the panel's left edge to the far viewport margin. Caps
  // the rendered width so a `kind: "min"` panel whose intrinsic content
  // is wider than both its trigger and the remaining space truncates
  // rather than spilling past the screen edge.
  const maxWidth = scrollX + win.innerWidth - margin - left;

  // Visible viewport bounds. With `coordinateSpace: "viewport"` and
  // `position: fixed` the panel is positioned relative to the layout
  // viewport; iOS shifts the visual viewport up by `offsetTop` to fit
  // the focused input above the keyboard, so use those layout-viewport
  // coordinates of the visible region to clamp the panel into view.
  // With `coordinateSpace: "document"` the visible region needs page
  // scroll added so the bounds compare with the panel's document-
  // relative coordinates.
  const visibleTop = vv.offsetTop + (document ? scrollY : 0);
  const visibleBottom = visibleTop + vv.height;

  // Pick a side. Default to "below", but flip to "above" when there
  // isn't enough room below to render a useful number of rows AND
  // there's more room above. The threshold matches the listbox-with-
  // a-handful-of-items case the pickers were designed for (category /
  // type / backend / generic select): ~5 rows + the create row. Below
  // that, an upward flip is the difference between "showing 1 item
  // with a scrollbar pinned to the visible-bottom margin" and "showing
  // the whole list growing toward the top of the screen". Users
  // working at the end of a long sheet hit the former constantly,
  // which is the bug this flip fixes.
  const MIN_USEFUL_BELOW = 180;
  const triggerTopCoord = rect.top + scrollY;
  const triggerBottomCoord = rect.bottom + scrollY;
  const spaceBelow = visibleBottom - triggerBottomCoord - gap - margin;
  const spaceAbove = triggerTopCoord - visibleTop - gap - margin;
  const verticalPlacement: "below" | "above" =
    spaceBelow < MIN_USEFUL_BELOW && spaceAbove > spaceBelow
      ? "above"
      : "below";

  let top: number;
  let maxHeight: number;
  if (verticalPlacement === "above") {
    // Anchor the panel's BOTTOM edge `gap` px above the trigger.
    // Consumer applies `translateY(-100%)` so we never need to know
    // the actual rendered panel height up front.
    top = triggerTopCoord - gap;
    maxHeight = Math.max(120, spaceAbove);
  } else {
    top = triggerBottomCoord + gap;
    // Viewport-coord floats (`position: fixed` pickers anchored to the
    // layout viewport) need clamping into the visible region — they
    // don't scroll with the page, so iOS's visual-viewport shift for
    // the keyboard could leave them above the visible area where the
    // user can never reach them. Document-coord popovers (description
    // reveal) opt out: they scroll with the page, iOS auto-scrolls the
    // focused textarea into view above the keyboard, and the popover
    // rides along with the trigger row. Clamping would yank the panel
    // off its row every time the visual viewport shifts during the
    // keyboard animation — the user perceives that as the popover
    // jumping away from where it should be.
    if (!document) {
      const triggerHiddenAbove = triggerBottomCoord < visibleTop;
      if (triggerHiddenAbove && top < visibleTop + margin) {
        top = visibleTop + margin;
      }
      // Don't park the panel below the visible region either — better
      // to let it cover the trigger than render off-screen at the
      // bottom.
      const maxTop = visibleBottom - margin - 80;
      if (top > maxTop) top = Math.max(visibleTop + margin, maxTop);
    }
    maxHeight = Math.max(120, visibleBottom - top - margin);
  }

  // Trigger centre in panel-local coordinates, clamped to leave room
  // for the rounded corner + the arrow's own half-width so the tip
  // never tucks under the panel's border radius.
  const triggerCentreX = rect.left + rect.width / 2 + scrollX;
  const arrowGutter = 14;
  let arrowLeft = triggerCentreX - left;
  if (arrowLeft < arrowGutter) arrowLeft = arrowGutter;
  if (arrowLeft > width - arrowGutter) arrowLeft = width - arrowGutter;

  return {
    top,
    left,
    width,
    maxWidth,
    maxHeight,
    arrowLeft,
    placement: verticalPlacement,
  };
}

// Measures `triggerRef` while `open` is true and returns its
// {top, left, width, maxHeight}. Recomputes on window resize, on any
// ancestor scroll (capture phase), and on visualViewport resize /
// scroll — the last two fire on iOS when the soft keyboard opens or
// closes and we need the panel to re-clamp into the visible region.
// Reads `placement` through a latest-ref, so callers can pass a fresh
// placement object each render without re-attaching listeners or re-
// measuring needlessly — the placement that wins is whichever one
// applies at the next measurement (open, resize, or scroll).
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
      setRect(
        compute(
          el.getBoundingClientRect(),
          placementRef.current,
          readVisualViewport(),
        ),
      );
    }
    measure();
    window.addEventListener("resize", measure);
    // Capture phase catches scrolls on any ancestor (e.g. the page body).
    window.addEventListener("scroll", measure, true);
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [open, triggerRef]);

  return rect;
}
