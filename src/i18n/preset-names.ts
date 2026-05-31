// Resolves the display name for a Category / EntryType through the
// active translation catalog when the row is a built-in preset
// (`preset-cat-<slug>` / `preset-type-<slug>`). User-added entries
// carry their own name in the language the user typed and bypass the
// lookup. The `t()` helper falls back to the key path if the slug
// isn't in the catalog, so an unknown preset id renders as its slug
// rather than crashing.

import type { Category, CompanyCategory, EntryType } from "../data/types";
import type { MessageKey, TFunction } from ".";

const CATEGORY_PREFIX = "preset-cat-";
const COMPANY_CATEGORY_PREFIX = "preset-company-cat-";
const TYPE_PREFIX = "preset-type-";

export function displayCategoryName(category: Category, t: TFunction): string {
  if (category.id.startsWith(CATEGORY_PREFIX)) {
    const slug = category.id.slice(CATEGORY_PREFIX.length);
    return t(`presetCategories.${slug}` as MessageKey);
  }
  return category.name;
}

export function displayCompanyCategoryName(
  category: CompanyCategory,
  t: TFunction,
): string {
  if (category.id.startsWith(COMPANY_CATEGORY_PREFIX)) {
    const slug = category.id.slice(COMPANY_CATEGORY_PREFIX.length);
    return t(`presetCompanyCategories.${slug}` as MessageKey);
  }
  return category.name;
}

export function displayTypeName(type: EntryType, t: TFunction): string {
  if (type.id.startsWith(TYPE_PREFIX)) {
    const slug = type.id.slice(TYPE_PREFIX.length);
    return t(`presetTypes.${slug}` as MessageKey);
  }
  return type.name;
}
