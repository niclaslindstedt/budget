import type { Widen } from "./_widen";

const sheetModal = {
  titleNew: "New sheet",
  titleEdit: "Edit sheet",
  name: "Name",
  namePlaceholder: "Checking, Travel fund, Child account…",
  type: "Type",
  typeBudget: "Budget",
  typeAccountsOverview: "Accounts overview",
  accountsHint:
    "The Accounts sheet is a workspace-wide dashboard. Manage accounts and transfers from there — no per-sheet account binding needed.",
  itemsHint:
    "The Items sheet lists everything you own, with what each thing cost and what it's worth now. Add items from there — no per-sheet account binding needed.",
  propertiesHint:
    "The Properties sheet tracks the homes and apartments you own — what each cost, what it's worth now, and the mortgages against it. Add properties from there; each mortgage binds its own account for finding payments.",
  loansHint:
    "The Loans sheet tracks the money you owe — student loans, car loans, mortgages, borrowed money — and the payments made on each. Add loans from there; a mortgage can link a property's mortgage so the two sheets always agree.",
  insightsHint:
    "The Insights sheet reads everything you already track — accounts, savings, items, properties, loans — and turns it into the big picture, starting with your net worth. Nothing to add here; it follows the other sheets.",
  scenariosHint:
    "The Scenarios sheet plays what-if futures against a budget you already track — lose a job, buy a car — without ever changing the real budget.",
  baseBudgetHint:
    "The budget sheet the scenarios model on. Your real budget is never changed.",
  baseChangeWarning:
    "Changing the base budget clears every scenario's changes (they belong to the old budget's rows). Scenario names are kept.",
  salaryAccountHint:
    "The account your salary is paid into. “Find salaries” scans this account’s bank history for paychecks. Use one salary sheet per person, each bound to that person’s pay account.",
  color: "Color",
  glyph: "Icon",
  account: "Account",
  newAccountName: "New account name",
  newAccountPlaceholder: "Checking, Cash, Travel fund…",
  accountHint:
    "Attach this budget to an account so its running balance can reflect the account's real balance. Leave it unassigned for a free-standing forward-looking ledger.",
  descriptionPlaceholder: "Optional. e.g. expenses for child account.",
  description: "Description",
  pickAccount: "Pick an account",
  noAccount: "No account",
  newAccount: "New account",
  alreadyExists: "Already exists",
  deleteTitle: "Delete sheet?",
  deleteHint: "The rows in this sheet are dropped. This cannot be undone.",
  deleteThisSheet: "Delete this sheet",
  cantDeleteLast: "Can't delete the only sheet",
  create: "Create",
} as const;

export type SheetModalCatalog = Widen<typeof sheetModal>;

export default sheetModal;
