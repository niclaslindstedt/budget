import { SCENARIOS_GLYPH_NAMES } from "../constants/taxonomy";
import {
  SCENARIOS_ITEM_ACTION_TYPES,
  reduceScenariosItem,
} from "../reducers/scenarios";
import { newId } from "../sheet";
import type { ScenariosView } from "../types";
import { validateScenariosView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Scenarios sheet plays what-if variants against ONE base budget
// sheet — live-linked deltas (value overrides, exclusions, added rows)
// rather than copies, so the real budget is never mutated and edits to
// it flow into every scenario. `baseSheetId` starts null; the page
// opens with a base picker until the user binds one.
export function createDefaultScenariosView(): ScenariosView {
  return {
    id: newId(),
    type: "scenariosView",
    baseSheetId: null,
    monitors: [],
    scenarios: [],
  };
}

export const SCENARIOS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "scenarios",
  label: "Scenarios",
  description: "Play what-if futures against a budget you already track.",
  glyph: "compass",
  glyphNames: SCENARIOS_GLYPH_NAMES,
  createDefaultItem: () => createDefaultScenariosView(),
  itemTypes: ["scenariosView"],
  validate: (raw, path, ctx) => validateScenariosView(raw, path, ctx),
  reduceItem: reduceScenariosItem,
  itemActionTypes: SCENARIOS_ITEM_ACTION_TYPES,
  // No `rowsForItem`: scenario deltas and added rows are hypothetical —
  // they must not leak into the search index, achievement row counts,
  // or backup entry totals as if they were real ledger rows.
};
