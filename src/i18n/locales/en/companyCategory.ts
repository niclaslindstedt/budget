import type { Widen } from "./_widen";

const companyCategory = {
  pickCompanyCategory: "Pick a category",
  addCompanyCategory: "Add category",
  addCompanyCategoryEllipsis: "Add category…",
  newCompanyCategory: "New category",
  clearCompanyCategory: "Clear category",
  noCompanyCategoriesYet: "No categories yet.",
  namePlaceholder: "Grocery stores",
  name: "Name",
  color: "Color",
  icon: "Icon",
  create: "Create",
} as const;

export type CompanyCategoryCatalog = Widen<typeof companyCategory>;

export default companyCategory;
