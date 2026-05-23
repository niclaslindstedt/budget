import { useEffect } from "react";

// iOS 26 ships a `visualViewport` regression (WebKit #297779, Apple
// devforums #800125) where an installed PWA window's
// `visualViewport.height` resolves persistently smaller than
// `window.innerHeight`. Every viewport unit (`svh`/`dvh`/`lvh`) and
// every `position: fixed; bottom: 0` anchor follows
// `visualViewport`, so a bottom-pinned toolbar lands 100–200 px
// above the physical screen edge on a first-launch empty install —
// users see a visible gap that "snaps shut" the moment they
// drag/scroll, because the drag triggers iOS to re-evaluate and
// release the reserved strip.
//
// This hook measures the gap between the layout viewport
// (`window.innerHeight`, which iOS 26 still reports correctly) and
// the visual viewport (`visualViewport.height + offsetTop`, which it
// doesn't), and writes the delta to `--viewport-bottom-offset` on
// `<html>`. CSS in `src/styles.css` then translates the fixed
// BottomBar down by that amount inside the standalone-mode block,
// so the bar lands at the actual screen edge even before iOS gets
// around to recomputing. Browser mode never sees a non-zero offset
// (visualViewport stays accurate in a regular tab) so the same
// translation collapses to 0 — but the hook gates itself on the
// standalone-mode media query anyway so the CSS variable is only
// ever set when the override block can read it.

// Pulled out for unit testing — the hook wires this to
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

export function useVisualViewportOffset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;

    function update() {
      if (!vv) return;
      const offset = computeViewportBottomOffset({
        innerHeight: window.innerHeight,
        viewportHeight: vv.height,
        viewportOffsetTop: vv.offsetTop,
      });
      // Round to avoid sub-pixel jitter from triggering a re-layout
      // on every scroll event.
      root.style.setProperty(
        "--viewport-bottom-offset",
        `${Math.round(offset)}px`,
      );
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      root.style.removeProperty("--viewport-bottom-offset");
    };
  }, []);
}
