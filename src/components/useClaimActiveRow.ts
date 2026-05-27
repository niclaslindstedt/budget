import { useLayoutEffect, useRef } from "react";

import { useActiveRowCoordinator } from "./useActiveRow";

// Claim the active-row slot from `ActiveRowProvider` whenever `active`
// is true, and release it when it flips false. The `dismiss` callback
// fires when a tap outside the row forces the coordinator to clear the
// claim so the caller can close itself in lockstep (blur an input,
// close a popover, retract a swipe).
//
// **Every interactive element that opens inside a page row (budget,
// accounts, future page types) must call this hook** — cell inputs,
// popovers, pickers, swipe handles, all of them. Without it the
// BudgetAddEntryButton won't grey itself out while you're editing, and a stray
// tap on it (or on another row's button) will fire its action instead
// of just dismissing yours. Forgetting this hook is the canonical
// cause of the "tap got eaten / tap added a stray row" family of bugs;
// if a new interactive element shows up in any page row, this hook is
// what wires it into the coordinator.
//
// Design notes:
//
// - `dismiss` and the context value are captured by ref so the
//   registration is taken down and torn up exactly once per
//   open/close cycle. Naive deps that include the context value
//   cause a deactivate/activate ping-pong every time `hasActive`
//   flips, because the provider's `useMemo` returns a new object on
//   every state change — the ping-pong is brief but coincides
//   exactly with the user's tap.
// - Registration runs in a layout effect so it lands before paint;
//   if it ran in `useEffect`, the popover/picker would be on screen
//   for a paint cycle before the BudgetAddEntryButton learned about it, and
//   a tap during that gap would slip through.
// - Callers pass plain inline arrow functions; no memoisation
//   needed.
export function useClaimActiveRow(
  rowId: string | undefined,
  active: boolean,
  dismiss: () => void,
): void {
  const coordinator = useActiveRowCoordinator();
  const dismissRef = useRef(dismiss);
  const activeRowRef = useRef(coordinator);
  dismissRef.current = dismiss;
  activeRowRef.current = coordinator;

  useLayoutEffect(() => {
    if (!active || !rowId) return;
    const coordinator = activeRowRef.current;
    if (!coordinator) return;
    const token = coordinator.activate(rowId, () => dismissRef.current());
    return () => coordinator.deactivate(token);
  }, [active, rowId]);
}
