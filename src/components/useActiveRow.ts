import { createContext, useContext } from "react";

// Coordinator handle exposed to consumers inside a SheetView's
// ActiveRowProvider. `useActiveRow` returns null outside a provider
// so the same components (CategoryPicker, …) keep working when reused
// inside modals where the coordinator is not relevant.

export type ActiveRowContextValue = {
  activate: (rowId: string, dismiss: () => void) => number;
  deactivate: (token: number) => void;
};

export const ActiveRowContext = createContext<ActiveRowContextValue | null>(
  null,
);

export function useActiveRow(): ActiveRowContextValue | null {
  return useContext(ActiveRowContext);
}
