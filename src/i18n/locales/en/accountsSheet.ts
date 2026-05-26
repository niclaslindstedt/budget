import type { Widen } from "./_widen";

const accountsSheet = {
  title: "Accounts",
  edit: "Edit {name}",
  editSheet: "Edit sheet",
  name: "Name",
  bank: "Bank",
  balance: "Balance",
  date: "Date",
  description: "Description",
  transfer: "Transfer",
  amount: "Amount",
  history: "History",
  addAccount: "Add account",
  grandTotal: "Total",
  noAccounts: "No accounts yet. Add one with the button below.",
  noTransfers:
    "No transfers yet. Promote a budget row to a transfer, or use the button below.",
  glyphLabel: "{name} icon",
  transfers: "Transfers",
  updateBalanceAria: "Update balance for {name}",
  updateBalanceTitle: "Update balance",
  importHistoryAria: "Import history into {name}",
  importHistoryTitle: "Import bank history",
  viewHistoryAria: "View history for {name}",
  viewTransactionsTitle: "View transactions",
  noHistoryImported: "No history imported yet",
  viewHistoryEntries: "View {n} history entries",
  editAccountAria: "Edit {name}",
  editAccountTitle: "Edit account",
  deleteAccountAria: "Delete {name}",
  deleteAccountTitle: "Delete account",
  cutHistoryAria: "Cut history for {name}",
  cutHistoryTitle: "Cut history",
  nothingToCut: "No history or transactions to cut",
  moreActionsAria: "More actions for {name}",
  moreActions: "More actions",
  historyCountHeader: "Transactions",
  historyCountTitle: "Imported transactions",
  newTransfer: "New transfer",
  needTwoAccounts: "Add at least two accounts to record a transfer",
  editTransferAria: "Edit transfer: {description}",
  unknown: "Unknown",
} as const;

export type AccountsSheetCatalog = Widen<typeof accountsSheet>;

export default accountsSheet;
