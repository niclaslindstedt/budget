import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ActiveRowContext } from "./useActiveRow";

// Coordinator that makes the currently-active sheet row behave like a
// lightweight modal: while any cell is being edited, a picker is open,
// or the row is swiped to reveal its action buttons, the rest of the
// sheet is inert. The first click outside the active row only dismisses
// the active state — it does not also fire whatever was clicked.

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
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const updateActiveRowId = useCallback(() => {
    const next = registrationsRef.current.at(-1)?.rowId ?? null;
    setActiveRowId((prev) => (prev === next ? prev : next));
  }, []);

  const dismissAll = useCallback(() => {
    const entries = registrationsRef.current;
    registrationsRef.current = [];
    setActiveRowId(null);
    for (const entry of entries) {
      try {
        entry.dismiss();
      } catch {
        // Ignore dismissers that throw — the next click will retry.
      }
    }
  }, []);

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
      updateActiveRowId();
      return token;
    },
    [dismissAll, updateActiveRowId],
  );

  const deactivate = useCallback(
    (token: number) => {
      const before = registrationsRef.current.length;
      registrationsRef.current = registrationsRef.current.filter(
        (r) => r.token !== token,
      );
      if (registrationsRef.current.length !== before) updateActiveRowId();
    },
    [updateActiveRowId],
  );

  useEffect(() => {
    if (activeRowId === null) return;
    const activeRow = document.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(activeRowId)}"]`,
    );
    const sheetRoot = activeRow?.closest<HTMLElement>("[data-sheet-content]");

    function isInsideActiveRegion(target: EventTarget | null): boolean {
      if (!(target instanceof Node)) return false;
      if (activeRow?.contains(target)) return true;
      if (target instanceof Element) {
        // Portals (category dropdown, description popover) render under
        // document.body, so they need an explicit opt-in marker.
        if (target.closest("[data-active-portal]")) return true;
      }
      return false;
    }

    function handler(e: Event) {
      const target = e.target as Element | null;
      if (isInsideActiveRegion(target)) return;
      // Clicks outside the sheet (header buttons, sheet tabs, modals)
      // still dismiss but are allowed to perform their own action — the
      // "block other buttons" rule is scoped to the sheet itself.
      if (!sheetRoot || !target || !sheetRoot.contains(target)) {
        if (e.type === "pointerdown" || e.type === "touchstart") {
          dismissAll();
        }
        return;
      }
      // Inside the sheet but outside the active row → block the React
      // tree from seeing the event. stopImmediatePropagation at document
      // capture phase prevents any later listener (including React's at
      // the root) from running, so the AddRowButton's onPointerDown
      // long-press timer never starts and other buttons' onClick never
      // fires.
      e.stopPropagation();
      (
        e as Event & { stopImmediatePropagation?: () => void }
      ).stopImmediatePropagation?.();
      // preventDefault only on click-like events. Preventing default on
      // touchstart/pointerdown would also block page scrolling on
      // mobile while a field is focused, so we leave those untouched —
      // the natural focus shift handles input blur, and the swallowed
      // click ensures buttons stay inert.
      if (e.type === "click" || e.type === "contextmenu") {
        e.preventDefault();
      }
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
    };
  }, [activeRowId, dismissAll]);

  const value = useMemo(
    () => ({ activate, deactivate }),
    [activate, deactivate],
  );

  return (
    <ActiveRowContext.Provider value={value}>
      {children}
    </ActiveRowContext.Provider>
  );
}
