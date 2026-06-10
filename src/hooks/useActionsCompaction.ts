import { useEffect, useRef, useState, type RefObject } from "react";

// Desktop-only auto-collapse for a sheet table's trailing action column.
//
// On the desktop layout the per-row action strip (pen / trash / ⋯) is the
// rightmost table column. Once the browser narrows enough that the table
// can no longer fit, that column used to overflow the `overflow-clip`
// wrapper and vanish off the right edge — unreachable, because desktop has
// no row-swipe to pull it back (the mobile layout reveals the same strip
// from behind a left-swipe). This hook watches the wrapper and flips a
// `compact` flag the instant the table would overflow; the table then
// drops the inline pen / trash and the header label (CSS keyed on
// `.actions-compact` in utilities.css) and narrows the column to the lone
// ⋯ menu — which grows Edit / Delete entries so nothing is lost
// (see ActionsCompactContext + the per-sheet `*ActionsMenu` components).
//
// Gated on the desktop media query: mobile / landscape keeps its absolute
// swipe overlay, where the action cell never widens the row, so the
// overflow signal doesn't apply there.
const DESKTOP_QUERY = "(min-width: 721px) and (min-height: 501px)";

// Hysteresis band. The table's natural (expanded) width is captured the
// instant we collapse, and we only expand again once the wrapper has grown
// back past that width plus this margin — without the band the column
// would flip-flop on every sub-pixel resize right at the overflow edge.
const EXPAND_MARGIN_PX = 8;

// Sub-pixel / border-rounding noise to ignore so a 1px difference between
// scrollWidth and clientWidth doesn't read as a real overflow.
const OVERFLOW_EPSILON_PX = 1;

export function useActionsCompaction(
  wrapperRef: RefObject<HTMLElement | null>,
): boolean {
  const [compact, setCompact] = useState(false);
  // The wrapper's content width while expanded, captured at the moment we
  // collapse. Null while expanded; consulted only to decide when to
  // expand back.
  const expandedWidthRef = useRef<number | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || typeof ResizeObserver === "undefined" || !window.matchMedia) {
      return;
    }
    const desktop = window.matchMedia(DESKTOP_QUERY);

    const measure = () => {
      if (!desktop.matches) {
        // Mobile / landscape uses the swipe overlay; never compact there.
        expandedWidthRef.current = null;
        setCompact(false);
        return;
      }
      // Measure the table itself rather than the wrapper's scrollWidth:
      // the wrapper is `overflow: clip` (not a scroll container, so it
      // keeps the sticky header working), and a clip element's scrollWidth
      // is unreliable across browsers. A `w-full` table that can't shrink
      // below its min-content lays out wider than the wrapper instead, so
      // the table's rendered width exceeding the wrapper's available width
      // is the unambiguous overflow signal.
      const table = el.querySelector("table");
      if (!table) return;
      const tableWidth = table.scrollWidth;
      const available = el.clientWidth;
      setCompact((prev) => {
        if (!prev) {
          if (tableWidth - available > OVERFLOW_EPSILON_PX) {
            expandedWidthRef.current = tableWidth;
            return true;
          }
          return false;
        }
        // Already compact: expand only once the wrapper is wide enough to
        // seat the full-width strip again (the table's expanded width was
        // captured the instant we collapsed).
        const expanded = expandedWidthRef.current;
        if (expanded !== null && available >= expanded + EXPAND_MARGIN_PX) {
          expandedWidthRef.current = null;
          return false;
        }
        return true;
      });
    };

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    desktop.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      desktop.removeEventListener("change", measure);
    };
  }, [wrapperRef]);

  return compact;
}
