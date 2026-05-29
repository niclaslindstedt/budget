import type { Widen } from "./_widen";

const searchTransaction = {
  open: "Search",
  title: "Search",
  placeholder:
    "Search by description, bank text, company, type, category, or amount",
  clear: "Clear search",
  emptyHint: "Start typing to search across every sheet.",
  noResults: "No matching entries",
  resultAria: "Open {description} on {sheet}",
  bankLabel: "Bank",
  tagsLabel: "Tags",
  sortMenuAria: "Change sort order",
  sortMenuTitle: "Sort by",
  sortRelevance: "Relevance",
  sortDateDesc: "Date · Newest first",
  sortDateAsc: "Date · Oldest first",
  sortAmountDesc: "Amount · Highest first",
  sortAmountAsc: "Amount · Lowest first",
  filterMenuAria: "Filter results",
  filterMenuTitle: "Filters",
  filterExcludeTransfers: "Exclude transfers",
  filterExcludeHistory: "Exclude history",
  filterExcludeUnconfirmed: "Exclude unconfirmed",
  filterSheets: "Sheets",
  filterSheetsAll: "No sheets selected — searching all.",
  filterAmount: "Amount",
  filterAmountMin: "Minimum amount",
  filterAmountMax: "Maximum amount",
  filterDates: "Dates",
  filterDateMin: "Earliest date",
  filterDateMax: "Latest date",
  filterReset: "Reset filters",
} as const;

export type SearchTransactionCatalog = Widen<typeof searchTransaction>;

export default searchTransaction;
