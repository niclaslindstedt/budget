import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// True when `ref`'s element sits within `marginPx` of the visual
// viewport along the vertical axis. Used to lazy-mount expensive
// subtrees (the per-month row table in a multi-year sheet) only when
// the user is close to them — the rest of the page renders a height-
// matched placeholder so scroll position stays stable.
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
  const marginRef = useRef(marginPx);
  marginRef.current = marginPx;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const m = marginRef.current;
    const inside =
      rect.bottom + m > 0 && rect.top - m < (window.innerHeight || 0);
    setNear(inside);
  }, [ref]);

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
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setNear(entry.isIntersecting);
        }
      },
      {
        rootMargin: `${marginPx}px 0px ${marginPx}px 0px`,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, marginPx]);

  return near;
}
