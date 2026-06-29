import type { ImportHistoryCatalog } from "../en/importHistory";

const importHistory: ImportHistoryCatalog = {
  title: "Importera bankutdrag",
  titleInto: "Importera historik till {name}",
  dropHere: "Släpp din bankfil här",
  orChoose: "eller välj en fil",
  intro:
    "Släpp en bankfil nedan, eller klicka för att välja en. Stödda format: Skandiabanken (.xlsx), Swedbank (.xlsx), Bank Norwegian (.xlsx), ICA Banken (.csv).",
  dropFileOr: "Släpp fil här, eller",
  clickToPick: "klicka för att välja",
  fileTypes: ".xlsx, .csv",
  parsing: "Tolkar",
  fileContainedNoEntries: "Filen innehöll inga poster.",
  parsedAs: "Tolkad som {parser}",
  file: "Fil",
  bank: "Bank",
  range: "Intervall",
  accountColumn: "Konto",
  pickAccount: "Välj ett konto",
  newAccount: "Nytt konto",
  preview: "Förhandsvisning",
  previewCount: "{n} poster",
  newEntries: "Nya poster",
  duplicatesSkipped: "Dubbletter överhoppade",
  openingBalance: "Ingående saldo",
  confirm: "Importera",
  parseError: "Kunde inte läsa den här filen.",
  unknownBank: "Kunde inte identifiera banken.",
  pickParser: "Välj bankformat",
  pickFile: "Välj fil",
  overlapTitle: "Kontot har redan historik här",
  overlapHint:
    "{account} har redan bankhistorik från {start} till {end}, som överlappar denna import. Ett kontoutdrag hör till ett enda konto — säkerställ att du importerar till rätt konto.",
  overlapConfirm: "Importera ändå",
};

export default importHistory;
