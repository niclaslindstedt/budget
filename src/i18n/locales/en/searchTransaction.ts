import type { Widen } from "./_widen";

const searchTransaction = {
  open: "Search entries",
  title: "Search entries",
  placeholder:
    "Search by description, bank text, company, type, category, or amount",
  clear: "Clear search",
  emptyHint: "Start typing to search across every sheet.",
  noResults: "No matching entries",
  resultAria: "Open {description} on {sheet}",
  bankLabel: "Bank",
  sortMenuAria: "Change sort order",
  sortMenuTitle: "Sort by",
  sortRelevance: "Relevance",
  sortDateDesc: "Date · Newest first",
  sortDateAsc: "Date · Oldest first",
  sortAmountDesc: "Amount · Highest first",
  sortAmountAsc: "Amount · Lowest first",
} as const;

export type SearchTransactionCatalog = Widen<typeof searchTransaction>;

export default searchTransaction;
