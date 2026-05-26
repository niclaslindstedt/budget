import type { Widen } from "./_widen";

const searchTransaction = {
  open: "Search transactions",
  title: "Search transactions",
  placeholder: "Search by description, type, category, or amount",
  emptyHint: "Start typing to search across every sheet.",
  noResults: "No matching transactions",
  resultAria: "Open {description} on {sheet}",
} as const;

export type SearchTransactionCatalog = Widen<typeof searchTransaction>;

export default searchTransaction;
