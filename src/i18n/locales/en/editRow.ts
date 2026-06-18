import type { Widen } from "./_widen";

const editRow = {
  title: "Edit entry",
  titleRecurring: "Edit recurring entry",
  scope: "Scope",
  scopeApplyTo: "Apply to",
  scopeJustThis: "Just this entry",
  scopeJustThisDate: "Only this entry ({date})",
  scopeThisAndFuture: "This entry and all future",
  scopeAll: "All entries in the series",
  scopeAllAmountDisabled:
    "Amount stays locked under this scope — changing it would rewrite past, already-reconciled entries.",
  scopeAlwaysJustThis: "Date and completed always apply to this row only.",
  scopeFutureDateShift:
    "Completed applies to this row only. Changing the date slides every upcoming entry by the same number of days.",
  affectedRows: "Affected rows",
  affectedRowsCountOne: "{n} entry will be updated",
  affectedRowsCountOther: "{n} entries will be updated",
  affectedRowsCurrent: "current",
  completed: "Completed",
  isTransfer: "Mark as transfer",
  primaryIncomeTitle: "Primary income",
  primaryIncomeToggle: "Mark this series as primary income",
  primaryIncomeHelp:
    "When the salary lands a few days early (weekend / holiday) it gets pushed into the next fiscal month — together with every other entry on the same day. Set the real payday below so the app can tell early arrivals from on-time ones.",
  primaryIncomeAnchorDay: "Real payday (day of month)",
} as const;

export type EditRowCatalog = Widen<typeof editRow>;

export default editRow;
