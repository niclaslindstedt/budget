import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

// Extra distance the element must travel *past* the mount margin before
// the subtree unmounts again. Without this gap the mount margin doubles
// as the unmount margin, so a section sitting right on the boundary can
// re-cross it on its own: mounting (or unmounting) the rows shifts the
// layout by a row or two, the observer re-fires, and the subtree toggles
// back — a self-sustaining flicker at the mount edge (most visible on
// WebKit, which has no scroll anchoring to damp the nudge). The dead
// zone between "mount when within `marginPx`" and "unmount only when
// past `marginPx + HYSTERESIS_PX`" swallows that nudge so the toggle
// can't feed itself.
const HYSTERESIS_PX = 1000;

// True when `ref`'s element sits within `marginPx` of the visual
// viewport along the vertical axis. Used to lazy-mount expensive
// subtrees (the per-month row table in a multi-year sheet) only when
// the user is close to them — the rest of the page renders a height-
// matched placeholder so scroll position stays stable.
//
// The mount/unmount thresholds are asymmetric (see `HYSTERESIS_PX`):
// the subtree mounts as soon as it enters the `marginPx` band but stays
// mounted until it leaves a wider `marginPx + HYSTERESIS_PX` band. The
// dead zone in between is what stops a section parked on the boundary
// from flickering as the mount swap nudges the layout across the line.
//
// Reads the initial intersection synchronously in a layout effect so
// the first paint after mount already shows the right state for the
// currently-visible months; without it every month would flash a
// placeholder for one frame before the IntersectionObserver fired.
export function useNearViewport(
  ref: RefObject<HTMLElement | null>,
  marginPx: number,
): boolean {
  const [near, setNear] = useState(false);
  const unmountMargin = marginPx + HYSTERESIS_PX;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const inside =
      rect.bottom + marginPx > 0 &&
      rect.top - marginPx < (window.innerHeight || 0);
    setNear(inside);
  }, [ref, marginPx]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined"
    ) {
      // No observer support — keep `near` true so the subtree always
      // renders rather than getting stuck as a placeholder.
      setNear(true);
      return;
    }
    // Two observers form the hysteresis band. The inner one (narrow
    // `marginPx`) only ever flips `near` true — it fires the instant the
    // section enters the mount band. The outer one (wider
    // `unmountMargin`) only ever flips `near` false — it fires once the
    // section has fully left the wider band. Between the two boundaries
    // neither observer acts, so `near` holds its last value and a
    // boundary nudge can't toggle the subtree.
    const mountObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setNear(true);
        }
      },
      { rootMargin: `${marginPx}px 0px ${marginPx}px 0px` },
    );
    const unmountObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) setNear(false);
        }
      },
      { rootMargin: `${unmountMargin}px 0px ${unmountMargin}px 0px` },
    );
    mountObserver.observe(el);
    unmountObserver.observe(el);
    return () => {
      mountObserver.disconnect();
      unmountObserver.disconnect();
    };
  }, [ref, marginPx, unmountMargin]);

  return near;
}
