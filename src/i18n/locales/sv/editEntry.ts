import type { EditEntryCatalog } from "../en/editEntry";

const editEntry: EditEntryCatalog = {
  titleEdit: "Redigera post",
  titleEditSeries: "Redigera återkommande post",
  titlePromote: "Gör återkommande",
  titlePromoteHistory: "Befordra historikpost till återkommande",
  description: "Beskrivning",
  amount: "Belopp",
  amountModeExact: "Exakt",
  amountModeEstimate: "Uppskattning",
  amountModeExactHint: "Ett enda, känt belopp",
  amountModeEstimateHint:
    "Ett intervall — för räkningar som varierar mellan månader",
  amountMin: "Minst",
  amountEstimate: "Uppskattning",
  amountMax: "Mest",
  amountMinPlaceholder: "Min",
  amountEstimatePlaceholder: "Uppskattn.",
  amountMaxPlaceholder: "Max",
  type: "Typ",
  company: "Företag",
  tags: "Taggar",
  pickType: "Välj en typ",
  scope: "Omfattning",
  scopeJustThis: "Bara denna post",
  scopeJustThisDate: "Endast denna post ({date})",
  scopeThisAndFuture: "Denna post och alla framtida",
  stopAfterDate: "Stoppa efter ett datum (tillfällig ändring)",
  promoteToRecurring: "Gör återkommande",
  deleteEntry: "Ta bort post",
  deleteSeries: "Ta bort serie",
  makePositive: "Gör positiv",
  makeNegative: "Gör negativ",
  noDate: "inget datum",
  promoteHistoryHint:
    "Generera framtida poster för den här handlaren och etikettera tidigare poster från din importerade historik.",
  promoteHistoryFooter:
    "Tidigare historikposter som matchar denna handlare tar över beskrivningen och typen ovan. Bankens originaltext behålls — endast etiketten på skärmen ändras.",
  applyToHistoricLabelOne:
    "Tillämpa även etiketten och typen på {n} tidigare matchning",
  applyToHistoricLabelOther:
    "Tillämpa även etiketten och typen på {n} tidigare matchningar",
  applyToHistoricDescription:
    "Bankens originaltext behålls — endast etiketten på skärmen ändras.",
  historicMatchesTitle: "Tidigare matchningar",
  excludeHistoricHint:
    "Avmarkera en tidigare post för att hoppa över ometiketteringen.",
  excludeHistoricAria: "Inkludera {date} {description}",
  promoteIntro:
    "Generera framtida poster från denna rad enligt en upprepningsregel. Den nuvarande raden behålls som den är och ingår i den nya serien.",
  promoteBackfillOne:
    "{n} tidigare post i kontots bankhistorik matchar denna beskrivning och kommer att överta typen och etiketten ovan. Bankens originaltext behålls.",
  promoteBackfillOther:
    "{n} tidigare poster i kontots bankhistorik matchar denna beskrivning och kommer att överta typen och etiketten ovan. Bankens originaltext behålls.",
  addFutureEntries: "Lägg till {n} framtida post",
  addFutureEntriesPlural: "Lägg till {n} framtida poster",
  shiftDaysBy: "Förskjut datum med",
  shiftDaysByHint:
    "Justera datumet på alla poster i den valda omfattningen. Ange ett negativt tal för att flytta tidigare.",
};

export default editEntry;
