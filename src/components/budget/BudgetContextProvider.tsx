import type { ReactNode } from "react";

import { BudgetContext, type BudgetContextValue } from "./BudgetContext";

export function BudgetContextProvider({
  value,
  children,
}: {
  value: BudgetContextValue;
  children: ReactNode;
}) {
  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  );
}
