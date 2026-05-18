import { useEffect, useRef } from "react";

import { useActiveRow } from "./useActiveRow";

// Register the calling component as the sheet's active row whenever
// `active` is true, and tear down again when it flips false. The
// `dismiss` callback fires when a tap outside the row forces the
// ActiveRowProvider to clear the registration so the caller can close
// itself in lockstep (blur an input, close a popover, retract a swipe).
//
// **Every interactive element that opens inside a sheet row must call
// this hook** — cell inputs, popovers, pickers, swipe handles, all of
// them. Without it the AddRowButton won't grey itself out while you're
// editing, and a stray tap on it (or on another row's button) will
// fire its action instead of just dismissing yours. Forgetting this
// hook is the canonical cause of the "tap got eaten / tap added a
// stray row" family of bugs; if a new interactive element shows up in
// the sheet, this hook is what wires it into the coordinator.
//
// `dismiss` is captured by ref so callers don't need to memoise it —
// inline arrow functions are fine. `rowId` may be `undefined` (the
// FloatingPanel reuses the same shell for non-sheet contexts where
// there's no row to register against); in that case the hook is a
// no-op.
export function useBlocksSheet(
  rowId: string | undefined,
  active: boolean,
  dismiss: () => void,
): void {
  const activeRow = useActiveRow();
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  });
  useEffect(() => {
    if (!active || !activeRow || !rowId) return;
    const token = activeRow.activate(rowId, () => dismissRef.current());
    return () => activeRow.deactivate(token);
  }, [active, activeRow, rowId]);
}
