import type { Widen } from "./_widen";

const bulkEdit = {
  title: "Edit {n} entries",
  titleOne: "Edit entry",
  description: "Description",
  descriptionUnchanged: "Leave unchanged",
  amount: "Amount",
  date: "Date",
  type: "Type",
  apply: "Apply to {n}",
  applyOne: "Apply",
  hint: "Empty fields are left as-is.",
  changeType: "Change type",
  changeTags: "Change tags",
  changeTagsHint: "Replaces the tags on every selected row with this set.",
  changeDate: "Change date",
  changeAmount: "Change amount",
  sharedAmountHint: "All {n} rows share {amount}",
  differentAmountsHint:
    "Selected rows have different amounts — edit each row individually to change them.",
  makeEachRecurring: "Make each recurring",
  makeEachRecurringHint:
    "Replicate every selected row at the dates below; each becomes its own series.",
  markAsTransfer: "Mark / unmark as transfer",
  markAsTransferHint:
    "When the hide-transfers setting is on, transfer rows are suppressed from the budget table. The amount still feeds the running balance.",
  markAsTransferOn: "Mark every selected row as a transfer",
  markAsTransferOff: "Unmark every selected row",
} as const;

export type BulkEditCatalog = Widen<typeof bulkEdit>;

export default bulkEdit;
