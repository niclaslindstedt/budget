import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const TAP_EVENTS = [
  "pointerdown",
  "mousedown",
  "touchstart",
  "click",
  "contextmenu",
] as const;

// Like `usePointerOutside`, but the hook ALSO swallows the dismissing
// tap (the outside pointerdown plus the trailing mousedown / click /
// contextmenu) so the element underneath never fires. Use this for
// picker shells living outside the sheet's active-row coordinator —
// modals and page-chrome floats — where the dismiss tap should only
// close the dropdown, never also focus / activate / submit whatever
// sits beneath it.
//
// Inside a sheet row, prefer plain `usePointerOutside`: there the
// outside-row swallow is owned by `ActiveRowProvider` via
// `useBlocksSheet`, and letting in-row taps reach the underlying cell
// is what makes cell-to-cell navigation feel snappy.
//
// Mirrors `ActiveRowProvider`'s swallow shape (capture-phase listeners,
// 150ms trailing-event latch) so dismissal behaves identically across
// surfaces. Listeners are installed once at mount and read live from
// refs so the trailing window survives the rerender that flips
// `enabled` to false on dismiss — otherwise the trailing click would
// arrive after the listeners had already been torn down and slip
// through to the underlying element.
export function useSwallowingPointerOutside(
  enabled: boolean,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
): void {
  const enabledRef = useRef(enabled);
  const refsRef = useRef(refs);
  const onDismissRef = useRef(onDismiss);
  enabledRef.current = enabled;
  refsRef.current = refs;
  onDismissRef.current = onDismiss;

  const trailingRef = useRef(false);
  const trailingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function armTrailing() {
      trailingRef.current = true;
      if (trailingTimerRef.current !== null) {
        window.clearTimeout(trailingTimerRef.current);
      }
      // 150ms is comfortably above the ~50-100ms a trailing click takes
      // to arrive after pointerdown on every browser we target, and
      // below the ~200ms a deliberate follow-up tap takes — so a stray
      // tap is intercepted but a fresh tap reliably gets through.
      trailingTimerRef.current = window.setTimeout(() => {
        trailingRef.current = false;
        trailingTimerRef.current = null;
      }, 150);
    }

    function isInside(target: EventTarget | null): boolean {
      if (!(target instanceof Node)) return false;
      for (const ref of refsRef.current) {
        if (ref.current?.contains(target)) return true;
      }
      return false;
    }

    function swallow(e: Event) {
      e.stopPropagation();
      (
        e as Event & { stopImmediatePropagation?: () => void }
      ).stopImmediatePropagation?.();
      // preventDefault on mousedown blocks the browser's focus shift to
      // the tapped element — without it, tapping another input in the
      // same modal would still pull focus there (popping the keyboard
      // on mobile) even though we swallowed the click. We deliberately
      // do NOT preventDefault on touchstart/pointerdown: those would
      // also block page scrolling.
      if (
        e.type === "click" ||
        e.type === "contextmenu" ||
        e.type === "mousedown"
      ) {
        e.preventDefault();
      }
    }

    function handler(e: Event) {
      if (!enabledRef.current && !trailingRef.current) return;
      if (isInside(e.target)) return;
      if (
        enabledRef.current &&
        (e.type === "pointerdown" || e.type === "touchstart")
      ) {
        onDismissRef.current();
        swallow(e);
        armTrailing();
        return;
      }
      if (trailingRef.current) {
        swallow(e);
        if (e.type === "click") {
          trailingRef.current = false;
          if (trailingTimerRef.current !== null) {
            window.clearTimeout(trailingTimerRef.current);
            trailingTimerRef.current = null;
          }
        }
      }
    }

    for (const type of TAP_EVENTS) {
      document.addEventListener(type, handler, true);
    }
    return () => {
      for (const type of TAP_EVENTS) {
        document.removeEventListener(type, handler, true);
      }
      if (trailingTimerRef.current !== null) {
        window.clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
    };
  }, []);
}
