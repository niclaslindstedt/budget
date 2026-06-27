import { useCallback, useEffect, useRef, useState } from "react";

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
//
// The live buffer is also published as `query` (reactive state) so the
// caller can highlight the matched characters on the active option, and
// the reset is timer-driven so the highlight disappears on its own after
// the pause — the user sees the search "start over" without pressing a
// key. Use `reset()` to drop the buffer eagerly (e.g. when arrow
// navigation takes over or the surface closes) so a stale highlight
// never lingers.
export function useTypeahead(opts: {
  labels: readonly string[];
  onMatch: (index: number) => void;
  // Milliseconds of silence after which the buffer resets. The user
  // brief: waiting longer than this between keystrokes "starts over".
  timeoutMs?: number;
}): {
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  // The current search buffer, or "" while idle. Feed it to
  // `HighlightedLabel` on the matched option to emphasise the match.
  query: string;
  // Drop the buffer (and its highlight) immediately.
  reset: () => void;
} {
  const { labels, onMatch, timeoutMs = 3000 } = opts;
  const bufferRef = useRef("");
  const lastAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [query, setQuery] = useState("");

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    bufferRef.current = "";
    setQuery("");
  }, [clearTimer]);

  // Tear down any pending reset timer on unmount.
  useEffect(() => clearTimer, [clearTimer]);

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

      // Publish the buffer so the active option can highlight the match,
      // and (re)arm the silence timer — the same pause that "starts the
      // search over" also clears the highlight, with no extra keypress.
      setQuery(next);
      clearTimer();
      timerRef.current = setTimeout(reset, timeoutMs);

      if (idx !== -1) {
        e.preventDefault();
        onMatch(idx);
      }
    },
    [labels, onMatch, timeoutMs, clearTimer, reset],
  );

  return { onKeyDown, query, reset };
}
