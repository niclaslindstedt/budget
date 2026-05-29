import type { SearchTransactionCatalog } from "../en/searchTransaction";

const searchTransaction: SearchTransactionCatalog = {
  open: "Sök",
  title: "Sök",
  placeholder:
    "Sök efter beskrivning, banktext, företag, typ, kategori eller belopp",
  clear: "Rensa sökning",
  emptyHint: "Börja skriva för att söka i alla blad.",
  noResults: "Inga matchande poster",
  resultAria: "Öppna {description} i {sheet}",
  bankLabel: "Bank",
  tagsLabel: "Taggar",
  sortMenuAria: "Ändra sorteringsordning",
  sortMenuTitle: "Sortera efter",
  sortRelevance: "Relevans",
  sortDateDesc: "Datum · Nyaste först",
  sortDateAsc: "Datum · Äldsta först",
  sortAmountDesc: "Belopp · Högsta först",
  sortAmountAsc: "Belopp · Lägsta först",
  filterMenuAria: "Filtrera resultat",
  filterMenuTitle: "Filter",
  filterExcludeTransfers: "Exkludera överföringar",
  filterExcludeHistory: "Exkludera historik",
  filterExcludeUnconfirmed: "Exkludera obekräftade",
  filterSheets: "Blad",
  filterSheetsAll: "Inga blad valda — söker i alla.",
  filterAmount: "Belopp",
  filterAmountMin: "Lägsta belopp",
  filterAmountMax: "Högsta belopp",
  filterDates: "Datum",
  filterDateMin: "Tidigaste datum",
  filterDateMax: "Senaste datum",
  filterReset: "Återställ filter",
};

export default searchTransaction;
