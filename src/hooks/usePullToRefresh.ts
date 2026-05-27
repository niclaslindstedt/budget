import { useCallback, useEffect, useRef, useState } from "react";

import { unlock } from "../data/achievements";
import { hasOpenFloatingPanel, hasOpenModal } from "./dom-queries";

// Touch-driven pull-to-refresh. Listens at the document level for a
// downward drag that starts while the page is scrolled to the top,
// applies rubber-band damping, and fires `onRefresh` once the user
// crosses `TRIGGER_DISTANCE` and lets go.
//
// Deliberately touch-only — pull-to-refresh is a mobile gesture; on
// desktop the user has a sync-details modal and (one day) a refresh
// button. Pointer events would also bake in "mouse drag refreshes the
// page" behaviour, which feels wrong with a trackpad's two-finger
// scroll.
//
// Modal-open gate: while any `[aria-modal="true"]` element is mounted
// (every Modal in this project sets it), the gesture is suppressed
// so a downward drag inside a centered modal can't accidentally
// trigger a reload of the chrome behind it.

// Drag distance (px, after rubber-band damping) the user must reach
// before release fires `onRefresh`. Tuned to feel intentional but
// reachable in one thumb travel — 70px is just below "thumb-to-
// opposite-side-of-screen".
const TRIGGER_DISTANCE = 70;
// Max damped distance the indicator will travel. Past this point
// further pulling does nothing visually — keeps the indicator from
// running off the bottom of the safe-area band and signals to the
// user that "yes, it's armed; you can let go".
const MAX_PULL = 110;
// Resistance applied to raw finger travel so the gesture feels like
// pulling against a spring instead of one-to-one tracking. 0.5 =
// indicator moves half as far as the finger, which matches the
// iOS-native pull-to-refresh feel closely enough.
const RESISTANCE = 0.5;

export type PullToRefreshState =
  // No drag in progress and not refreshing.
  | "idle"
  // User is dragging down but hasn't crossed the trigger distance yet
  // — releasing now would cancel.
  | "pulling"
  // User is dragging down and HAS crossed the trigger distance —
  // releasing now would fire `onRefresh`. Indicator flips its label /
  // arrow direction in this state.
  | "release"
  // `onRefresh` is in flight. Indicator shows a spinner; touch events
  // are ignored until the promise resolves.
  | "refreshing";

type Options = {
  // When false, the listener is mounted but no-ops. Useful for gating
  // by status — e.g. don't allow a pull while the initial load is
  // still resolving or a conflict modal is up.
  enabled?: boolean;
};

type Result = {
  state: PullToRefreshState;
  // Current damped pull distance in px (0..MAX_PULL). The indicator
  // uses this to translate / fade itself in as the user pulls.
  pullDistance: number;
};

function isFormInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  );
}

export function usePullToRefresh(
  onRefresh: () => Promise<void> | void,
  options: Options = {},
): Result {
  const { enabled = true } = options;
  const [state, setState] = useState<PullToRefreshState>("idle");
  const [pullDistance, setPullDistance] = useState(0);

  // Mirror state/refs so the document listeners don't churn on every
  // distance tick. The listeners read `stateRef` / `pullRef` /
  // `onRefreshRef` and only call `setState` / `setPullDistance` when
  // the value actually changes.
  const stateRef = useRef<PullToRefreshState>("idle");
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setStateBoth = useCallback((next: PullToRefreshState) => {
    if (stateRef.current === next) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const setPullBoth = useCallback((next: number) => {
    if (pullRef.current === next) return;
    pullRef.current = next;
    setPullDistance(next);
  }, []);

  const resetIdle = useCallback(() => {
    startYRef.current = null;
    setPullBoth(0);
    setStateBoth("idle");
  }, [setPullBoth, setStateBoth]);

  useEffect(() => {
    if (!enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (stateRef.current === "refreshing") return;
      if (e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if (hasOpenModal()) return;
      if (hasOpenFloatingPanel()) return;
      if (isFormInteractive(e.target)) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      if (stateRef.current === "refreshing") return;
      const delta = e.touches[0].clientY - startYRef.current;
      // Upward drag — release the gesture so normal scrolling resumes.
      // Also covers the "user pulled down a bit, then up past start"
      // hand wobble.
      if (delta <= 0) {
        resetIdle();
        return;
      }
      // If anything scrolled the page below us mid-gesture (a fixed
      // child taking focus, e.g.), bail so we don't fight the scroll.
      if (window.scrollY > 0) {
        resetIdle();
        return;
      }
      const damped = Math.min(delta * RESISTANCE, MAX_PULL);
      setPullBoth(damped);
      setStateBoth(damped >= TRIGGER_DISTANCE ? "release" : "pulling");
      // Suppress the browser's native overscroll handling (Chrome
      // Android's URL-bar pull-to-refresh) while we own the gesture.
      // Only call once the gesture is armed — leaving every touchmove
      // passive when we're not pulling keeps page scroll smooth on
      // long touch sequences that pass through scrollY=0.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      const distance = pullRef.current;
      startYRef.current = null;
      if (distance >= TRIGGER_DISTANCE) {
        setStateBoth("refreshing");
        // Pin the indicator at the trigger position while the refresh
        // is in flight so it doesn't snap back before the user sees
        // the spinner.
        setPullBoth(TRIGGER_DISTANCE);
        unlock("freshPull");
        void Promise.resolve(onRefreshRef.current()).finally(() => {
          resetIdle();
        });
      } else {
        resetIdle();
      }
    };

    const onTouchCancel = () => {
      if (stateRef.current === "refreshing") return;
      resetIdle();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    // `touchmove` must NOT be passive — we call `preventDefault()` once
    // the pull is armed to suppress the browser's native overscroll.
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchCancel);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, resetIdle, setPullBoth, setStateBoth]);

  return { state, pullDistance };
}
