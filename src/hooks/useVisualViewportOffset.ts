import { useEffect } from "react";

// iOS 26 ships a `visualViewport` regression (WebKit #297779, Apple
// devforums #800125) where an installed PWA window's
// `visualViewport.height` — and every viewport unit (`svh`, `dvh`,
// `lvh`, `vh`) that follows it — resolves persistently smaller than
// the physical screen. `position: fixed; bottom: 0` then anchors to
// `visualViewport.bottom` (not the screen edge), so a bottom-pinned
// toolbar lands 100–200 px above the screen on a first-launch empty
// install. The bar visibly "snaps to place" the moment the user
// drags — which is iOS finally recomputing — but until then the
// rendered position is wrong.
//
// `window.innerHeight` is the ONE viewport-related value iOS 26 still
// reports correctly (the layout viewport, distinct from the visual
// viewport). This module exposes:
//
//   - `syncViewportVars()` — write `--screen-h-px` (innerHeight in
//     pixels) and `--viewport-bottom-offset` (the JS-measured gap
//     between layout and visual viewport) to `<html>`. Pure DOM
//     mutation, safe to call before React mounts so the very first
//     paint is correct.
//   - `useVisualViewportOffset()` — React hook that calls
//     `syncViewportVars` on mount and re-runs it on every
//     `visualViewport.resize` / `.scroll`, `window.resize`, and
//     `orientationchange`. Mount it once near the root of the tree.
//
// CSS in `src/styles.css` then anchors the standalone-mode BottomBar
// to `top: var(--screen-h-px)` with `translate: 0 -100%`, so the
// bar's bottom edge lands at the layout-viewport bottom regardless
// of how iOS lies about `visualViewport`.

// Pulled out for unit testing — the sync function wires this to
// visualViewport's events.
export function computeViewportBottomOffset(input: {
  innerHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}): number {
  // Same `>= innerHeight - 1` clamp as `computeKeyboardInset` —
  // guards against sub-pixel rounding noise reporting a fake 1px
  // clip on Android Chrome with `interactive-widget=resizes-content`.
  if (input.viewportHeight >= input.innerHeight - 1) return 0;
  return Math.max(
    0,
    input.innerHeight - input.viewportHeight - input.viewportOffsetTop,
  );
}

export function syncViewportVars(): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  // `--screen-h-px` is the anchor the standalone-mode bottom bar
  // resolves its `top` against. Using `innerHeight` (correct on
  // iOS 26) rather than `100vh` (clipped on iOS 26) is the whole
  // point of the workaround.
  root.style.setProperty("--screen-h-px", `${window.innerHeight}px`);
  const vv = window.visualViewport;
  if (vv) {
    // `--viewport-bottom-offset` is kept around for diagnostics and
    // for any future surface that needs to know the size of the
    // clipped strip.
    const offset = computeViewportBottomOffset({
      innerHeight: window.innerHeight,
      viewportHeight: vv.height,
      viewportOffsetTop: vv.offsetTop,
    });
    root.style.setProperty(
      "--viewport-bottom-offset",
      `${Math.round(offset)}px`,
    );
  }
}

export function useVisualViewportOffset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    syncViewportVars();
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", syncViewportVars);
      vv.addEventListener("scroll", syncViewportVars);
    }
    window.addEventListener("resize", syncViewportVars);
    window.addEventListener("orientationchange", syncViewportVars);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", syncViewportVars);
        vv.removeEventListener("scroll", syncViewportVars);
      }
      window.removeEventListener("resize", syncViewportVars);
      window.removeEventListener("orientationchange", syncViewportVars);
    };
  }, []);
}
