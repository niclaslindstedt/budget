// `computeViewportBottomOffset` is the pure measurement helper used
// by `useVirtualKeyboardInset` and (historically) by the
// `useVisualViewportOffset` hook. Five PRs of attempted JS-driven
// workarounds for the iOS 26 standalone-PWA bottom-bar bug all
// failed because every viewport-related signal — `innerHeight`,
// `visualViewport.height`, `100dvh`, `100svh`,
// `env(safe-area-inset-bottom)` — reads from the same poisoned
// compositor rectangle on a cold launch. The current fix is
// CSS-only: `src/styles.css` switches the standalone-mode page
// floor to `100vh` (per the fozzedout iPhone PWA gist, the ONE
// viewport-related signal iOS 26 standalone gets right from cold
// start) and lets the BottomBar's default `position: sticky;
// bottom: 0` land at the wrapper's bottom. No JS positioning, no
// `--vv-bottom` variable, no `bootViewportWorkaround` — and crucially
// no risk of the bar walking off the bottom of an EMPTY page (where
// the user can't scroll to bring it back).
//
// The unit tests in `tests/visual_viewport_offset_test.ts` cover
// `computeViewportBottomOffset` and keep it healthy in case a
// future keyboard-handling surface wants to reach for it.

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
