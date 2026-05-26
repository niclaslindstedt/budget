import type { Widen } from "./_widen";

const category = {
  pickCategory: "Pick a category",
  addCategory: "Add category",
  addCategoryEllipsis: "Add category…",
  newCategory: "New category",
  clearCategory: "Clear category",
  noCategory: "No category",
  noCategoriesYet: "No categories yet.",
  namePlaceholder: "Rent",
  name: "Name",
  color: "Color",
  icon: "Icon",
  create: "Create",
} as const;

export type CategoryCatalog = Widen<typeof category>;

export default category;
