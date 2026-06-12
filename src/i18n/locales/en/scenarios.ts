import type { Widen } from "./_widen";

const scenarios = {
  // Base-budget binding (empty state + picker).
  pickBaseTitle: "Pick a base budget",
  pickBaseBody:
    "Scenarios play what-if futures against a budget you already track. Pick the budget sheet to model on — your real budget is never changed.",
  pickBaseLabel: "Base budget",
  noBaseOption: "No base budget",
  changeBaseAction: "Change base budget",
  changeBaseConfirm:
    "Changing the base budget clears every scenario's changes (they belong to the old budget's rows). Scenario names are kept. Continue?",
  noBudgetSheets: "There are no budget sheets to model on yet.",

  // Scenario tabs.
  baselineTab: "Baseline",
  addScenario: "New scenario",
  defaultName: "Scenario {n}",
  renameScenario: "Rename scenario",
  deleteScenario: "Delete scenario",
  deleteConfirm: "Delete scenario “{name}”? Its changes are lost.",
  scenarioName: "Name",
  scenarioTabsLabel: "Scenarios",

  // Visualize modal (the chart).
  visualizeAction: "Visualize scenarios",
  chartEmpty: "Not enough dated rows in the base budget to chart yet.",
  legendLabel: "Toggle series",
  legendToggleAria: "Toggle {name} in the chart",

  // Monitors.
  monitorsTitle: "Balance monitors",
  monitorsIntro: "How much money is left on a date that matters.",
  addMonitor: "Add monitor",
  removeMonitor: "Remove monitor for {date}",
  monitorDateLabel: "Monitor date",
  noMonitors: "No monitor dates yet. Add one to track a date that matters.",

  // Month tables (the budget-like screen).
  baselineReadOnly:
    "The Baseline is your budget as-is. Switch to a scenario to make changes.",
  showEarlierMonths: "Show earlier months",
  hideEarlierMonths: "Hide earlier months",
  monthEmpty: "No rows in {month}.",
  excludeRow: "Exclude {name} in this scenario",
  includeRow: "Include {name} again",
  revertOverride: "Revert change to {name}",
  editAmountAria: "Change amount of {name} in this scenario",
  addRow: "Add row",
  addedRowBadge: "Added in this scenario",
  editAddedRow: "Edit added row",

  // Series sweeps (ApplySeriesDialog bodies for the exclude / include
  // toggles on a recurring base row).
  excludeSeriesBody:
    "This entry ({date}) was excluded from the scenario. Exclude all following entries in its recurring series too?",
  includeSeriesBody:
    "This entry ({date}) was included again. Include all following entries in its recurring series too?",

  // Adjust-amount modal (live modulation of a base amount).
  modulateRow: "Adjust amount of {name}",
  modulateTitle: "Adjust amount",
  modulateBody:
    "The adjustment stays linked to your budget — if the entry's amount changes there, this scenario follows automatically.",
  modulateOpLabel: "Adjustment",
  modulateOpAdd: "Add amount",
  modulateOpSubtract: "Subtract amount",
  modulateOpMultiply: "Multiply by",
  modulateOpPercent: "Change by percent",
  modulateValueLabel: "Value",
  modulateRemove: "Remove adjustment",

  // Added-row modal.
  rowModalTitleAdd: "New scenario row",
  rowModalTitleEdit: "Edit scenario row",
  rowDate: "Date",
  rowDescription: "Description",
  rowAmount: "Amount",
  rowRecurrence: "Date(s)",
  rowDelete: "Delete row",
  addRowsOne: "Add {n} row",
  addRowsOther: "Add {n} rows",

  // Delete scope for a recurring added row.
  deleteRecurringTitle: "Delete recurring row?",
  deleteRecurringBody:
    "This row is part of a recurring series added by this scenario.",
  deleteJustThis: "Just this row",
  deleteThisAndFuture: "This and all future rows ({n})",

  // Diff modal.
  diffAction: "View changes",
  diffTitle: "Changes in {name}",
  diffEmpty: "This scenario has no changes yet — it matches the baseline.",
  diffExcludedBadge: "excluded",
  diffAddedBadge: "added",
} as const;

export type ScenariosCatalog = Widen<typeof scenarios>;

export default scenarios;
