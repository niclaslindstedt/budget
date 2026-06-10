import { createContext, useContext } from "react";

// True when the active sheet table has collapsed its trailing action
// column to the compact (⋯-only) layout — see `useActionsCompaction`.
// The per-sheet "⋯" action menus (`BudgetEntryActionsMenu`,
// `AccountActionsMenu`, …) read this to grow Edit / Delete entries that,
// in the wide layout, live as the inline pen / trash buttons in the swipe
// strip. Defaults to false (wide layout) so a menu rendered outside any
// provider behaves exactly as before.
export const ActionsCompactContext = createContext(false);

export function useActionsCompact(): boolean {
  return useContext(ActionsCompactContext);
}
