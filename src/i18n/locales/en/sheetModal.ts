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
