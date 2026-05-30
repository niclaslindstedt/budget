import { useEffect, useState } from "react";

// Pixels the on-screen keyboard currently covers at the bottom of the
// layout viewport. Backed by `window.visualViewport` — on iOS Safari
// the visual viewport shrinks and shifts up when the soft keyboard
// appears, so `innerHeight - visualViewport.height -
// visualViewport.offsetTop` is the height of the keyboard plus any
// floating browser chrome below it.
//
// Returns 0 when the keyboard is closed, when `visualViewport` is
// unavailable (desktop Firefox, very old browsers), and on Android
// Chrome with `interactive-widget=resizes-content` set (which resizes
// the layout viewport itself so the math collapses to ~0 — the
// `>= innerHeight - 1` clamp guards against 1px noise causing the
// modal footer's padding to flicker).

// Pulled out for unit testing — the hook just wires this to
// visualViewport's events.
export function computeKeyboardInset(input: {
  innerHeight: number;
  viewportHeight: number;
  viewportOffsetTop: number;
}): number {
  if (input.viewportHeight >= input.innerHeight - 1) return 0;
  return Math.max(
    0,
    input.innerHeight - input.viewportHeight - input.viewportOffsetTop,
  );
}

export function useVirtualKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    function update() {
      if (!vv) return;
      setInset(
        computeKeyboardInset({
          innerHeight: window.innerHeight,
          viewportHeight: vv.height,
          viewportOffsetTop: vv.offsetTop,
        }),
      );
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

// The currently-visible viewport height in CSS pixels — `0` when
// `visualViewport` is unavailable. Unlike `100vh`, which on iOS Safari
// resolves to the *large* viewport (toolbars hidden) regardless of
// whether the browser chrome is currently on screen, `visualViewport`
// reports the real visible band. A fullscreen modal whose footer must
// stay above the soft keyboard pins to this so it never overshoots by
// the browser-toolbar height. The keyboard-open height math derived
// from `100vh - keyboardInset` is correct in a standalone PWA (where
// `100vh === innerHeight`) but too tall in Safari, where the toolbar
// makes `100vh` exceed the visible area and the footer slides off the
// bottom edge. Reading the height directly removes that overshoot.
export function useVisualViewportHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    function update() {
      if (!vv) return;
      setHeight(vv.height);
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
