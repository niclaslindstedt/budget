import { PROPERTIES_GLYPH_NAMES } from "../constants/taxonomy";
import { newId } from "../sheet";
import type { PropertiesView } from "../types";
import { validatePropertiesView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Properties sheet renders the workspace-wide `UserData.properties`
// collection (homes / apartments, their value over time, the mortgages
// against them) rather than a per-account ledger, so the item carries no
// data of its own today — the shape exists so future per-sheet config
// (sort order, hide-sold toggle, …) lands here without another migration.
// Mirrors `items.ts`.
export function createDefaultPropertiesView(): PropertiesView {
  return { id: newId(), type: "propertiesView" };
}

export const PROPERTIES_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "properties",
  label: "Properties",
  description: "Track what you own, what it's worth, and the loans on it.",
  glyph: "home",
  glyphNames: PROPERTIES_GLYPH_NAMES,
  createDefaultItem: () => createDefaultPropertiesView(),
  itemTypes: ["propertiesView"],
  validate: (raw, path) => validatePropertiesView(raw, path),
  // No `reduceItem`: the properties catalog is global state mutated by the
  // `addProperty` / `updateProperty` / … (and mortgage / payment) actions
  // in `reducers/properties.ts`, not per-item actions routed through the
  // registry tail. And no `rowsForItem`: the catalog isn't row-shaped.
};
