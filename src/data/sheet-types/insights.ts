import { INSIGHTS_GLYPH_NAMES } from "../constants/taxonomy";
import { newId } from "../sheet";
import type {
  InsightsEntityOverride,
  InsightsNetWorthSettings,
  InsightsView,
  UserData,
} from "../types";
import type { Action } from "../reducer";
import {
  normalizeInsightsOverride,
  validateInsightsView,
} from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Insights sheet aggregates the workspace-wide collections (accounts,
// savings, items, properties, loans) into cross-cutting analyses — net
// worth today, more modes later — so the item carries no data of its own
// beyond the per-mode settings. `mode` stays absent until a second mode
// exists; the page defaults to "networth".
export function createDefaultInsightsView(): InsightsView {
  return { id: newId(), type: "insightsView" };
}

const INSIGHTS_ITEM_ACTION_TYPES = ["setInsightsNetWorthSettings"] as const;

// Normalise a freshly-dispatched settings payload to its minimal
// persisted form — the same contract `validateInsightsView` enforces on
// load, so a payload and its round-trip through storage are identical.
// Returns `undefined` when nothing survives, in which case the
// `networth` field is dropped from the item entirely.
function normalizeNetWorthSettings(
  settings: InsightsNetWorthSettings,
): InsightsNetWorthSettings | undefined {
  const overrides: Record<string, InsightsEntityOverride> = {};
  for (const [entityId, rawOverride] of Object.entries(
    settings.overrides ?? {},
  )) {
    if (entityId === "") continue;
    const override = normalizeInsightsOverride(rawOverride);
    if (override) overrides[entityId] = override;
  }
  return Object.keys(overrides).length > 0 ? { overrides } : undefined;
}

function overridesEqual(
  a: Record<string, InsightsEntityOverride> | undefined,
  b: Record<string, InsightsEntityOverride> | undefined,
): boolean {
  const aEntries = Object.entries(a ?? {});
  const bMap = b ?? {};
  if (aEntries.length !== Object.keys(bMap).length) return false;
  return aEntries.every(([id, o]) => {
    const other = bMap[id];
    return (
      other !== undefined &&
      o.excluded === other.excluded &&
      o.sharePct === other.sharePct
    );
  });
}

// Insights-item dispatch tail: replaces the targeted view's net-worth
// settings wholesale (the settings modal edits a local draft and
// dispatches once on Save — one undo step). Returns null when `action`
// is not an insights action so the outer reducer's descriptor walk can
// defer to the next flavour's `reduceItem`.
function reduceInsightsItem(state: UserData, action: Action): UserData | null {
  if (action.type !== "setInsightsNetWorthSettings") return null;
  const next = normalizeNetWorthSettings(action.settings);
  let changed = false;
  const sheets = state.sheets.map((sheet) => {
    if (sheet.id !== action.sheetId) return sheet;
    let itemChanged = false;
    const items = sheet.items.map((item) => {
      if (item.id !== action.itemId || item.type !== "insightsView")
        return item;
      if (overridesEqual(item.networth?.overrides, next?.overrides))
        return item;
      itemChanged = true;
      if (next === undefined) {
        const { networth: _drop, ...rest } = item;
        void _drop;
        return rest;
      }
      return { ...item, networth: next };
    });
    if (!itemChanged) return sheet;
    changed = true;
    return { ...sheet, items };
  });
  return changed ? { ...state, sheets } : state;
}

export const INSIGHTS_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "insights",
  label: "Insights",
  description: "See the big picture across everything you track.",
  glyph: "line-chart",
  glyphNames: INSIGHTS_GLYPH_NAMES,
  createDefaultItem: () => createDefaultInsightsView(),
  itemTypes: ["insightsView"],
  validate: (raw, path, ctx) => validateInsightsView(raw, path, ctx),
  reduceItem: reduceInsightsItem,
  itemActionTypes: INSIGHTS_ITEM_ACTION_TYPES,
  // No `rowsForItem`: the insights view derives everything from the
  // global collections and persists no row-shaped data.
};
