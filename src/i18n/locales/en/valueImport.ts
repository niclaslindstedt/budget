import type { Widen } from "./_widen";

const valueImport = {
  // Universal CSV / Excel importer shared by every "update value over
  // time" modal (items, property, savings, loans, holdings, stock prices).
  title: "Import from file",
  trigger: "Import from file",
  dropHint: "Drop a CSV or Excel file here",
  browse: "Choose file",
  supported: "CSV or Excel (.xlsx)",
  instruction:
    "Click a column header to set it as the date or value column. The highlighted columns are previewed below the way they'll import.",
  dateColumn: "Date",
  pickBoth: "Pick a date column and a value column to continue.",
  readyOne: "1 value ready to import.",
  readyOther: "{count} values ready to import.",
  skipped: "{count} skipped",
  rowsShown: "Showing the first {shown} of {total} rows.",
  chooseDifferent: "Choose a different file",
  importOne: "Import 1 value",
  importOther: "Import {count} values",
  emptyFile: "This file has no rows to import.",
  unreadable: "Couldn't read this file. Try a CSV or .xlsx export.",
} as const;

export type ValueImportCatalog = Widen<typeof valueImport>;

export default valueImport;
