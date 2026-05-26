import type { HistoryCatalog } from "../en/history";

const history: HistoryCatalog = {
  title: "Historik",
  titleAccount: "Historik · {name}",
  titleForAccount: "Historik — {name}",
  importedAt: "Importerad {date}",
  rangePrefix: "Intervall:",
  addedCount: "{n} tillagda",
  duplicateCount: "{n} dubbletter",
  noEntries:
    "Ingen historik än. Importera ett bankutdrag för att fylla denna vy.",
  noEntriesForMonth: "Ingen historik för {month}.",
  showCollapsed: "Visa sammanslagna par",
  promoteToRecurring: "Gör återkommande",
  deleteEntry: "Ta bort post",
  deleteEntryTitle: "Ta bort historikpost?",
  deleteEntryHint: "Bankens post tas bort från den här enheten.",
  matchRulePromote: "Skapa regel för detta",
  bankColumn: "Från bank",
  label: "Etikett",
  importLabel: "Import",
  date: "Datum",
  description: "Beskrivning",
  amount: "Belopp",
  balance: "Saldo",
  type: "Typ",
  searchPlaceholder: "Sök i historik",
  searchNoResults: "Inga poster matchar sökningen.",
};

export default history;
