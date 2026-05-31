import type { Widen } from "./_widen";

const cell = {
  descriptionPlaceholder: "Description",
  amountPlaceholder: "0",
  datePlaceholder: "Date",
  pickType: "Pick type",
  pickCategory: "Pick category",
  pickDate: "Pick date",
  clearValue: "Clear value",
  editRow: "Edit row",
  deleteRow: "Delete row",
  cannotDeleteHistory: "History entries can't be deleted",
  rowActions: "Row actions",
  moreActions: "More actions",
  recurring: "Recurring entry",
  makeRecurring: "Make recurring",
  editRecurring: "Edit recurring entry",
  split: "Split row",
  lineItems: "Line items",
  unknownItem: "Unknown item",
  copy: "Copy to other months",
  labelByPattern: "Label by pattern",
  labelByPatternTitle: "Label every history entry matching a wildcard pattern",
  labelSimilar: "Label similar",
  labelSimilarTitle:
    "Create a pattern that labels every entry whose description matches",
  editHistoryEntry: "Edit this history entry",
  editTransfer: "Edit transfer",
  markAsTransfer: "Mark as transfer",
  unmarkAsTransfer: "Unmark as transfer",
  markAsTransferTitle:
    "Flag this row as an inter-account transfer so the hide-transfers setting can suppress it",
  formulaResult: "= {value}",
  invalidFormula: "Invalid formula",
  placeholderEllipsis: "…",
  descriptionWith: "Description: {value}",
  addDescription: "Add description",
  originalFromBank: "Original from bank",
  pushToNextMonth: "Push to next fiscal month",
  pushToNextMonthTitle:
    "Treat this entry — and every other entry on the same day — as belonging to the next fiscal month",
  pushToPrevMonth: "Push to previous fiscal month",
  pushToPrevMonthTitle:
    "Treat this entry — and every other entry on the same day — as belonging to the previous fiscal month",
  resetMonthOverride: "Reset month override",
  shiftIndicatorNext: "Pushed to next fiscal month",
  shiftIndicatorPrev: "Pushed to previous fiscal month",
} as const;

export type CellCatalog = Widen<typeof cell>;

export default cell;
