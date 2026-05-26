import type { AccountCatalog } from "../en/account";

const account: AccountCatalog = {
  title: "Konto",
  titleEdit: "Redigera konto",
  titleNew: "Nytt konto",
  create: "Skapa",
  name: "Namn",
  namePlaceholder: "Lönekonto, Resefond, Kontanter…",
  description: "Beskrivning",
  descriptionPlaceholder: "Valfritt. t.ex. gemensamt hushållssparande.",
  bank: "Bank",
  bankPlaceholder: "t.ex. Swedbank, Nordea, Revolut…",
  clearing: "Clearingnummer",
  clearingPlaceholder: "8327",
  accountNumber: "Kontonummer",
  accountNumberPlaceholder: "123 456 789",
  iban: "IBAN",
  ibanPlaceholder: "SE45 5000 0000 0583 9825 7466",
  bic: "BIC / SWIFT",
  bicPlaceholder: "SWEDSESS",
  currencyOverride: "Valutaöverstyrning",
  currencyOverridePlaceholder:
    "Lämna tomt för att använda standardinställningen",
  currencyOverrideHint:
    "Fritt format. Tomt innebär att standardinställningen används.",
  noDetailsHint:
    "Detta konto har inga bankuppgifter. Du kan ändå spåra dess saldo och överföringar — fyll i dem senare för enklare avstämning.",
  openingBalance: "Ingående saldo",
  color: "Färg",
  glyph: "Ikon",
  deleteTitle: "Ta bort konto?",
  deleteHint:
    "Budgetar som hänvisade till kontot behålls men tappar referensen. Bankhistoriken för det tas bort.",
  correctBalance: "Ange saldo",
  correctBalanceTitle: "Ange kontosaldo",
  correctBalanceHint:
    "Vi lägger till en korrigeringsrad daterad idag så att det löpande saldot stämmer.",
  targetBalance: "Önskat saldo",
  currentBalance: "Aktuellt saldo",
  deltaPreview: "Korrigering: {delta}",
  addBudgetSheet: "Lägg till budgetblad",
  addBudgetSheetHint:
    "Lägg till ett budgetblad för det här kontot för att uppdatera dess saldo.",
};

export default account;
