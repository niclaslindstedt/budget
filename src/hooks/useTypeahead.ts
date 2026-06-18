import { useCallback, useRef } from "react";

// List-box type-ahead: as the user types printable characters, jump to
// the first option whose label starts with the accumulated buffer. The
// buffer accumulates while keystrokes stay close together and resets
// after `timeoutMs` of silence, so "apo" typed quickly lands on
// "Apoteket", but pausing and typing "kr" starts a fresh search that
// lands on "Kronans Apotek". Matching is case-insensitive and ignores
// surrounding whitespace.
//
// Wire `onKeyDown` onto the same elements the roving-tabindex cursor is
// attached to; on a match the hook calls `onMatch(index)` so the caller
// can move the cursor / focus there. Modifier combos (Ctrl / Meta / Alt)
// and non-printable keys are left untouched so arrow / Enter / Escape
// navigation keeps working.
export function useTypeahead(opts: {
  labels: readonly string[];
  onMatch: (index: number) => void;
  // Milliseconds of silence after which the buffer resets. The user
  // brief: waiting longer than this between keystrokes "starts over".
  timeoutMs?: number;
}): {
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
} {
  const { labels, onMatch, timeoutMs = 3000 } = opts;
  const bufferRef = useRef("");
  const lastAtRef = useRef(0);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Only printable single characters extend the search; everything
      // else (arrows, Enter, Tab, Backspace, …) falls through to the
      // caller's own handlers.
      if (e.key.length !== 1) return;
      const now = Date.now();
      if (now - lastAtRef.current > timeoutMs) bufferRef.current = "";
      lastAtRef.current = now;

      const next = (bufferRef.current + e.key).toLowerCase();
      // A lone leading space would match nothing useful and steals the
      // keypress — ignore it until there's a real prefix to extend.
      if (next.trim().length === 0) return;
      bufferRef.current = next;

      const idx = labels.findIndex((label) =>
        label.trim().toLowerCase().startsWith(next),
      );
      if (idx !== -1) {
        e.preventDefault();
        onMatch(idx);
      }
    },
    [labels, onMatch, timeoutMs],
  );

  return { onKeyDown };
}
