import { newId } from "../sheet";
import type { ItemsView } from "../types";
import { validateItemsView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Items sheet renders the workspace-wide owned-items catalog
// (`UserData.items`) rather than a per-account ledger, so the item
// carries no data of its own today — the shape exists so future
// per-sheet config (sort order, show-disposed toggle, …) lands here
// without another migration. Mirrors `accounts.ts`.
export function createDefaultItemsView(): ItemsView {
  return { id: newId(), type: "itemsView" };
}

export const ITEMS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "items",
  label: "Items",
  description: "Track the things you own and what they're worth.",
  glyph: "package",
  createDefaultItem: () => createDefaultItemsView(),
  itemTypes: ["itemsView"],
  validate: (raw, path) => validateItemsView(raw, path),
  // No `reduceItem`: the owned-items catalog is global state mutated by
  // the `addItem` / `updateItem` / `deleteItem` actions in
  // `reducers/items.ts`, not per-item actions routed through the
  // registry tail. And no `rowsForItem`: the catalog isn't row-shaped.
};
