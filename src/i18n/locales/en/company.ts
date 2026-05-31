import type { Widen } from "./_widen";

const company = {
  pickCompany: "Pick a company",
  pickCompanyEllipsis: "Pick a company…",
  addCompany: "Add company",
  clearCompany: "Clear company",
  omitCompany: "Omit company",
  omittedLabel: "Company omitted",
  newCompany: "New company",
  editCompany: "Edit company",
  noCompaniesYet: "No companies yet.",
  name: "Name",
  namePlaceholder: "H&M",
  create: "Create",
  duplicateName: "A company with this name already exists.",
} as const;

export type CompanyCatalog = Widen<typeof company>;

export default company;
