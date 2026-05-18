import { createContext, useContext } from "react";

// Coordinator handle exposed to consumers inside a SheetView's
// ActiveRowProvider. `useActiveRow` returns null outside a provider
// so the same components (CategoryPicker, …) keep working when reused
// inside modals where the coordinator is not relevant.

export type ActiveRowContextValue = {
  activate: (rowId: string, dismiss: () => void) => number;
  deactivate: (token: number) => void;
  // True while any row in this sheet is in its active state (swiped to
  // reveal action buttons, mid-edit, etc.). Consumers like the
  // "add row" button use this to disable themselves so a misplaced tap
  // next to the action buttons does not also add a new row.
  hasActive: boolean;
};

export const ActiveRowContext = createContext<ActiveRowContextValue | null>(
  null,
);

export function useActiveRow(): ActiveRowContextValue | null {
  return useContext(ActiveRowContext);
}
