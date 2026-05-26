import { useCallback, useEffect, useRef } from "react";
import type { FocusEvent } from "react";

// Returns an `onFocus` handler that selects all text on focus, gated
// on a process-wide "user has interacted" flag so iOS Safari's focus
// restoration on page reload — which targets the previously-focused
// element and would otherwise pop the keyboard with text pre-selected
// before the user has touched the page — does not trigger the select.
//
// Used by the cramped in-table `BudgetCell` editors where there isn't
// room for the inline X clear button that every other input carries.
//
// The setTimeout defers the `.select()` past iOS Safari's post-focus
// caret placement (which runs on the touchend that produced the
// focus), which would otherwise undo our selection.

let userInteracted = false;
let listenersInstalled = false;

function ensureListeners() {
  if (listenersInstalled || typeof document === "undefined") return;
  listenersInstalled = true;
  const mark = () => {
    userInteracted = true;
    document.removeEventListener("pointerdown", mark, true);
    document.removeEventListener("keydown", mark, true);
  };
  document.addEventListener("pointerdown", mark, true);
  document.addEventListener("keydown", mark, true);
}

export function useSelectAllOnFocus<
  E extends HTMLInputElement | HTMLTextAreaElement,
>(): (event: FocusEvent<E>) => void {
  const armedRef = useRef(false);
  useEffect(() => {
    ensureListeners();
    armedRef.current = true;
  }, []);

  return useCallback((event: FocusEvent<E>) => {
    if (!armedRef.current || !userInteracted) return;
    const el = event.currentTarget;
    setTimeout(() => {
      if (document.activeElement !== el) return;
      try {
        el.select();
      } catch {
        // Some input types reject select(); swallow defensively.
      }
    }, 0);
  }, []);
}
