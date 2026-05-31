import type { Widen } from "./_widen";

const salary = {
  // Page chrome
  sheetTitle: "Salary",
  findSalaries: "Find salaries",
  manageEmployers: "Employers",
  noSalaries:
    "No salaries yet. Use “Find salaries” to detect them from your budget, or add one below.",
  addSalary: "Add salary",
  select: "Select",
  cancelSelect: "Done",
  selected: "{count} selected",

  // Table
  month: "Month",
  employer: "Employer",
  title: "Title",
  gross: "Gross",
  tax: "Tax",
  net: "Net",
  days: "Days",
  actions: "Actions",
  yearTotal: "Total",
  noEmployer: "No employer",
  editAria: "Edit salary for {month}",
  deleteAria: "Delete salary for {month}",

  // Absence-day badges
  careOfChildShort: "VAB",
  parentalLeaveShort: "Parental",
  vacationShort: "Vacation",
  sickShort: "Sick",
  daysValue: "{n} d",

  // Edit modal
  editTitle: "Edit salary",
  deleteTitle: "Delete salary",
  deleteConfirm: "Delete the salary for {month}? This cannot be undone.",
  delete: "Delete",
  grossLabel: "Gross (brutto)",
  grossHint: "What you earned before tax. Tax is gross minus the net deposit.",
  netLabel: "Net (netto)",
  netHint: "The amount paid into your account.",
  taxLabel: "Tax",
  careOfChildDaysLabel: "Care-of-child days (VAB)",
  parentalLeaveDaysLabel: "Parental-leave days",
  vacationDaysLabel: "Vacation days",
  sickDaysLabel: "Sick days",
  noteLabel: "Note",
  notePlaceholder: "Optional. e.g. why this paycheck is off the average.",

  // Bulk edit
  bulkTitle: "Edit {count} salaries",
  bulkEmployerToggle: "Set employer",
  bulkTaxRateToggle: "Set tax rate",
  bulkTaxRateHint:
    "Percent of gross withheld as tax. Each salary's gross is back-calculated from its own net deposit.",
  bulkTaxRatePlaceholder: "e.g. 30",
  apply: "Apply",

  // Find-salaries modal
  findTitle: "Find salaries",
  findIntro:
    "These look like salary payments in your budget. Add the ones to keep; discard the rest.",
  findNone:
    "No likely salaries found. Mark an income series as your main salary in the budget to improve detection.",
  likelyNewEmployer: "Likely new employer",
  add: "Add",
  discard: "Discard",
  addAll: "Add all",
  discardAll: "Discard all",
  confidenceHigh: "Likely",
  confidenceMedium: "Maybe",
  confidenceLow: "Guess",

  // Employer management
  employersTitle: "Employers",
  addEmployer: "Add employer",
  employerName: "Name",
  employerNamePlaceholder: "Acme AB, …",
  employerColor: "Color",
  employerGlyph: "Icon",
  saveEmployer: "Save employer",
  deleteEmployer: "Delete employer",
  deleteEmployerConfirm:
    "Delete {name}? Salaries keep their data but lose the employer.",
  noEmployers: "No employers yet. Add one to tag your salaries.",
  editEmployerAria: "Edit {name}",
  deleteEmployerAria: "Delete {name}",
  roles: "Roles",
  addRole: "Add role",
  roleTitle: "Title",
  roleTitlePlaceholder: "Developer, Manager, …",
  roleStart: "From",
  roleEnd: "To",
  removeRole: "Remove role",
  noRoles: "No roles yet.",

  // Employer picker
  pickEmployer: "Pick employer",
  newEmployer: "New employer",
} as const;

export type SalaryCatalog = Widen<typeof salary>;

export default salary;
