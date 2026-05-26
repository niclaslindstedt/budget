import type { Widen } from "./_widen";

const cutHistory = {
  title: "Cut history — {name}",
  hint: "Permanently delete imported bank-history entries and transfer transactions for this account dated before the cutoff. The current balance is preserved — only the per-row history is dropped. Useful when the account's purpose has changed and the old activity is no longer relevant.",
  cutoffDate: "Cutoff date",
  pickDateFirst: "Pick a cutoff date to preview.",
  nothingToCut: "Nothing to cut before {date}.",
  preview: "Cutting at {date} will drop:",
  previewHistoryOne: "{n} history entry",
  previewHistoryOther: "{n} history entries",
  previewTransactionsOne: "{n} transfer transaction",
  previewTransactionsOther: "{n} transfer transactions",
  irreversible: "This cannot be undone.",
  confirm: "Cut history",
} as const;

export type CutHistoryCatalog = Widen<typeof cutHistory>;

export default cutHistory;
