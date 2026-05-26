import type { Widen } from "./_widen";

const editRow = {
  title: "Edit row",
  titleRecurring: "Edit recurring row",
  scope: "Scope",
  scopeApplyTo: "Apply to",
  scopeJustThis: "Just this row",
  scopeJustThisDate: "Only this row ({date})",
  scopeThisAndFuture: "This row and all future",
  scopeAll: "All rows in the series",
  scopeAllAmountDisabled:
    "Amount stays locked under this scope — changing it would rewrite past, already-reconciled entries.",
  scopeAlwaysJustThis: "Date and completed always apply to this row only.",
  affectedRows: "Affected rows",
  affectedRowsCountOne: "{n} row will be updated",
  affectedRowsCountOther: "{n} rows will be updated",
  affectedRowsCurrent: "current",
  completed: "Completed",
  primaryIncomeTitle: "Primary income",
  primaryIncomeToggle: "Mark this series as primary income",
  primaryIncomeHelp:
    "When the salary lands a few days early (weekend / holiday) it gets pushed into the next fiscal month — together with every other entry on the same day. Set the real payday below so the app can tell early arrivals from on-time ones.",
  primaryIncomeAnchorDay: "Real payday (day of month)",
} as const;

export type EditRowCatalog = Widen<typeof editRow>;

export default editRow;
