import { createContext, useContext } from "react";

// Coordinator handle exposed to consumers inside a BudgetPage's
// ActiveRowProvider. `useActiveRowCoordinator` returns null outside a
// provider so the same components (CategoryPicker, …) keep working
// when reused inside modals where the coordinator is not relevant.
//
// The coordinator is split from the `hasActive` state so the thousands
// of components below a BudgetPage that only need to *register* a row
// (cell inputs, popovers, pickers, swipe handles) subscribe to a
// reference-stable context — when a cell flips active, only the one
// consumer that watches `hasActive` (the `+ Add row` footer button)
// re-renders, instead of the entire row tree below the provider.

export type ActiveRowCoordinator = {
  activate: (rowId: string, dismiss: () => void) => number;
  deactivate: (token: number) => void;
};

export const ActiveRowCoordinatorContext =
  createContext<ActiveRowCoordinator | null>(null);

// Separate context for the single boolean — splitting it from the
// coordinator means components that only call `activate`/`deactivate`
// don't re-render every time `hasActive` flips. BudgetAddEntryButton is the
// only consumer.
export const ActiveRowHasActiveContext = createContext<boolean>(false);

export function useActiveRowCoordinator(): ActiveRowCoordinator | null {
  return useContext(ActiveRowCoordinatorContext);
}

export function useActiveRowHasActive(): boolean {
  return useContext(ActiveRowHasActiveContext);
}
