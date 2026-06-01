import type { Widen } from "./_widen";

const tax = {
  // Tax-profile editor modal
  newProfileTitle: "New tax profile",
  editProfileTitle: "Edit tax profile",
  name: "Name",
  namePlaceholder: "e.g. My salary, Stockholm",
  duplicateName: "A tax profile with this name already exists.",
  country: "Country",
  municipality: "Municipality",
  municipalitySearch: "Search municipality…",
  noMunicipalityMatch: "No municipality matches.",
  churchMember: "Church member",
  churchMemberHint: "Adds the church fee (kyrkoavgift) to the estimate.",
  birthYear: "Birth year",
  birthYearPlaceholder: "e.g. 1985",
  birthYearHint: "Used for the higher deduction and credit from age 66.",
  incomeKind: "Income type",
  incomeEmployment: "Employment",
  incomePension: "Pension",
  incomeKindHint: "Employment income qualifies for the job tax deduction.",
  saveProfile: "Save profile",
  deleteProfile: "Delete profile",
  deleteProfileConfirm:
    "Delete {name}? Salary sheets using it will stop estimating gross.",

  // Tax-profile picker (in the sheet editor)
  label: "Tax profile",
  pickProfile: "Pick tax profile",
  noProfile: "No profile",
  newProfile: "New profile",
  sheetHint:
    "Estimates each paycheck's gross from its net deposit using these tax rules. Pick none to enter gross manually.",

  // Estimated-value tells on the salary table
  estimatedBadge: "≈",
  estimatedTitle: "Estimated from the net deposit using the tax profile.",
} as const;

export type TaxCatalog = Widen<typeof tax>;

export default tax;
