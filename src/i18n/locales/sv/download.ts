import type { DownloadCatalog } from "../en/download";

const download: DownloadCatalog = {
  budgetTitle: "Ladda ner {name}",
  accountsTitle: "Ladda ner konton",
  downloadBudget: "Ladda ner budget",
  downloadAccountData: "Ladda ner kontodata",
  formatLabel: "Format",
  contentsLabel: "Inkludera",
  includeHistory: "Historik (tidigare poster)",
  includeFuture: "Kommande poster",
  noHistoryHint: "Det här bladet har ingen importerad historik",
  includeTransactionsAll: "Inkludera transaktioner",
  includeUnconfirmed: "Inkludera obekräftade poster",
  includeFutureEntries: "Inkludera framtida poster",
  noAccountsToExport: "Inga konton att inkludera ännu.",
  submit: "Ladda ner",
  column: {
    account: "Konto",
    accountInfo: "Kontoinfo",
    transactions: "Transaktioner",
  },
  accountInfoFor: "Inkludera kontoinfo för {name}",
  accountTransactionsFor: "Inkludera transaktioner för {name}",
  format: {
    csv: "CSV (.csv)",
    xlsx: "Excel (.xlsx)",
  },
};

export default download;
