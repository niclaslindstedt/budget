import { createContext, useContext } from "react";

import type { InducedEntryMetadata } from "../../data/budget/company-type-hints";
import type {
  Category,
  Company,
  EntryType,
  Item,
  Settings,
} from "../../data/types";

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
  // Owned-item catalog (`UserData.items`), pre-indexed so a row's
  // `lineItems` resolve their `itemId` → item name without each row
  // re-scanning the array. Consumed by the description cell to render
  // the line-item pill / glyph and the popover's line-item list.
  itemsById: ReadonlyMap<string, Item>;
  // companyId → ranked hint typeIds (see `computeCompanyTypeHints`).
  // Consumed by the row's inline type cell to render its "Suggested"
  // band for the row's company.
  companyTypeHints: ReadonlyMap<string, readonly string[]>;
  // typeId → ranked hint companyIds (see `computeTypeCompanyHints`).
  // The inverse direction: consumed by the row's description popover so
  // picking a type first surfaces that type's most-used companies atop
  // the inline CompanyPicker.
  typeCompanyHints: ReadonlyMap<string, readonly string[]>;
  // normalised description → ranked companyIds (see
  // `computeDescriptionCompanyHints`). Consumed by the row's description
  // popover so a merchant the user has tagged with a company before
  // surfaces that company atop the inline CompanyPicker — before any
  // type is set. Merged ahead of `typeCompanyHints` into the band.
  descriptionCompanyHints: ReadonlyMap<string, readonly string[]>;
  // normalised description → the company / type EVERY tagged connection
  // for that description agrees on (see
  // `computeDescriptionMetadataInductions`). Consumed by `BudgetRow` to
  // surface dotted "suggestion" pills on untagged history rows and the
  // Done-column accept affordance that persists the induction.
  descriptionInductions: ReadonlyMap<string, InducedEntryMetadata>;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  settings: Settings;
  // The set of cover-transfer ids, so a synthesized cover-transfer row opens
  // the read-only info modal instead of the edit modal on tap. The per-row
  // covered / attributed markers (`Row.coverRole` / `Row.coverTransferId`)
  // are set on the synthesized rows themselves by `applyCoverRoles`.
  coverTransferIds: ReadonlySet<string>;
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
