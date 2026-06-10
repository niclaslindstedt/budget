import type { Widen } from "./_widen";

const loansSheet = {
  title: "Loans",
  name: "Name",
  type: "Type",
  monthly: "Monthly",
  rate: "Rate",
  paid: "Paid",
  remaining: "Remaining",
  actions: "Actions",
  total: "Total",
  addLoan: "Add loan",
  noLoans: "No loans yet. Add one with the button below.",
  editAria: "Edit {name}",
  editTitle: "Edit loan",
  viewAria: "View {name}",
  deleteAria: "Delete {name}",
  deleteTitle: "Delete loan",
  deleteConfirm:
    "Delete {name}? Its recorded payments are removed. A linked property mortgage is untouched — only the link goes away.",

  // Loan kinds.
  kindStudent: "Student loan",
  kindMortgage: "Mortgage",
  kindCar: "Car loan",
  kindPrivate: "Private loan",
  kindPersonal: "Personal loan",

  // Row sub-line for a linked mortgage loan.
  linkedTo: "Linked to {name}",
  linkedToMany: "Linked to {name} ({n} mortgages)",

  // Row "…" menu.
  updateBalance: "Update balance",
  importPayments: "Import payments",
  viewPayments: "View payments",
  noPayments: "No payments recorded yet",
  linkedBalanceHint:
    "The balance comes from the linked mortgage — update it on the Properties sheet",

  // Visualize-loans chart modal.
  visualizeLoans: "Visualize loans",
  chartViewAria: "Chart view",
  chartBalances: "Balances",
  chartPayments: "Payments",
  chartRangeAria: "Time range",
  chartRange1y: "1Y",
  chartRange2y: "2Y",
  chartRange3y: "3Y",
  chartRange5y: "5Y",
  chartRangeAll: "All",
  chartBalanceChange: "Balance change",
  chartNoneInRange: "No data in this range. Pick a longer one.",
  chartIncludeStudent: "Include student loans",
  chartIncludeMortgages: "Include mortgages",
  chartBreakOutInterest: "Break out estimated interest",
  chartInterest: "Interest",
  chartTotal: "Total",
  chartEmpty:
    "Not enough data to chart yet. Record a balance or import payments first.",
  chartNoneIncluded: "All loans are excluded. Tick a loan type to chart.",

  // Create / edit modal.
  newTitle: "New loan",
  namePlaceholder: "e.g. Car loan",
  description: "Description",
  kind: "Type of loan",
  startDate: "Start date",
  startSum: "Start sum",
  rateLabel: "Rate (%/year)",
  startFee: "Setup fee",
  lenderName: "Lender (person)",
  lenderNamePlaceholder: "e.g. Alex",
  company: "Lender",
  linkMortgage: "Link a property mortgage",
  linkNone: "Not linked — enter terms below",
  linkedHint:
    "Terms, payments and balance come from the linked mortgage on the Properties sheet. Edit them there.",
  noMortgagesToLink:
    "No unlinked mortgages on the Properties sheet. Add the mortgage to a property first, or enter the terms below.",
  balanceHint:
    "The remaining balance starts from the start sum (plus fee) and follows the recorded payments. Re-sync it any time with Update balance in the row's … menu.",
  balanceHintStudent:
    "Record what you owe with Update balance in the row's … menu — the balance then follows the recorded payments.",
  create: "Create",

  // Update-balance modal.
  updateBalanceTitle: "Update balance",
  updateBalanceHint:
    "Enter the outstanding debt as of a date. The remaining balance at any date is calculated from the latest recorded balance and the payments since.",
  balanceLabel: "Outstanding balance",
  balancePlaceholder: "0",
  asOfLabel: "As of",
  balanceHistory: "Recorded balances",
  noBalanceHistory: "No balances recorded yet.",
  deleteBalanceAria: "Delete recorded balance",

  // Payments modal.
  paymentsTitle: "Payments",
  noPaymentsList: "No payments recorded yet.",
  deletePaymentAria: "Delete payment",
  deleteAllPayments: "Delete all",
  linkedPaymentsHint:
    "These payments are recorded on the linked mortgage and are shared with the Properties sheet.",

  // Import-payments modal.
  importTitle: "Import payments",
  importHint:
    "Tick the bank transactions to record as payments on {name}. Importing remembers the bank description, so matching charges on future imports attach automatically.",
  importEmpty:
    "No matching transactions found. Mark bank transactions with the {type} type (or import a statement that contains the loan's charges) and try again.",
  selectAll: "Select all",
  importSuggestedTitle: "Suggested similar payments",
  importSuggestedHint:
    "Other transactions with a matching bank description and a similar amount.",
  importTolerance: "Amount tolerance",
  importSuggestedEmpty: "No similar transactions within ±{pct}%.",
  importApplyType: "Mark the imported transactions with the {type} type",
  importApplyName: "Rename the imported transactions to {name}",
  importCountOne: "Import {n} payment",
  importCountOther: "Import {n} payments",
} as const;

export type LoansSheetCatalog = Widen<typeof loansSheet>;

export default loansSheet;
