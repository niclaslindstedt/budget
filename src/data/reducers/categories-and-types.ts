import {
  DEFAULT_CATEGORY_ID,
  PRESET_CATEGORY_IDS,
  PRESET_ENTRY_TYPE_IDS,
} from "../constants";
import type { Action } from "../reducer";
import type { UserData } from "../types";

export function reduceCategoriesAndTypes(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "addCategory") {
    return { ...state, categories: [...state.categories, action.category] };
  }
  if (action.type === "updateCategory") {
    // Presets are immutable — Settings hides the Edit button for them
    // and the action is a no-op if the id somehow targets a preset.
    if (PRESET_CATEGORY_IDS.has(action.categoryId)) return state;
    return {
      ...state,
      categories: state.categories.map((c) =>
        c.id === action.categoryId ? { ...c, ...action.patch } : c,
      ),
    };
  }
  if (action.type === "deleteCategory") {
    // Deleting a category cascades through the types that lived under
    // it: every user-added type with a matching `categoryId` is
    // reassigned to the catch-all "Other" category so rows that
    // referenced those types stay valid. Presets are immutable, same
    // as updateCategory.
    if (PRESET_CATEGORY_IDS.has(action.categoryId)) return state;
    const id = action.categoryId;
    return {
      ...state,
      categories: state.categories.filter((c) => c.id !== id),
      types: state.types.map((t) =>
        t.categoryId === id ? { ...t, categoryId: DEFAULT_CATEGORY_ID } : t,
      ),
    };
  }
  if (action.type === "setPresetCategoryHidden") {
    if (!PRESET_CATEGORY_IDS.has(action.presetId)) return state;
    const current = state.hiddenPresetCategoryIds;
    const isHidden = current.includes(action.presetId);
    if (action.hidden === isHidden) return state;
    return {
      ...state,
      hiddenPresetCategoryIds: action.hidden
        ? [...current, action.presetId]
        : current.filter((id) => id !== action.presetId),
    };
  }
  if (action.type === "addType") {
    return { ...state, types: [...state.types, action.entryType] };
  }
  if (action.type === "updateType") {
    if (PRESET_ENTRY_TYPE_IDS.has(action.typeId)) return state;
    return {
      ...state,
      types: state.types.map((t) =>
        t.id === action.typeId ? { ...t, ...action.patch } : t,
      ),
    };
  }
  if (action.type === "deleteType") {
    // Deleting a type cascades: every row's `typeId`, every merchant
    // hint's `typeId`, and every match rule's `typeId` that referenced
    // it gets the reference dropped. Presets are hide-only.
    if (PRESET_ENTRY_TYPE_IDS.has(action.typeId)) return state;
    const id = action.typeId;
    return {
      ...state,
      types: state.types.filter((t) => t.id !== id),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) => {
          if (item.type !== "accountBudget") return item;
          return {
            ...item,
            rows: item.rows.map((r) => {
              if (r.typeId !== id) return r;
              const { typeId: _drop, ...rest } = r;
              void _drop;
              return rest;
            }),
          };
        }),
      })),
      // Hints whose typeId points at the deleted type lose their only
      // actionable field — drop the entry entirely. The next time the
      // user assigns a type to a row matching the same merchant key,
      // a fresh hint will land here.
      merchantHints: Object.fromEntries(
        Object.entries(state.merchantHints).filter(
          ([, hint]) => hint.typeId !== id,
        ),
      ),
      matchRules: state.matchRules.map((rule) =>
        rule.typeId === id ? { ...rule, typeId: null } : rule,
      ),
    };
  }
  if (action.type === "setPresetTypeHidden") {
    if (!PRESET_ENTRY_TYPE_IDS.has(action.presetId)) return state;
    const current = state.hiddenPresetTypeIds;
    const isHidden = current.includes(action.presetId);
    if (action.hidden === isHidden) return state;
    return {
      ...state,
      hiddenPresetTypeIds: action.hidden
        ? [...current, action.presetId]
        : current.filter((id) => id !== action.presetId),
    };
  }
  if (action.type === "setPresetTypeKind") {
    if (!PRESET_ENTRY_TYPE_IDS.has(action.presetId)) return state;
    const current = state.presetTypeKindOverrides;
    if (current[action.presetId] === action.kind) return state;
    const next = { ...current, [action.presetId]: action.kind };
    return { ...state, presetTypeKindOverrides: next };
  }
  return null;
}
