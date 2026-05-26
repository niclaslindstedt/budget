import type { Widen } from "./_widen";

const importHistory = {
  title: "Import bank statement",
  titleInto: "Import history into {name}",
  dropHere: "Drop your bank file here",
  orChoose: "or choose a file",
  intro:
    "Drop a bank statement file below, or click to pick one. Currently supported: Skandiabanken (.xlsx), Swedbank (.xlsx), Bank Norwegian (.xlsx), ICA Banken (.csv).",
  dropFileOr: "Drop file here, or",
  clickToPick: "click to pick",
  fileTypes: ".xlsx, .csv",
  parsing: "Parsing",
  fileContainedNoEntries: "File contained no entries.",
  parsedAs: "Parsed as {parser}",
  file: "File",
  bank: "Bank",
  range: "Range",
  accountColumn: "Account",
  pickAccount: "Pick an account",
  newAccount: "New account",
  preview: "Preview",
  previewCount: "{n} entries",
  newEntries: "New entries",
  duplicatesSkipped: "Duplicates skipped",
  openingBalance: "Opening balance",
  confirm: "Import",
  cancel: "Cancel",
  parseError: "Could not read this file.",
  unknownBank: "Could not detect the bank.",
  pickParser: "Choose bank format",
  pickFile: "Choose file",
} as const;

export type ImportHistoryCatalog = Widen<typeof importHistory>;

export default importHistory;
