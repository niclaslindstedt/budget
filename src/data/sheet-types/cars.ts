import { CARS_GLYPH_NAMES } from "../constants/taxonomy";
import { newId } from "../sheet";
import type { CarsView } from "../types";
import { validateCarsView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Cars sheet renders the workspace-wide `UserData.cars` collection
// (the cars the user owns / leases / shares / pools, their linked
// transportation costs, and their value over time) rather than a
// per-account ledger, so the item carries no data of its own today —
// the shape exists so future per-sheet config (sort order, hide-sold
// toggle, …) lands here without another migration. Mirrors
// `properties.ts`.
export function createDefaultCarsView(): CarsView {
  return { id: newId(), type: "carsView" };
}

export const CARS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "cars",
  label: "Cars",
  description: "See what having a car really costs — owned, leased, or pooled.",
  glyph: "car",
  glyphNames: CARS_GLYPH_NAMES,
  createDefaultItem: () => createDefaultCarsView(),
  itemTypes: ["carsView"],
  validate: (raw, path) => validateCarsView(raw, path),
  // No `reduceItem`: the cars catalog is global state mutated by the
  // `addCar` / `updateCar` / … (and snapshot / expense) actions in
  // `reducers/cars.ts`, not per-item actions routed through the
  // registry tail. And no `rowsForItem`: the catalog isn't row-shaped.
};
