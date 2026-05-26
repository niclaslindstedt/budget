import type { Widen } from "./_widen";

const download = {
  budgetTitle: "Download {name}",
  accountsTitle: "Download accounts",
  downloadBudget: "Download budget",
  downloadAccountData: "Download account data",
  formatLabel: "Format",
  contentsLabel: "Include",
  includeHistory: "Past entries (history)",
  includeFuture: "Upcoming entries",
  noHistoryHint: "This sheet has no imported history",
  includeTransactionsAll: "Include transactions",
  includeUnconfirmed: "Include unconfirmed entries",
  includeFutureEntries: "Include future entries",
  noAccountsToExport: "No accounts to include yet.",
  submit: "Download",
  column: {
    account: "Account",
    accountInfo: "Account info",
    transactions: "Transactions",
  },
  accountInfoFor: "Include account info for {name}",
  accountTransactionsFor: "Include transactions for {name}",
  format: {
    csv: "CSV (.csv)",
    xlsx: "Excel (.xlsx)",
  },
} as const;

export type DownloadCatalog = Widen<typeof download>;

export default download;
