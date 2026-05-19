// Helpers that merge built-in presets (`PRESET_ENTRY_TYPES`,
// `PRESET_CATEGORIES`) with the user-added arrays on `UserData`,
// applying the per-user hide lists. Every picker, every renderer that
// resolves a `typeId` / `categoryId`, and the admin UI in Settings
// reads through these so the merge rules — preset first, then
// user-added, hidden presets dropped — live in one place.

import {
  PRESET_CATEGORIES,
  PRESET_CATEGORY_IDS,
  PRESET_ENTRY_TYPE_IDS,
  PRESET_ENTRY_TYPES,
} from "./constants";
import type { Category, EntryType, UserData } from "./types";

export function isPresetTypeId(id: string): boolean {
  return PRESET_ENTRY_TYPE_IDS.has(id);
}

export function isPresetCategoryId(id: string): boolean {
  return PRESET_CATEGORY_IDS.has(id);
}

export function visiblePresetTypes(hiddenIds: readonly string[]): EntryType[] {
  if (hiddenIds.length === 0) return [...PRESET_ENTRY_TYPES];
  const hidden = new Set(hiddenIds);
  return PRESET_ENTRY_TYPES.filter((t) => !hidden.has(t.id));
}

export function visiblePresetCategories(
  hiddenIds: readonly string[],
): Category[] {
  if (hiddenIds.length === 0) return [...PRESET_CATEGORIES];
  const hidden = new Set(hiddenIds);
  return PRESET_CATEGORIES.filter((c) => !hidden.has(c.id));
}

// Effective type list shown to pickers and renderers: visible presets
// followed by user-added entries. Presets come first so they're
// stable across users; user-added entries follow in insertion order.
export function allTypes(data: UserData): EntryType[] {
  return [...visiblePresetTypes(data.hiddenPresetTypeIds), ...data.types];
}

export function allCategories(data: UserData): Category[] {
  return [
    ...visiblePresetCategories(data.hiddenPresetCategoryIds),
    ...data.categories,
  ];
}
