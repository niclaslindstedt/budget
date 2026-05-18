import { useEffect } from "react";

// Calls `onEscape` when the user presses Escape, but only while
// `enabled` is true. Used by modals and pickers that close on Escape;
// the `enabled` gate lets the call site mirror its own `open` state
// without the listener firing on stray key presses while closed.
export function useEscapeKey(enabled: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!enabled) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [enabled, onEscape]);
}
