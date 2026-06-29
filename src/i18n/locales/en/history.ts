import type { Widen } from "./_widen";

const history = {
  title: "History",
  titleAccount: "History · {name}",
  titleForAccount: "History — {name}",
  importedAt: "Imported {date}",
  rangePrefix: "Range:",
  addedCount: "{n} added",
  duplicateCount: "{n} duplicate",
  noEntries: "No history yet. Import a bank statement to populate this view.",
  noEntriesForMonth: "No history for {month}.",
  showCollapsed: "Show collapsed pairs",
  promoteToRecurring: "Promote to recurring",
  deleteEntry: "Delete entry",
  deleteEntryTitle: "Delete history entry?",
  deleteEntryHint: "The bank's record is dropped from this device.",
  matchRulePromote: "Create rule for this",
  bankColumn: "From bank",
  label: "Label",
  importLabel: "Import",
  date: "Date",
  description: "Description",
  amount: "Amount",
  balance: "Balance",
  actions: "Actions",
  type: "Type",
  searchPlaceholder: "Search history",
  searchNoResults: "No entries match the search.",
} as const;

export type HistoryCatalog = Widen<typeof history>;

export default history;
