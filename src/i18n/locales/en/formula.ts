import type { Widen } from "./_widen";

const formula = {
  helpTitle: "Formula help",
  helpAria: "Formula help",
  helpButtonTitle: "What can I write here?",
  inputPlaceholder: "= sum of …",
  variables: "Variables",
  variablesDropdown: "Variables",
  variablesIntro: "Each variable reads from the row's own month. Pick from the",
  variablesIntroEnd:
    "dropdown to insert one — it renders as an orange pill that backspace removes in one step.",
  otherSheets: "Other sheets",
  otherSheetsIntro: "Read a variable from a different sheet:",
  otherSheetsAfter:
    "The sheet name renders as a cyan pill, the variable as an orange pill — both are single-character deletions.",
  functions: "Functions",
  operators: "Operators",
  examples: "Examples",
  invalid: "Invalid formula",
  pickVariable: "Pick a variable",
  insertVariable: "Insert variable",
  summary:
    "A formula computes the row's amount at render time. Numbers, arithmetic, parentheses, variables, and the functions below all work.",
  endOfMonthBalanceHint: "— closing balance",
  balanceBeforeHint: "— running balance just before this row",
  currentSheetSection: "Current sheet",
  crossSheetSection: "Cross-sheet",
  insertVariableAria: "Insert formula variable or function",
  insertVariableTitle: "Insert a formula variable or function",
  variablesButtonLabel: "Variables",
  thisSheet: "This sheet",
  functionsSection: "Functions",
  sheetSectionPrefix: "Sheet ·",
} as const;

export type FormulaCatalog = Widen<typeof formula>;

export default formula;
