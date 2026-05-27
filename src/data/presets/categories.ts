// Built-in preset categories — broader buckets than types, used for
// cross-row analysis (Housing vs. Food vs. Transport). The picker also
// shows any user-added categories from `UserData.categories`; the user
// can hide individual presets via `UserData.hiddenPresetCategoryIds`.
// Preset ids use the `preset-cat-<slug>` prefix so they're trivially
// distinguishable from user-minted ids (`c-…`) in stored data and in
// the validator. Once shipped, an id must never be reassigned — a
// rename keeps the id; a removed preset stays in this list (the hidden
// flag is the user-facing equivalent) so existing references continue
// to resolve.

import { CATEGORY_COLORS } from "../constants";
import type { Category, CategoryIcon } from "../types";

export const PRESET_CATEGORIES: ReadonlyArray<Category> = (() => {
  const C = CATEGORY_COLORS;
  const seeds: ReadonlyArray<{
    slug: string;
    name: string;
    color: string;
    icon: CategoryIcon;
  }> = [
    { slug: "housing", name: "Housing", color: C[1], icon: "home" },
    { slug: "food", name: "Food", color: C[3], icon: "utensils" },
    { slug: "transport", name: "Transport", color: C[4], icon: "car" },
    { slug: "health", name: "Health", color: C[0], icon: "heart-pulse" },
    { slug: "bills", name: "Bills", color: C[7], icon: "receipt" },
    {
      slug: "subscriptions",
      name: "Subscriptions",
      color: C[5],
      icon: "repeat",
    },
    {
      slug: "entertainment",
      name: "Entertainment",
      color: C[6],
      icon: "film",
    },
    { slug: "savings", name: "Savings", color: C[5], icon: "piggy-bank" },
    { slug: "income", name: "Income", color: C[3], icon: "banknote" },
    { slug: "family", name: "Family", color: C[6], icon: "baby" },
    { slug: "personal", name: "Personal", color: C[2], icon: "shirt" },
    {
      slug: "consumption",
      name: "Consumption",
      color: C[15],
      icon: "shopping-bag",
    },
    { slug: "travel", name: "Travel", color: C[4], icon: "plane" },
    { slug: "other", name: "Other", color: C[5], icon: "tag" },
    { slug: "unknown", name: "Unknown", color: C[8], icon: "circle-help" },
  ];
  return seeds.map((s) => ({
    id: `preset-cat-${s.slug}`,
    name: s.name,
    color: s.color,
    icon: s.icon,
  }));
})();

// Lookup for the validator (cheap membership test against the preset
// id list). Built once at module load — `PRESET_CATEGORIES` is a
// frozen literal so the set never needs to be rebuilt.
export const PRESET_CATEGORY_IDS: ReadonlySet<string> = new Set(
  PRESET_CATEGORIES.map((c) => c.id),
);

// Catch-all preset category used when a type doesn't fit any specific
// bucket. The v24 → v25 migration falls back to this id for user
// types whose name doesn't match any known preset, and the picker /
// settings UI lean on it when a type is being created without an
// explicit category. Always present — `PRESET_CATEGORIES` includes the
// "other" slug — so consumers can hardcode the id with confidence.
export const DEFAULT_CATEGORY_ID = "preset-cat-other";

export function isPresetCategoryId(id: string): boolean {
  return PRESET_CATEGORY_IDS.has(id);
}

export function visiblePresetCategories(
  hiddenIds: readonly string[],
): Category[] {
  if (hiddenIds.length === 0) return [...PRESET_CATEGORIES];
  const hidden = new Set(hiddenIds);
  return PRESET_CATEGORIES.filter((c) => !hidden.has(c.id));
}
