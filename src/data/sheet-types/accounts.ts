import { newId } from "../sheet";
import type { AccountsView } from "../types";
import { validateAccountsView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Accounts sheet renders a workspace-wide dashboard rather than a
// per-account ledger, so the item carries no data of its own today —
// the shape exists so future per-sheet config (account filter, sort
// order, …) lands here without another migration.
export function createDefaultAccountsView(): AccountsView {
  return { id: newId(), type: "accountsView" };
}

export const ACCOUNTS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "accounts",
  label: "Accounts",
  description: "Manage accounts and transfers between them.",
  glyph: "piggy-bank",
  createDefaultItem: () => createDefaultAccountsView(),
  itemTypes: ["accountsView"],
  validate: (raw, path) => validateAccountsView(raw, path),
  // No `reduceItem` / `rowsForItem`: AccountsView is a data-light
  // singleton that renders the global account list.
};
