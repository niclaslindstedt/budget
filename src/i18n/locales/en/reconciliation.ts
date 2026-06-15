import type { Widen } from "./_widen";

const reconciliation = {
  title: "Match imported entries",
  nothingToTriage:
    "Nothing left to triage — every imported entry either has a stable id or already matches a learned series rule.",
  probableMatches: "Probable matches",
  predictionsThatDidntPost: "Predictions that didn't post",
  skipAll: "Skip all",
  applyToSeries: "Apply to whole series",
  seriesRuleQueued: "Series rule queued",
  keep: "Keep",
  deleteRow: "Delete",
  moveTo: "Move to",
  moveToNextMonthStart: "Next month start",
  moveToNextMonthSameDate: "Next month, same date",
  monthCoveredHeader: "{month}",
  monthCoveredSubtitle: "fully covered by bank history",
  bulkKeepAll: "Keep all",
  bulkDeleteAll: "Delete all",
  bulkMoveAllToNextMonthStart: "Move all to next month start",
  infoAria: "About predictions that didn't post",
  hint: "Match imported bank entries against rows you predicted.",
  matched: "Matched",
  orphans: "Unmatched predictions",
  orphanHint:
    "These months are now fully covered by your bank history. The rows below didn't post — delete them or move them to a later date.",
  nothingToDo: "Nothing to reconcile.",
  bankSide: "Bank",
  rowSide: "Predicted",
  confirmTitle: "Apply reconciliation?",
  confirmHint: "{n} rows will be deleted and {m} will be moved.",
} as const;

export type ReconciliationCatalog = Widen<typeof reconciliation>;

export default reconciliation;
