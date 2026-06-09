import type { Widen } from "./_widen";

const loansSheet = {
  title: "Loans",
  name: "Name",
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
  importPayments: "Import payments",
  viewPayments: "View payments",
  noPayments: "No payments recorded yet",

  // Create / edit modal.
  newTitle: "New loan",
  namePlaceholder: "e.g. Car loan",
  description: "Description",
  kind: "Type of loan",
  startDate: "Start date",
  startSum: "Start sum",
  monthlyPayment: "Monthly payment",
  rateLabel: "Interest rate (%/year)",
  startFee: "Setup fee",
  optionalHint: "Optional",
  lenderName: "Lender (person)",
  lenderNamePlaceholder: "e.g. Alex",
  company: "Lender",
  linkMortgage: "Link a property mortgage",
  linkNone: "Not linked — enter terms below",
  linkedHint:
    "Terms, payments and balance come from the linked mortgage on the Properties sheet. Edit them there.",
  noMortgagesToLink:
    "No unlinked mortgages on the Properties sheet. Add the mortgage to a property first, or enter the terms below.",
  create: "Create",

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
  importCountOne: "Import {n} payment",
  importCountOther: "Import {n} payments",
} as const;

export type LoansSheetCatalog = Widen<typeof loansSheet>;

export default loansSheet;
