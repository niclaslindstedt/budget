import { LOANS_GLYPH_NAMES } from "../constants/taxonomy";
import { newId } from "../sheet";
import type { LoansView } from "../types";
import { validateLoansView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Loans sheet renders the workspace-wide `UserData.loans` collection
// (the money the user owes, the payments made against each loan) rather
// than a per-account ledger, so the item carries no data of its own today —
// the shape exists so future per-sheet config (sort order, hide-paid-off
// toggle, …) lands here without another migration. Mirrors `savings.ts`.
export function createDefaultLoansView(): LoansView {
  return { id: newId(), type: "loansView" };
}

export const LOANS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "loans",
  label: "Loans",
  description: "Track your loans and what remains to pay off.",
  glyph: "hand-coins",
  glyphNames: LOANS_GLYPH_NAMES,
  createDefaultItem: () => createDefaultLoansView(),
  itemTypes: ["loansView"],
  validate: (raw, path) => validateLoansView(raw, path),
  // No `reduceItem`: the loans catalog is global state mutated by the
  // `addLoan` / `updateLoan` / `addLoanPayments` / … actions in
  // `reducers/loans.ts`, not per-item actions routed through the registry
  // tail. And no `rowsForItem`: the catalog isn't row-shaped.
};
