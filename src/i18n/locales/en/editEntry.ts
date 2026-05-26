import type { Widen } from "./_widen";

const editEntry = {
  titleEdit: "Edit entry",
  titleEditSeries: "Edit recurring entry",
  titlePromote: "Promote to recurring",
  titlePromoteHistory: "Promote history entry to recurring",
  description: "Description",
  amount: "Amount",
  type: "Type",
  company: "Company",
  pickType: "Pick a type",
  scope: "Scope",
  scopeJustThis: "Just this entry",
  scopeJustThisDate: "Only this entry ({date})",
  scopeThisAndFuture: "This entry and all future",
  stopAfterDate: "Stop after a date (temporary change)",
  promoteToRecurring: "Make recurring",
  deleteEntry: "Delete entry",
  deleteSeries: "Delete series",
  makePositive: "Make positive",
  makeNegative: "Make negative",
  noDate: "no date",
  promoteHistoryHint:
    "Generate future entries for this merchant and label past entries from your imported history.",
  promoteHistoryFooter:
    "Past history entries that match this merchant will adopt the description and type above. The bank's original text is kept as-is — only the on-screen label changes.",
  applyToHistoricLabelOne: "Also apply this label and type to {n} past match",
  applyToHistoricLabelOther:
    "Also apply this label and type to {n} past matches",
  applyToHistoricDescription:
    "The bank's original text is kept as-is — only the on-screen label changes.",
  historicMatchesTitle: "Past matches",
  excludeHistoricHint: "Uncheck any past entry to skip relabelling it.",
  excludeHistoricAria: "Include {date} {description}",
  promoteIntro:
    "Generate future entries from this row using a recurrence rule. The current row stays as-is and joins the new series.",
  promoteBackfillOne:
    "{n} past entry in this account's bank history matches this description and will adopt the type and label above. The bank's original text is kept as-is.",
  promoteBackfillOther:
    "{n} past entries in this account's bank history match this description and will adopt the type and label above. The bank's original text is kept as-is.",
  addFutureEntries: "Add {n} future entry",
  addFutureEntriesPlural: "Add {n} future entries",
  shiftDaysBy: "Shift days by",
  shiftDaysByHint:
    "Nudge the date of every entry in the chosen scope. Use negative numbers to shift earlier.",
} as const;

export type EditEntryCatalog = Widen<typeof editEntry>;

export default editEntry;
