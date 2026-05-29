import type { Widen } from "./_widen";

const complex = {
  title: "Add categorised entry",
  titleNew: "New entry",
  description: "Description",
  descriptionPlaceholder: "Rent, Spotify, Salary…",
  amount: "Amount",
  amountPlaceholder: "1200",
  type: "Type",
  company: "Company",
  tags: "Tags",
  isTransfer: "Mark as transfer",
  pickType: "Pick a type",
  schedule: "Schedule",
  once: "Once",
  recurring: "Recurring",
  addRows: "Add {n} rows",
  addRow: "Add 1 row",
  addRowsPlural: "Add {n} rows",
  addRowsNone: "rows",
  promoteCandidate: "Promote candidate",
  promoteVerb: "Promote",
  recurrence: "Recurrence",
  fxSwitchToFixed: "Switch back to a fixed amount",
  fxUseFormula: "Use a formula instead of a fixed amount",
  formulaPlaceholder: "endOfMonthBalance - 5000",
  amountFormula: "Amount formula",
  formulaEvaluatedHint: "Formula evaluated per row at render time.",
  rowOne: "{n} row",
  rowOther: "{n} rows",
  rowsPlaceholder: "rows",
} as const;

export type ComplexCatalog = Widen<typeof complex>;

export default complex;
