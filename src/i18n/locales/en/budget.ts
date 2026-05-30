import type { Widen } from "./_widen";

// Budget-page strings: anything the per-account ledger renders
// inside a budget sheet — rows, balances, column headers, month
// strip, the budget viewer, transfer-collapse banners, balance
// corrections. Sheet-meta strings (the chrome around any page)
// live in sheet.ts.

const budget = {
  addRow: "Add row",
  addRowLong: "Add row (long-press for recurring or categorised entry)",
  addRowAria: "Add row",
  addRecurring: "Add recurring entry",
  addCategorised: "Add categorised entry",
  openingBalance: "Opening balance",
  closingBalance: "Closing balance",
  runningBalance: "Running balance",
  monthTotal: "Month total",
  noRows: "No entries yet.",
  addFirstRow: "Add your first row above.",
  completed: "Completed",
  notCompleted: "Not completed",
  pendingCount: "{n} pending",
  completedCount: "{n} completed",
  deleteRowsTitle: "Delete {n} rows?",
  deleteRowTitle: "Delete row?",
  deleteRowHint: "This cannot be undone.",
  selectedCount: "{n} selected",
  selectRow: "Select row",
  deselectRow: "Deselect row",
  description: "Description",
  amount: "Amount",
  balance: "Balance",
  date: "Date",
  type: "Type",
  category: "Category",
  actions: "Actions",
  column: "Column",
  addColumn: "Add column",
  removeColumn: "Remove column",
  reorderHint: "Drag to reorder",
  monthEmpty: "Nothing scheduled for {month}.",
  hiddenEmptyMonths: "Empty months are hidden. Add a row to bring one back.",
  showEmptyMonths: "Show empty months",
  hideEmptyMonths: "Hide empty months",
  viewerEmpty: "No entries to display.",
  viewerSearchPlaceholder: "Search this sheet",
  viewerSearchNoResults: "No entries match the search.",
  viewerFilterHideTransfers: "Hide transfers",
  viewerFilterHideUncompleted: "Hide uncompleted",
  showEarlierMonths: "Show {n} earlier months",
  showFutureMonths: "Show {n} future months",
  rowActions: "row actions",
  selectAllInMonth: "Select all in month",
  expandMonth: "Expand {month}",
  collapseMonth: "Collapse {month}",
  deselectAllInMonth: "Deselect all rows in month",
  selectAllRowsInMonth: "Select all rows in month",
  historyCoversMonth: "History covers this month",
  triageInCoveredMonthOne: "1 orphan",
  triageInCoveredMonthOther: "{n} orphans",
  undated: "Undated",
  correctionLine: "balance correction",
  correctionRemoveAria: "Remove balance correction of {amount}",
  hiddenTransferOne: "{n} hidden transfer",
  hiddenTransferOther: "{n} hidden transfers",
  expandHiddenTransfers: "Show hidden transfers behind this balance",
  collapseHiddenTransfers: "Hide transfers again",
} as const;

export type BudgetCatalog = Widen<typeof budget>;

export default budget;
