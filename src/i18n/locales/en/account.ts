import type { Widen } from "./_widen";

const account = {
  title: "Account",
  titleEdit: "Edit account",
  titleNew: "New account",
  create: "Create",
  name: "Name",
  namePlaceholder: "Checking, Travel fund, Cash…",
  description: "Description",
  descriptionPlaceholder: "Optional. e.g. shared household savings.",
  bank: "Bank",
  bankPlaceholder: "e.g. Swedbank, Nordea, Revolut…",
  clearing: "Clearing",
  clearingPlaceholder: "8327",
  accountNumber: "Account number",
  accountNumberPlaceholder: "123 456 789",
  iban: "IBAN",
  ibanPlaceholder: "SE45 5000 0000 0583 9825 7466",
  bic: "BIC / SWIFT",
  bicPlaceholder: "SWEDSESS",
  currencyOverride: "Currency override",
  currencyOverridePlaceholder: "Leave blank to use the global setting",
  currencyOverrideHint:
    "Free-form token. Empty means use the workspace setting.",
  noDetailsHint:
    "This account has no bank details. You can still track its balance and transfers — fill them in later for easier reconciliation.",
  openingBalance: "Opening balance",
  color: "Color",
  glyph: "Icon",
  deleteTitle: "Delete account?",
  deleteHint:
    "Budgets that referenced this account stay, but lose the reference. Bank history for it is dropped.",
  correctBalance: "Set balance",
  correctBalanceTitle: "Set account balance",
  correctBalanceHint:
    "We'll add a correction row dated today to make the running total match.",
  targetBalance: "Target balance",
  currentBalance: "Current balance",
  deltaPreview: "Correction: {delta}",
  addBudgetSheet: "Add budget sheet",
  addBudgetSheetHint:
    "Add a budget sheet for this account to update its balance.",
} as const;

export type AccountCatalog = Widen<typeof account>;

export default account;
