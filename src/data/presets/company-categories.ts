// Built-in preset company categories — a Swedish-perspective set of
// merchant kinds (grocery stores, pharmacies, fuel, …) used to classify
// `Company` records so the user can analyse where the household shops.
// The picker also shows any user-added company categories from
// `UserData.companyCategories`; the user can hide individual presets
// via `UserData.hiddenPresetCompanyCategoryIds`. Preset ids use the
// `preset-company-cat-<slug>` prefix so they're trivially
// distinguishable from user-minted ids in stored data and in the
// validator. Once shipped, an id must never be reassigned — a rename
// keeps the id; a removed preset stays in this list (the hidden flag is
// the user-facing equivalent) so existing references continue to
// resolve.
//
// Names are not stored here — they're translated at render time through
// `presetCompanyCategories.<slug>` (see `i18n/preset-names.ts`),
// mirroring `PRESET_CATEGORIES`. Seed glyphs are drawn from the full
// `CategoryIcon` union (the persisted model accepts any of them); the
// in-app creator offers `COMPANY_CATEGORY_GLYPH_NAMES`.

import { CATEGORY_COLORS } from "../constants/taxonomy";
import type { CategoryIcon, CompanyCategory } from "../types";

export const PRESET_COMPANY_CATEGORIES: ReadonlyArray<CompanyCategory> =
  (() => {
    const C = CATEGORY_COLORS;
    const seeds: ReadonlyArray<{
      slug: string;
      name: string;
      color: string;
      icon: CategoryIcon;
    }> = [
      {
        slug: "grocery",
        name: "Grocery stores",
        color: C[3],
        icon: "shopping-cart",
      },
      {
        slug: "restaurant",
        name: "Restaurants",
        color: C[1],
        icon: "utensils",
      },
      { slug: "cafe", name: "Cafés", color: C[9], icon: "coffee" },
      { slug: "fast-food", name: "Fast food", color: C[0], icon: "pizza" },
      { slug: "alcohol", name: "Alcohol", color: C[6], icon: "wine" },
      {
        slug: "clothing",
        name: "Clothing & fashion",
        color: C[8],
        icon: "shirt",
      },
      {
        slug: "electronics",
        name: "Electronics",
        color: C[5],
        icon: "smartphone",
      },
      {
        slug: "home-goods",
        name: "Home & furniture",
        color: C[2],
        icon: "sofa",
      },
      { slug: "hardware", name: "Hardware & DIY", color: C[7], icon: "wrench" },
      { slug: "pharmacy", name: "Pharmacies", color: C[12], icon: "pill" },
      {
        slug: "health",
        name: "Health & care",
        color: C[4],
        icon: "heart-pulse",
      },
      { slug: "fuel", name: "Fuel & charging", color: C[10], icon: "fuel" },
      {
        slug: "transport",
        name: "Transport & travel",
        color: C[13],
        icon: "train",
      },
      {
        slug: "entertainment",
        name: "Entertainment & leisure",
        color: C[14],
        icon: "film",
      },
      {
        slug: "online",
        name: "Online retail",
        color: C[15],
        icon: "shopping-bag",
      },
      { slug: "services", name: "Services", color: C[11], icon: "briefcase" },
      { slug: "bank", name: "Banks & finance", color: C[5], icon: "landmark" },
      { slug: "other", name: "Other", color: C[5], icon: "tag" },
    ];
    return seeds.map((s) => ({
      id: `preset-company-cat-${s.slug}`,
      name: s.name,
      color: s.color,
      icon: s.icon,
    }));
  })();

// Lookup for the validator (cheap membership test against the preset id
// list). Built once at module load.
export const PRESET_COMPANY_CATEGORY_IDS: ReadonlySet<string> = new Set(
  PRESET_COMPANY_CATEGORIES.map((c) => c.id),
);

// Catch-all preset used when a company doesn't fit any specific kind.
// Always present — `PRESET_COMPANY_CATEGORIES` includes the "other"
// slug — so consumers can hardcode the id with confidence.
export const DEFAULT_COMPANY_CATEGORY_ID = "preset-company-cat-other";

export function isPresetCompanyCategoryId(id: string): boolean {
  return PRESET_COMPANY_CATEGORY_IDS.has(id);
}

export function visiblePresetCompanyCategories(
  hiddenIds: readonly string[],
): CompanyCategory[] {
  if (hiddenIds.length === 0) return [...PRESET_COMPANY_CATEGORIES];
  const hidden = new Set(hiddenIds);
  return PRESET_COMPANY_CATEGORIES.filter((c) => !hidden.has(c.id));
}
