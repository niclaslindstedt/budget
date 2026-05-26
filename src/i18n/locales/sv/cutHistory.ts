import type { CutHistoryCatalog } from "../en/cutHistory";

const cutHistory: CutHistoryCatalog = {
  title: "Klipp historik — {name}",
  hint: "Ta bort permanent importerade historikposter och överföringstransaktioner för det här kontot som är daterade före brytdatumet. Det aktuella saldot bevaras — bara raderna i historiken försvinner. Användbart när kontots syfte har ändrats och den gamla aktiviteten inte längre är relevant.",
  cutoffDate: "Brytdatum",
  pickDateFirst: "Välj ett brytdatum för förhandsvisning.",
  nothingToCut: "Inget att klippa före {date}.",
  preview: "Klippning vid {date} tar bort:",
  previewHistoryOne: "{n} historikpost",
  previewHistoryOther: "{n} historikposter",
  previewTransactionsOne: "{n} överföringstransaktion",
  previewTransactionsOther: "{n} överföringstransaktioner",
  irreversible: "Detta kan inte ångras.",
  confirm: "Klipp historik",
};

export default cutHistory;
