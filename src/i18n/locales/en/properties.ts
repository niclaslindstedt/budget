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
  size: "Size",
  currentValue: "Current value",
  noValue: "No value recorded",
  updateValue: "Update value",
  editProperty: "Edit property",
  deleteProperty: "Delete property",
  mortgages: "Mortgages",
  noMortgages: "No mortgages on this property.",
  addMortgage: "Add mortgage",
  editMortgage: "Edit mortgage",
  deleteMortgage: "Delete mortgage",
  noPaymentsYet: "No payments yet",
  paymentsCountOne: "{count} payment",
  paymentsCountOther: "{count} payments",
  paidTotal: "Paid",
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
  sizeLabel: "Size",
  sizePlaceholder: "Living area",

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
  rateChangeDateLabel: "Rate change date",
  rateChangeRateLabel: "Rate (%)",
  addRateChange: "Add rate change",
  removeRateChange: "Remove rate change",
  rateHistoryHint:
    "Add a rate change with the date it took effect — the newest is the current rate. Leave the first date blank for the original rate. Past rates let the finder split each payment accurately.",
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
    "The account this property's mortgages are paid from. “Find mortgage payments” scans this account's bank history for the charges.",
  chooseAccount: "Choose an account",
  noAccount: "No account",
  noAccountsYet: "No accounts yet",
  lenderLabel: "Lender",
  lenderPlaceholder: "Pick a company…",
  lenderHint:
    "The bank the mortgages on this property are held with. “Find mortgage payments” uses it — and the Mortgage entry type — to locate the right charges.",

  // Find-payments walk.
  findTitle: "Find mortgage payments",
  findNoProperties: "Add a property with a mortgage first.",
  findSelectProperty: "Property",
  findNoMortgages: "This property has no mortgages yet.",
  findNoAccount:
    "Give this property's mortgages a bank account first — the finder scans that account's history for the charge.",
  findNoneFound: "No matching charges found in the account history.",
  findNeedsTags:
    "Nothing to go on yet. In your budget, tag this property's mortgage charges with their company and the Mortgage type (one month is enough), then come back — the finder uses those tags to locate the rest.",
  findSplitHint:
    "Each charge is split across the property's {count} mortgages by their amortisation and interest.",
  findTxnCountOne: "{count} transaction",
  findTxnCountOther: "{count} transactions",
  findSelectCharges: "Charges to add",
  findSeedTags:
    "Matched from charges you tagged with this mortgage's company or the Mortgage type.",
  findSeedPayments: "Matched from the payments already on this mortgage.",
  findSeedAmount:
    "Matched from the loan terms — charges near this mortgage's expected monthly amount. Check each one before adding.",
  findHighlyProbable: "Highly probable",
  findPreview: "Payments to add",
  findAlreadyAdded: "Already added",
  findAddOne: "Add {count} payment",
  findAddOther: "Add {count} payments",

  // Amount band around each matched charge.
  findToleranceLabel: "Match tolerance",
  findToleranceValue: "±{pct}%",
  findToleranceHint:
    "How much a charge's amount may vary month to month and still count — widen it if the interest rate changed over the period.",
  findSpanMonthsOne: "over {count} month",
  findSpanMonthsOther: "over {count} months",
  findRange: "{start} – {end}",

  // Payments view.
  viewPayments: "View payments",
  paymentsTitle: "Mortgage payments",
  paymentsEmpty: "No payments recorded yet.",
  chargeTotal: "Charge total",
  paymentDate: "Date",
  paymentAmount: "Amount",
  editPayment: "Edit payment",
  deletePayment: "Delete payment",
  paymentRebalanceHint:
    "The other loans in this charge re-balance so the total stays {total} — amortisation first, then interest.",
  deletePaymentTitle: "Delete payment?",
  deletePaymentConfirm:
    "{name}'s share of the {date} charge ({amount}) will be removed. This cannot be undone.",

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
