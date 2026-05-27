import type { Widen } from "./_widen";

const searchTransaction = {
  open: "Search entries",
  title: "Search entries",
  placeholder: "Search by description, type, category, or amount",
  clear: "Clear search",
  emptyHint: "Start typing to search across every sheet.",
  noResults: "No matching entries",
  resultAria: "Open {description} on {sheet}",
} as const;

export type SearchTransactionCatalog = Widen<typeof searchTransaction>;

export default searchTransaction;
