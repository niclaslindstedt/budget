// Merge helpers — combine preset entry types / categories with the
// user-added arrays on `UserData`. Pickers and renderers that need the
// full effective lists (presets the user hasn't hidden, then their own
// entries) go through these so the merge rule lives in one place.

import type { Category, CompanyCategory, EntryType, UserData } from "../types";
import { visiblePresetCategories } from "./categories";
import { visiblePresetCompanyCategories } from "./company-categories";
import { visiblePresetTypes } from "./types";

// Effective type list shown to pickers and renderers: visible presets
// followed by user-added entries. Presets come first so they're
// stable across users; user-added entries follow in insertion order.
// Preset `kind` is projected through `presetTypeKindOverrides` so
// every consumer (picker filter, settings UI, schema renderers) sees
// the same effective income/expense flag without consulting the
// override map directly.
export function allTypes(data: UserData): EntryType[] {
  return [
    ...visiblePresetTypes(
      data.hiddenPresetTypeIds,
      data.presetTypeKindOverrides,
    ),
    ...data.types,
  ];
}

export function allCategories(data: UserData): Category[] {
  return [
    ...visiblePresetCategories(data.hiddenPresetCategoryIds),
    ...data.categories,
  ];
}

export function allCompanyCategories(data: UserData): CompanyCategory[] {
  return [
    ...visiblePresetCompanyCategories(data.hiddenPresetCompanyCategoryIds),
    ...data.companyCategories,
  ];
}
