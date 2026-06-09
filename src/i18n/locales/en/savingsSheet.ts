import type { Widen } from "./_widen";

const savingsSheet = {
  title: "Savings",
  name: "Name",
  bank: "Bank",
  balance: "Balance",
  actions: "Actions",
  addAccount: "Add savings account",
  total: "Total",
  noAccounts: "No savings accounts yet. Add one with the button below.",
  glyphLabel: "{name} icon",
  editAria: "Edit {name}",
  editTitle: "Edit savings account",
  deleteAria: "Delete {name}",
  deleteTitle: "Delete savings account",
  deleteConfirm:
    "Delete {name}? Its recorded balance history is removed, along with any transactions and transfers tied to it.",
  updateBalance: "Update balance",
  importHistory: "Import history",
  viewHistory: "View history",
  cutHistory: "Cut history",
  noHistory: "No transactions imported yet",
  nothingToCut: "No history or transactions to cut",

  // Create / edit modal.
  newTitle: "New savings account",
  namePlaceholder: "e.g. Buffer",
  description: "Description",
  bankPlaceholder: "e.g. Example Bank",
  clearing: "Clearing",
  accountNumber: "Account number",
  currentBalance: "Current balance",
  create: "Create",

  // Update-balance modal.
  updateBalanceTitle: "Update balance",
  balanceLabel: "Balance",
  balancePlaceholder: "0",
  asOfLabel: "As of",
  balanceHistory: "Balance history",
  noBalanceHistory: "No balances recorded yet.",
  deleteBalanceAria: "Delete recorded balance",
} as const;

export type SavingsSheetCatalog = Widen<typeof savingsSheet>;

export default savingsSheet;
