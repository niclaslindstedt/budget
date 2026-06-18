import { useCallback, useEffect, useRef, useState } from "react";

// Roving tabindex for a flat 1D list of focusable elements (the
// listbox / radiogroup / menubar pattern from the WAI-ARIA APG).
//
// The caller wires `tabIndex={isCursorAt(i) ? 0 : -1}` on each item,
// attaches `registerItem(i)` as a ref callback, and forwards
// `onKeyDown` to each item. The hook moves focus on ArrowUp /
// ArrowDown / Home / End (and wraps at the ends) and bumps focus to
// the initial item whenever `active` flips on so the very first key
// press lands on something sensible. For 2D grids, see
// `useGridRovingTabindex` below.
//
// `active` should toggle when the surface containing the list is
// open / mounted / focusable — when it flips from false to true we
// snap the cursor back to `initialIndex` (the currently selected
// option, typically). When `active` is false the hook is dormant —
// no focus is forced.
export function useRovingTabindex(opts: {
  itemCount: number;
  initialIndex: number;
  active: boolean;
  orientation?: "vertical" | "horizontal";
  // When true, the cursor wraps past the ends; otherwise it clamps.
  wrap?: boolean;
  // When true, the hook calls `.focus()` on the active item after
  // every cursor change (the listbox / menu pattern). Set to false
  // for radiogroups where Tab takes you in / out and arrow keys only
  // move the visual selection.
  focusOnMove?: boolean;
}): {
  cursor: number;
  isCursorAt: (i: number) => boolean;
  registerItem: (i: number) => (el: HTMLElement | null) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  focusCursor: () => void;
  // Move the cursor (and focus, when `focusOnMove`) to an arbitrary
  // index — the entry point type-ahead uses to jump to a matched row
  // without going through the arrow keys.
  moveCursorTo: (i: number) => void;
} {
  const {
    itemCount,
    initialIndex,
    active,
    orientation = "vertical",
    wrap = true,
    focusOnMove = true,
  } = opts;
  const [cursor, setCursor] = useState(initialIndex);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);

  // Re-seat the cursor on the initial index every time the surface
  // becomes active. Also move focus there on the next frame so the
  // ref has been written (the callback fires during commit, but the
  // item may not have rendered yet on the first open).
  useEffect(() => {
    if (!active) return;
    const idx = Math.max(0, Math.min(initialIndex, itemCount - 1));
    setCursor(idx);
    if (!focusOnMove) return;
    const raf = requestAnimationFrame(() => {
      itemsRef.current[idx]?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active, initialIndex, itemCount, focusOnMove]);

  const registerItem = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      itemsRef.current[i] = el;
    },
    [],
  );

  const moveTo = useCallback(
    (next: number) => {
      if (itemCount === 0) return;
      const bounded = wrap
        ? (next + itemCount) % itemCount
        : Math.max(0, Math.min(itemCount - 1, next));
      setCursor(bounded);
      if (focusOnMove) itemsRef.current[bounded]?.focus();
    },
    [itemCount, wrap, focusOnMove],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      const prev = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      if (e.key === next) {
        e.preventDefault();
        moveTo(cursor + 1);
      } else if (e.key === prev) {
        e.preventDefault();
        moveTo(cursor - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        moveTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        moveTo(itemCount - 1);
      }
    },
    [cursor, itemCount, moveTo, orientation],
  );

  const focusCursor = useCallback(() => {
    itemsRef.current[cursor]?.focus();
  }, [cursor]);

  const isCursorAt = useCallback((i: number) => i === cursor, [cursor]);

  return {
    cursor,
    isCursorAt,
    registerItem,
    onKeyDown,
    focusCursor,
    moveCursorTo: moveTo,
  };
}

// 2D variant for grid pickers (ColorPalette, GlyphGrid). The list is
// laid out in `columns` columns reading left-to-right, top-to-bottom;
// ArrowLeft / ArrowRight walk the row, ArrowUp / ArrowDown jump a
// row, Home / End jump to the first / last cell.
export function useGridRovingTabindex(opts: {
  itemCount: number;
  columns: number;
  initialIndex: number;
  active: boolean;
  wrap?: boolean;
}): {
  cursor: number;
  isCursorAt: (i: number) => boolean;
  registerItem: (i: number) => (el: HTMLElement | null) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
} {
  const { itemCount, columns, initialIndex, active, wrap = true } = opts;
  const [cursor, setCursor] = useState(initialIndex);
  const itemsRef = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    if (!active) return;
    const idx = Math.max(0, Math.min(initialIndex, itemCount - 1));
    setCursor(idx);
    const raf = requestAnimationFrame(() => {
      itemsRef.current[idx]?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active, initialIndex, itemCount]);

  const registerItem = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      itemsRef.current[i] = el;
    },
    [],
  );

  const moveTo = useCallback(
    (next: number) => {
      if (itemCount === 0) return;
      const bounded = wrap
        ? (next + itemCount) % itemCount
        : Math.max(0, Math.min(itemCount - 1, next));
      setCursor(bounded);
      itemsRef.current[bounded]?.focus();
    },
    [itemCount, wrap],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveTo(cursor + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveTo(cursor - 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveTo(cursor + columns);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveTo(cursor - columns);
      } else if (e.key === "Home") {
        e.preventDefault();
        moveTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        moveTo(itemCount - 1);
      }
    },
    [cursor, columns, itemCount, moveTo],
  );

  const isCursorAt = useCallback((i: number) => i === cursor, [cursor]);

  return { cursor, isCursorAt, registerItem, onKeyDown };
}
