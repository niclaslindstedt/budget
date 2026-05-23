import { useEffect } from "react";

// iOS 26 PWA cold-launch correction for the BottomBar.
//
// User-observed: in a home-screen-installed PWA, the bar lands
// 20–30 px above the screen edge on cold launch, and a single
// pixel of overscroll-bounce makes it "glide down and snap" to
// the correct position. That snap is iOS reconciling its visual
// viewport — until that reconcile happens, `position: fixed;
// bottom: 0` anchors to a clipped `visualViewport.bottom` instead
// of the layout viewport's actual bottom edge (WebKit #297779).
//
// Five earlier JS-driven attempts (PRs #357 / #360 / #361 / #362 /
// #367) all tried to compute the gap from various viewport units
// (`100dvh`, `100svh`, `100vh`, etc.) and got tripped up because
// the CSS units themselves are poisoned on cold launch. This
// iteration takes a different tack: read `visualViewport.height`
// directly (which IS the rendered visible area, the same value the
// compositor uses to anchor the bar), subtract from
// `window.innerHeight` (the layout viewport — the value iOS gets
// right), and write the delta to `--bar-offset` on `<html>`. The
// standalone-mode CSS in `styles.css` then translates the fixed
// BottomBar down by that delta.
//
// `vv.offsetTop` is INTENTIONALLY excluded from the math: it
// tracks the overscroll-bounce position (which iOS shifts during
// rubber-band), and including it would make the bar walk on every
// drag — the failure mode PRs #361 / #362 hit. `vv.height` alone
// is stable across drags; it only changes when iOS reconciles the
// visual viewport. So a fresh measurement on `vv.resize` is
// exactly the right trigger.
//
// `computeBarOffset` is the pure shape kept for the unit tests
// (`tests/visual_viewport_offset_test.ts`). `useVisualViewportOffset`
// wires it to `visualViewport.resize`, `window.resize`,
// `orientationchange`, and `pageshow` (the BFCache restore path a
// backgrounded PWA takes when resumed).

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

// The shape `useVisualViewportOffset` writes to `--bar-offset`.
// Subset of `computeViewportBottomOffset` that drops the `offsetTop`
// term — see the long comment above for why.
export function computeBarOffset(input: {
  innerHeight: number;
  viewportHeight: number;
}): number {
  if (input.viewportHeight >= input.innerHeight - 1) return 0;
  return Math.max(0, input.innerHeight - input.viewportHeight);
}

function syncBarOffset(): void {
  if (typeof window === "undefined") return;
  const vv = window.visualViewport;
  if (!vv) return;
  const offset = computeBarOffset({
    innerHeight: window.innerHeight,
    viewportHeight: vv.height,
  });
  document.documentElement.style.setProperty(
    "--bar-offset",
    `${Math.round(offset)}px`,
  );
}

export function useVisualViewportOffset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only wire the correction inside installed-PWA windows — in a
    // regular browser tab the bar's standalone-mode CSS rule
    // doesn't apply, so the variable would be inert anyway.
    if (!window.matchMedia("(display-mode: standalone)").matches) return;

    syncBarOffset();

    const vv = window.visualViewport;
    // `vv.resize` only — NOT `vv.scroll`. Scroll fires on every
    // page scroll on iOS 26 and would either burn CPU or (if we
    // included `offsetTop`) make the bar walk during overscroll.
    if (vv) {
      vv.addEventListener("resize", syncBarOffset);
    }
    window.addEventListener("resize", syncBarOffset);
    window.addEventListener("orientationchange", () => {
      // Give iOS a beat to settle the rotation before re-measuring.
      setTimeout(syncBarOffset, 300);
    });
    // `pageshow` fires when a PWA is resumed from a backgrounded
    // state (the BFCache restore path).
    window.addEventListener("pageshow", syncBarOffset);

    // Also re-measure on a few timeouts. iOS sometimes settles the
    // visual viewport up to a second after the first paint — re-
    // syncing then catches a late reconcile that didn't fire a
    // `vv.resize` event we could hook into.
    const timeouts = [50, 150, 400, 1000].map((delay) =>
      setTimeout(syncBarOffset, delay),
    );

    return () => {
      if (vv) {
        vv.removeEventListener("resize", syncBarOffset);
      }
      window.removeEventListener("resize", syncBarOffset);
      window.removeEventListener("pageshow", syncBarOffset);
      timeouts.forEach(clearTimeout);
      // The orientation handler closes over the timeout; leaving
      // it attached for the page's lifetime is harmless — the hook
      // is mounted in `LanguageRoot` which never unmounts.
    };
  }, []);
}
