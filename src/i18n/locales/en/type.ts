import type { Widen } from "./_widen";

const type = {
  pickType: "Pick a type",
  pickTypeEllipsis: "Pick a type…",
  noType: "No type",
  addType: "Add type",
  namePlaceholder: "Mortgage",
  name: "Name",
  color: "Color",
  glyph: "Icon",
  category: "Category",
  pickCategoryEllipsis: "Pick a category…",
  clearType: "Clear type",
  newType: "New type",
  noTypesYet: "No types yet.",
  noTypesInCategory: "No types in this category yet.",
  create: "Create",
  backToCategories: "All categories",
} as const;

export type TypeCatalog = Widen<typeof type>;

export default type;
