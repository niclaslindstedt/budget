import type { Widen } from "./_widen";

const importExport = {
  importJson: "Import JSON",
  exportJson: "Export JSON",
  importBank: "Import bank statement",
  confirmReplaceTitle: "Replace your budget?",
  confirmReplaceHint:
    "The current budget will be replaced by the contents of this file.",
  importFailed: "Could not read this file.",
  importedOk: "Imported.",
  exportFilename: "budget-{date}.json",
  exportLabel: "Export",
  exportEncryptedLabel: "Export (encrypted)",
  exportEncryptedAria: "Export budget as encrypted JSON",
  exportAria: "Export budget as JSON",
  importAria: "Import budget from JSON",
  importLabel: "Import",
  exported: "Exported.",
  exportedEncrypted: "Exported (encrypted).",
  importedSheets: "Imported {n} sheet.",
  importedSheetsPlural: "Imported {n} sheets.",
  migratedSuffix: " (migrated to current version)",
  importFailedWith: "Import failed — {error}",
  noPasswordInMemory: "No account password held in memory — sign in again.",
  encryptionFailed: "Encryption failed: {error}",
  couldNotReadFile: "Could not read file: {error}",
  encryptedBudget: "Encrypted budget",
  encryptedBudgetHint:
    "This file is encrypted. Enter the password it was exported with.",
  decrypting: "Decrypting…",
  decryptAndImport: "Decrypt & import",
} as const;

export type ImportExportCatalog = Widen<typeof importExport>;

export default importExport;
