import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ActiveRowCoordinatorContext,
  ActiveRowHasActiveContext,
} from "./useActiveRow";

// Coordinator that makes the currently-active sheet row behave like a
// lightweight modal: while any cell is being edited, a picker is open,
// or the row is swiped to reveal its action buttons, the rest of the
// sheet is inert. The first click outside the active row only dismisses
// the active state — it does not also fire whatever was clicked.
//
// Listeners are installed once at mount and read live from the
// registration ref. Earlier versions gated installation on a state
// flag, which left a render-cycle window where the second tap (e.g.
// BudgetAddEntryButton) could slip through before the effect re-ran.

type Registration = {
  token: number;
  rowId: string;
  dismiss: () => void;
};

const SWALLOWED_EVENTS = [
  "pointerdown",
  "mousedown",
  "touchstart",
  "click",
  "contextmenu",
] as const;

export function ActiveRowProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef<Registration[]>([]);
  const nextTokenRef = useRef(1);
  const [hasActive, setHasActive] = useState(false);
  // A tap that dismisses an active row produces a sequence
  // (pointerdown → pointerup → mousedown → click). We swallow the
  // pointerdown above, but by the time the trailing mousedown/click
  // arrives the registrations are already empty, so the handler would
  // otherwise let them through and the click would fire on whatever
  // button the tap landed on (e.g. BudgetAddEntryButton). Latching this flag
  // keeps the rest of the sequence suppressed until it clears itself.
  const dismissTrailingRef = useRef(false);
  const dismissTrailingTimerRef = useRef<number | null>(null);

  const armDismissTrailing = useCallback(() => {
    dismissTrailingRef.current = true;
    if (dismissTrailingTimerRef.current !== null) {
      window.clearTimeout(dismissTrailingTimerRef.current);
    }
    // 150ms is comfortably above the ~50-100ms a trailing click takes
    // to arrive after pointerdown on every browser we target, and below
    // the ~200ms it takes a user to deliberately tap again. So a stray
    // tap is intercepted, but a follow-up tap reliably gets through.
    dismissTrailingTimerRef.current = window.setTimeout(() => {
      dismissTrailingRef.current = false;
      dismissTrailingTimerRef.current = null;
    }, 150);
  }, []);

  const dismissAll = useCallback(() => {
    const entries = registrationsRef.current;
    if (entries.length === 0) return;
    registrationsRef.current = [];
    setHasActive(false);
    armDismissTrailing();
    for (const entry of entries) {
      try {
        entry.dismiss();
      } catch {
        // Ignore dismissers that throw — the next click will retry.
      }
    }
  }, [armDismissTrailing]);

  const activate = useCallback(
    (rowId: string, dismiss: () => void) => {
      // A different row claiming focus implicitly dismisses the previous
      // row's active state, matching the "one row at a time" contract.
      const current = registrationsRef.current;
      if (current.length > 0 && current[0].rowId !== rowId) {
        dismissAll();
      }
      const token = nextTokenRef.current++;
      registrationsRef.current.push({ token, rowId, dismiss });
      setHasActive(true);
      return token;
    },
    [dismissAll],
  );

  const deactivate = useCallback((token: number) => {
    registrationsRef.current = registrationsRef.current.filter(
      (r) => r.token !== token,
    );
    if (registrationsRef.current.length === 0) setHasActive(false);
  }, []);

  useEffect(() => {
    function isInsideActiveRegion(
      target: EventTarget | null,
      activeRow: HTMLElement | null,
    ): boolean {
      if (!(target instanceof Node)) return false;
      if (activeRow?.contains(target)) return true;
      if (target instanceof Element) {
        // Portals (category dropdown, description popover) render under
        // document.body, so they need an explicit opt-in marker.
        if (target.closest("[data-active-portal]")) return true;
      }
      return false;
    }

    function swallow(e: Event) {
      e.stopPropagation();
      (
        e as Event & { stopImmediatePropagation?: () => void }
      ).stopImmediatePropagation?.();
      if (
        e.type === "click" ||
        e.type === "contextmenu" ||
        e.type === "mousedown"
      ) {
        e.preventDefault();
      }
    }

    function handler(e: Event) {
      // Resolve the active row on every event rather than capturing it
      // when the effect ran. The registration ref is the source of
      // truth; the DOM lookup is cheap and avoids stale node refs when
      // React rerenders the row.
      const top = registrationsRef.current.at(-1);
      if (!top) {
        // The dismissing pointerdown has already cleared registrations,
        // but the same tap still has trailing mousedown/click events on
        // the way. Swallow them so the button under the finger doesn't
        // also fire.
        if (
          dismissTrailingRef.current &&
          (e.type === "click" ||
            e.type === "contextmenu" ||
            e.type === "mousedown")
        ) {
          swallow(e);
          if (e.type === "click") {
            dismissTrailingRef.current = false;
            if (dismissTrailingTimerRef.current !== null) {
              window.clearTimeout(dismissTrailingTimerRef.current);
              dismissTrailingTimerRef.current = null;
            }
          }
        }
        return;
      }
      const activeRow = document.querySelector<HTMLElement>(
        `[data-row-id="${CSS.escape(top.rowId)}"]`,
      );
      const sheetRoot = activeRow?.closest<HTMLElement>("[data-sheet-content]");
      const target = e.target as Element | null;
      if (isInsideActiveRegion(target, activeRow ?? null)) return;
      // Clicks outside the sheet (header buttons, sheet tabs, modals)
      // still dismiss but are allowed to perform their own action — the
      // "block other buttons" rule is scoped to the sheet itself.
      if (!sheetRoot || !target || !sheetRoot.contains(target)) {
        if (
          e.type === "pointerdown" ||
          e.type === "touchstart" ||
          e.type === "mousedown"
        ) {
          dismissAll();
        }
        return;
      }
      // Inside the sheet but outside the active row → block the React
      // tree from seeing the event. stopImmediatePropagation at document
      // capture phase prevents any later listener (including React's at
      // the root) from running, so the BudgetAddEntryButton's onPointerDown
      // long-press timer never starts and other buttons' onClick never
      // fires. preventDefault on mousedown blocks the browser's focus
      // shift to the tapped element — without it, tapping another row's
      // input would still pull focus there (popping the keyboard on
      // mobile) even though we swallowed the click. We deliberately do
      // NOT preventDefault on touchstart/pointerdown: those would also
      // block page scrolling while a field is focused.
      swallow(e);
      if (
        e.type === "pointerdown" ||
        e.type === "mousedown" ||
        e.type === "touchstart"
      ) {
        dismissAll();
      }
    }

    for (const type of SWALLOWED_EVENTS) {
      document.addEventListener(type, handler, true);
    }
    return () => {
      for (const type of SWALLOWED_EVENTS) {
        document.removeEventListener(type, handler, true);
      }
      if (dismissTrailingTimerRef.current !== null) {
        window.clearTimeout(dismissTrailingTimerRef.current);
        dismissTrailingTimerRef.current = null;
      }
    };
  }, [dismissAll]);

  // The coordinator handle is reference-stable across renders: `activate`
  // and `deactivate` are useCallback-memoized, so subscribers that only
  // need to register a row don't re-render when `hasActive` flips. Only
  // the BudgetAddEntryButton subscribes to `hasActive` and pays for its updates.
  const coordinator = useMemo(
    () => ({ activate, deactivate }),
    [activate, deactivate],
  );

  return (
    <ActiveRowCoordinatorContext.Provider value={coordinator}>
      <ActiveRowHasActiveContext.Provider value={hasActive}>
        {children}
      </ActiveRowHasActiveContext.Provider>
    </ActiveRowCoordinatorContext.Provider>
  );
}
