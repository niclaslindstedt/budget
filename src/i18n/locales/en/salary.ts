import type { Widen } from "./_widen";

const salary = {
  // Page chrome
  sheetTitle: "Salary",
  findSalaries: "Find salaries",
  manageEmployers: "Employers",
  noSalaries:
    "No salaries yet. Use “Find salaries” to detect them from your bank history, or add one below.",
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

  // Find-salaries guided walk
  findTitle: "Find salaries",
  likelyNewEmployer: "Likely new employer",
  raise: "Raise",
  add: "Add",
  confidenceHigh: "Likely",
  confidenceMedium: "Maybe",
  confidenceLow: "Guess",

  // Account step
  pickAccountTitle: "Which account does your salary land in?",
  pickAccountHint:
    "We’ll scan that account’s full bank history for likely paychecks — even years back, before you tagged anything.",
  pickAccountPlaceholder: "Pick an account",
  noAccountsWithHistory:
    "No imported bank history yet. Import a statement on the Accounts page first.",
  discoverySummary: "{count} likely salary months from {start} to {end}.",
  discoveryNone: "No recurring salary found in this account’s history.",

  // Cluster summary — pay periods between raises / employer changes.
  clustersTitle: "Pay periods",
  clustersHint:
    "Each stretch held roughly one pay level. A step up is a raise or title change; a permanent drop is usually a new employer. This level is also the baseline that flags a light month as vacation or sick leave.",
  clusterSpanYears: "{count} yr",
  clusterSpanMonths: "{count} mo",
  clusterPaychecksOne: "{count} paycheck",
  clusterPaychecksOther: "{count} paychecks",

  // Year review step
  yearStepTitle: "Salaries in {year}",
  yearMonthsOne: "{count} month detected",
  yearMonthsOther: "{count} months detected",
  yearFlagged: "{count} look unusual",
  offBaselineTag: "Unusual",
  yearReviewHint:
    "These are the paychecks we found this year. Accept them all, or review each to edit the amount, tag an employer, or skip it.",
  reviewMonths: "Review each",
  acceptYearOne: "Accept {count}",
  acceptYearOther: "Accept all {count}",

  // Month step
  monthProgress: "{index} of {total}",
  fromBank: "From your bank",
  offAverageHint:
    "This differs from your usual paycheck — a bonus, leave, or a raise?",
  accept: "Accept",
  skip: "Skip",
  alreadyAccepted: "Accepted — accept again to update.",
  alreadySkipped: "Skipped.",

  // Summary step
  readyToAddOne: "{count} salary ready to add.",
  readyToAddOther: "{count} salaries ready to add.",

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
  duplicateEmployer: "An employer with this name already exists.",
} as const;

export type SalaryCatalog = Widen<typeof salary>;

export default salary;
