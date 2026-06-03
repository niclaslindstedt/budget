import { useEffect, useState } from "react";

// Tracks vertical scroll direction on the window and returns `true`
// when the user has scrolled down past a small threshold — intended
// to hide a pinned-bottom toolbar. Collapse-on-scroll-down is
// immediate; the reveal is deferred until the scroll comes to rest
// (see `SHOW_IDLE_MS`) rather than firing on the first upward delta.
//
// Why the reveal waits for the scroll to settle: the consumer
// (`BottomBar`) is `position: fixed; bottom: 0` in standalone PWA
// mode. On iOS a fixed element that un-hides mid-momentum (or during
// the rubber-band bounce at either edge, where the delta briefly
// reverses sign) gets composited at a stale, document-anchored
// position — so it "pops up" in the middle of the screen and only
// snaps to the bottom edge once the gesture ends. Holding the reveal
// until the scroll is idle means the slide-in always starts from the
// settled bottom edge. The collapse stays immediate because sliding
// the bar toward and past the edge it's anchored to has no such
// ghost.
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

// Idle gap (ms) with no scroll events before the bar is allowed to
// reveal. iOS keeps firing scroll events throughout a momentum fling,
// so a short debounce only elapses once the fling (and its trailing
// rubber-band bounce) has fully stopped and the fixed bar has settled
// at the bottom edge.
const SHOW_IDLE_MS = 120;

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
    let showTimer = 0;

    const cancelShow = () => {
      if (showTimer !== 0) {
        window.clearTimeout(showTimer);
        showTimer = 0;
      }
    };

    // Reveal only once the scroll has been idle for `SHOW_IDLE_MS`.
    // Each upward delta restarts the timer, so a continuous fling
    // keeps the bar hidden until the gesture (and its rubber-band
    // tail) stops and the fixed bar has re-settled at the bottom edge.
    const scheduleShow = () => {
      cancelShow();
      showTimer = window.setTimeout(() => {
        showTimer = 0;
        setHidden(false);
      }, SHOW_IDLE_MS);
    };

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
        scheduleShow();
        return;
      }

      if (delta > 0) {
        accDown += delta;
        if (accDown >= HIDE_THRESHOLD) {
          cancelShow();
          setHidden(true);
        }
      } else if (delta < 0) {
        accDown = 0;
        scheduleShow();
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
      cancelShow();
      setHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener(SUPPRESS_EVENT, onSuppress);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener(SUPPRESS_EVENT, onSuppress);
      if (rafId !== 0) window.cancelAnimationFrame(rafId);
      cancelShow();
    };
  }, [enabled]);

  return hidden;
}
