import type { Widen } from "./_widen";

const properties = {
  // Page chrome.
  sheetTitle: "Properties",
  noProperties: "No properties yet.",
  addProperty: "Add property",
  total: "Total",
  editSheet: "Edit sheet",

  // Property card.
  boughtFor: "Bought for",
  purchased: "Purchased",
  currentValue: "Current value",
  noValue: "No value recorded",
  updateValue: "Update value",
  editProperty: "Edit property",
  deleteProperty: "Delete property",
  mortgages: "Mortgages",
  noMortgages: "No mortgages on this property.",
  addMortgage: "Add mortgage",
  findPayments: "Find payments",
  editMortgage: "Edit mortgage",
  deleteMortgage: "Delete mortgage",
  noAccountBound: "No account bound",
  paymentsCountOne: "{count} payment",
  paymentsCountOther: "{count} payments",
  principalTotal: "Principal",
  interestTotal: "Interest",
  balanceShort: "Balance",
  loanShort: "Loan",
  rateShort: "Rate",
  rateResetsOne: "resets monthly",
  rateResetsOther: "resets every {count} mo",
  nextRateChangeShort: "Next change",
  amortShort: "Amortisation",
  amortPerMonth: "{amount}/mo",

  // Property editor modal.
  newPropertyTitle: "New property",
  editPropertyTitle: "Edit property",
  nameLabel: "Name",
  namePlaceholder: "Apartment, summer house…",
  purchaseAmountLabel: "Purchase amount",
  purchaseAmountPlaceholder: "What you paid for it",
  purchaseDateLabel: "Purchase date",

  // Update-value modal.
  updateValueTitle: "Update value",
  valueLabel: "Current value",
  valuePlaceholder: "What it's worth now",
  asOfLabel: "As of",
  valueHistory: "Value history",
  noValueHistory: "No values recorded yet.",
  deleteValueTitle: "Delete value?",
  deleteValueConfirm:
    "The value recorded for {date} will be removed. This cannot be undone.",

  // Mortgage editor modal.
  newMortgageTitle: "New mortgage",
  editMortgageTitle: "Edit mortgage",
  mortgageNameLabel: "Name",
  mortgageNamePlaceholder: "SBAB loan 1…",
  loanAmountLabel: "Loan amount",
  loanAmountPlaceholder: "The sum you borrowed",
  currentBalanceLabel: "Current balance",
  currentBalancePlaceholder: "What's left to pay",
  interestRateLabel: "Interest rate (%)",
  interestRatePlaceholder: "e.g. 3.45",
  rateChangeMonthsLabel: "Rate resets every (months)",
  rateChangeMonthsPlaceholder: "e.g. 3",
  rateChangeMonthsHint:
    "How often the interest rate is renegotiated — 3 for a variable rate, 12 for a 1-year fixed term.",
  nextRateChangeLabel: "Next rate change",
  amortizationLabel: "Monthly amortisation",
  amortModePercent: "% of initial loan",
  amortModeFixed: "Fixed sum",
  amortPercentPlaceholder: "e.g. 2",
  amortFixedPlaceholder: "Amount per month",
  amortPercentHint:
    "Annual amortisation as a percent of the original loan amount. Add a loan amount to see the monthly figure.",
  amortFixedHint: "A flat amount paid down every month.",
  amortPreview: "≈ {amount} per month",
  accountLabel: "Account",
  accountHint:
    "The account this loan is paid from. “Find payments” scans this account's bank history for the recurring charge.",
  chooseAccount: "Choose an account",
  noAccount: "No account",
  noAccountsYet: "No accounts yet",

  // Find-payments walk.
  findTitle: "Find mortgage payments",
  findNoAccount:
    "Bind a bank account to this mortgage first — “Find payments” scans that account's history for the recurring charge.",
  findNoneFound:
    "No recurring monthly charges found in this account's history.",
  findPickPrincipal: "Which charge is the payment (amortisation)?",
  findPickInterest: "Separate interest charge? (optional)",
  findNoInterest: "None — single combined charge",
  findPreview: "Payments to add",
  findMonthsOne: "{count} month",
  findMonthsOther: "{count} months",
  findAlreadyAdded: "Already added",
  findAddOne: "Add {count} payment",
  findAddOther: "Add {count} payments",
  findEmptySelection: "Pick a charge above to preview the payments.",

  // Delete property confirm.
  deletePropertyTitle: "Delete property?",
  deletePropertyConfirm:
    "{name} and its mortgages will be removed. This cannot be undone.",
  deleteMortgageTitle: "Delete mortgage?",
  deleteMortgageConfirm:
    "{name} and its payments will be removed. This cannot be undone.",

  // Shared verbs.
  save: "Save",
  create: "Create",
  delete: "Delete",
} as const;

export type PropertiesCatalog = Widen<typeof properties>;

export default properties;
