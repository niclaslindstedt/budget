import type { ImportExportCatalog } from "../en/importExport";

const importExport: ImportExportCatalog = {
  importJson: "Importera JSON",
  exportJson: "Exportera JSON",
  importBank: "Importera bankutdrag",
  confirmReplaceTitle: "Ersätta din budget?",
  confirmReplaceHint:
    "Den aktuella budgeten ersätts av innehållet i den här filen.",
  importFailed: "Kunde inte läsa filen.",
  importedOk: "Importerad.",
  exportFilename: "budget-{date}.json",
  exportLabel: "Exportera",
  exportEncryptedLabel: "Exportera (krypterad)",
  exportEncryptedAria: "Exportera budget som krypterad JSON",
  exportAria: "Exportera budget som JSON",
  importAria: "Importera budget från JSON",
  importLabel: "Importera",
  exported: "Exporterad.",
  exportedEncrypted: "Exporterad (krypterad).",
  importedSheets: "Importerade {n} blad.",
  importedSheetsPlural: "Importerade {n} blad.",
  migratedSuffix: " (migrerad till aktuell version)",
  importFailedWith: "Import misslyckades — {error}",
  noPasswordInMemory: "Inget kontolösenord i minnet — logga in igen.",
  encryptionFailed: "Kryptering misslyckades: {error}",
  couldNotReadFile: "Kunde inte läsa filen: {error}",
  encryptedBudget: "Krypterad budget",
  encryptedBudgetHint:
    "Den här filen är krypterad. Ange lösenordet den exporterades med.",
  decrypting: "Dekrypterar…",
  decryptAndImport: "Dekryptera och importera",
};

export default importExport;
