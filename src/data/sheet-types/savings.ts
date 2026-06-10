import { SAVINGS_GLYPH_NAMES } from "../constants/taxonomy";
import { newId } from "../sheet";
import type { SavingsView } from "../types";
import { validateSavingsView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Savings sheet renders the workspace-wide `UserData.savings` collection
// (savings accounts and their balance over time) rather than a per-account
// ledger, so the item carries no data of its own today — the shape exists so
// future per-sheet config (sort order, hide-empty toggle, …) lands here
// without another migration. Mirrors `properties.ts`.
export function createDefaultSavingsView(): SavingsView {
  return { id: newId(), type: "savingsView" };
}

export const SAVINGS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "savings",
  label: "Savings",
  description: "Track money you set aside in savings accounts.",
  glyph: "coins",
  glyphNames: SAVINGS_GLYPH_NAMES,
  createDefaultItem: () => createDefaultSavingsView(),
  itemTypes: ["savingsView"],
  validate: (raw, path) => validateSavingsView(raw, path),
  // No `reduceItem`: the savings catalog is global state mutated by the
  // `createSaving` / `updateSaving` / `addSavingBalance` / … actions in
  // `reducers/savings.ts`, not per-item actions routed through the registry
  // tail. And no `rowsForItem`: the catalog isn't row-shaped.
};
