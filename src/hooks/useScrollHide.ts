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

// How long a `suppressScrollHide()` call keeps the hook ignoring
// scroll events. Long enough to cover both the initial scrollIntoView
// and the polling refine pass `scrollToToday` runs after lazy-mounted
// rows arrive, but short enough that a real user scroll-down that
// follows the auto-scroll still triggers hide normally.
const SUPPRESS_MS = 600;

// Custom event the hook listens for to skip the next burst of scroll
// events. Dispatched by `suppressScrollHide()` below — call it from
// any code that drives a programmatic scroll for layout reasons (auto
// scroll-to-today on sheet mount, row-pulse navigation, header-click
// "scroll to current month") so the bar doesn't slide off-screen in
// response to its own jump.
const SUPPRESS_EVENT = "budget:scroll-hide-suppress";

// Pulse the suppress event so the BottomBar's hide-on-scroll hook
// ignores the next ~600ms of scroll events. Safe to call from any
// context — the event is a no-op when no hook is mounted.
export function suppressScrollHide(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPPRESS_EVENT));
}

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
    let suppressUntil = 0;

    const update = () => {
      rafId = 0;
      const y = window.scrollY;
      // Programmatic-scroll window: re-baseline the tracker so when
      // the suppression ends, user scrolls resume from the new
      // position rather than firing a giant delta from where we
      // started before the jump.
      if (performance.now() < suppressUntil) {
        lastY = y;
        accDown = 0;
        return;
      }
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

    const onSuppress = () => {
      suppressUntil = performance.now() + SUPPRESS_MS;
      accDown = 0;
      lastY = window.scrollY;
      setHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(SUPPRESS_EVENT, onSuppress);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(SUPPRESS_EVENT, onSuppress);
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
    };
  }, [enabled]);

  return hidden;
}
