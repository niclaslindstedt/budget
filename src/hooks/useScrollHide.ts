import { useEffect, useState } from "react";

// Tracks vertical scroll direction on the window and returns `true`
// when the user has scrolled down past a small threshold — intended
// to hide a pinned-bottom toolbar. Flips back to `false` on any
// upward scroll or while the page is in the always-visible band near
// the top.
//
// Mirrors the visual feel of mobile Safari's URL-bar collapse — the
// browser-mode BottomBar already rides that animation via
// `translate-y-[calc(100dvh-100svh)]` (the URL bar's natural
// hide-on-scroll-down is what does the work). This hook is for
// installed-PWA mode where there's no URL bar to anchor the trick,
// so gate the call with `useIsStandalone()` to skip the listener in
// the browser where the CSS path already handles it.

// Continuous downward scroll (px) before flipping to hidden. Tuned
// so a small finger fidget can't accidentally collapse the chrome.
const HIDE_THRESHOLD = 24;
// Always-visible band near the top of the page. Below this the bar
// stays put even if the user is dragging downward, so opening the
// app or pulling-to-refresh doesn't immediately collapse the chrome.
const TOP_BAND = 60;

type Options = {
  enabled?: boolean;
};

export function useScrollHide({ enabled = true }: Options = {}): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    if (typeof window === "undefined") return;

    let lastY = window.scrollY;
    let accDown = 0;
    let rafId = 0;

    const update = () => {
      rafId = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;

      if (y <= TOP_BAND) {
        accDown = 0;
        setHidden(false);
        return;
      }

      if (delta > 0) {
        accDown += delta;
        if (accDown >= HIDE_THRESHOLD) setHidden(true);
      } else if (delta < 0) {
        accDown = 0;
        setHidden(false);
      }
    };

    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  return hidden;
}
