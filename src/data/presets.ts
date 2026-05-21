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
import type { Category, EntryType, EntryTypeKind, UserData } from "./types";

export function isPresetTypeId(id: string): boolean {
  return PRESET_ENTRY_TYPE_IDS.has(id);
}

export function isPresetCategoryId(id: string): boolean {
  return PRESET_CATEGORY_IDS.has(id);
}

export function visiblePresetTypes(
  hiddenIds: readonly string[],
  kindOverrides: Readonly<Record<string, EntryTypeKind>> = {},
): EntryType[] {
  const hidden = hiddenIds.length === 0 ? null : new Set(hiddenIds);
  const out: EntryType[] = [];
  for (const t of PRESET_ENTRY_TYPES) {
    if (hidden?.has(t.id)) continue;
    out.push(applyKindOverride(t, kindOverrides));
  }
  return out;
}

// Effective `kind` for a preset given the per-user override map.
// `"any"` is the runtime default — both for "no override and no built-
// in kind" and for an explicit override that re-widens an income-only
// preset back to any-direction.
export function effectivePresetKind(
  type: EntryType,
  kindOverrides: Readonly<Record<string, EntryTypeKind>>,
): EntryTypeKind {
  const override = kindOverrides[type.id];
  if (override !== undefined) return override;
  return type.kind ?? "any";
}

// Resolve a type's effective kind regardless of whether it's a preset
// or user-added. User-added types carry `kind` directly; presets are
// looked up against the override map.
export function effectiveTypeKind(
  type: EntryType,
  kindOverrides: Readonly<Record<string, EntryTypeKind>>,
): EntryTypeKind {
  if (isPresetTypeId(type.id)) return effectivePresetKind(type, kindOverrides);
  return type.kind ?? "any";
}

function applyKindOverride(
  type: EntryType,
  kindOverrides: Readonly<Record<string, EntryTypeKind>>,
): EntryType {
  const override = kindOverrides[type.id];
  if (override === undefined) return type;
  if (override === "any") {
    if (type.kind === undefined) return type;
    const { kind: _drop, ...rest } = type;
    void _drop;
    return rest;
  }
  if (type.kind === override) return type;
  return { ...type, kind: override };
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
