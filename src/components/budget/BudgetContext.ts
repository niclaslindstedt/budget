import { createContext, useContext } from "react";

import type { Category, Company, EntryType, Settings } from "../../data/types";

// Cross-cutting taxonomy + settings used by every node in the
// budget-page subtree (BudgetMonthTable → BudgetRow → BudgetCell, plus the
// in-cell pickers that need to mint new entry types / categories /
// companies inline). Threading these through props was a 50-prop hop
// per component; consuming them through context lets each leaf reach
// for what it needs without dragging the rest of the surface.
//
// The pre-indexed `*ById` maps live alongside their array form so the
// row tree can do O(1) lookups without each row materialising its own
// map — the array form is still needed by the descendant pickers,
// which render the ordered list.
//
// Lives in `.ts` (no JSX) so the matching `BudgetContextProvider.tsx`
// keeps a clean Fast Refresh boundary — exporting a hook alongside a
// component would trip `react-refresh/only-export-components`.
export type BudgetContextValue = {
  types: readonly EntryType[];
  typesById: ReadonlyMap<string, EntryType>;
  categories: readonly Category[];
  companies: readonly Company[];
  companiesById: ReadonlyMap<string, Company>;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  settings: Settings;
};

export const BudgetContext = createContext<BudgetContextValue | null>(null);

export function useBudgetContext(): BudgetContextValue {
  const v = useContext(BudgetContext);
  if (v === null) {
    throw new Error(
      "useBudgetContext: missing <BudgetContextProvider>. This hook is only callable from inside the budget-page subtree.",
    );
  }
  return v;
}
