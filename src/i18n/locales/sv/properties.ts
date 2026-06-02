import type { PropertiesCatalog } from "../en/properties";

const properties: PropertiesCatalog = {
  // Page chrome.
  sheetTitle: "Fastigheter",
  noProperties: "Inga fastigheter ännu.",
  addProperty: "Lägg till fastighet",
  total: "Totalt",
  editSheet: "Redigera blad",

  // Property card.
  boughtFor: "Köpt för",
  purchased: "Köpt",
  currentValue: "Nuvarande värde",
  noValue: "Inget värde registrerat",
  updateValue: "Uppdatera värde",
  editProperty: "Redigera fastighet",
  deleteProperty: "Ta bort fastighet",
  mortgages: "Bolån",
  noMortgages: "Inga bolån på den här fastigheten.",
  addMortgage: "Lägg till bolån",
  findPayments: "Hitta betalningar",
  editMortgage: "Redigera bolån",
  deleteMortgage: "Ta bort bolån",
  noAccountBound: "Inget konto kopplat",
  paymentsCountOne: "{count} betalning",
  paymentsCountOther: "{count} betalningar",
  principalTotal: "Amortering",
  interestTotal: "Ränta",

  // Property editor modal.
  newPropertyTitle: "Ny fastighet",
  editPropertyTitle: "Redigera fastighet",
  nameLabel: "Namn",
  namePlaceholder: "Lägenhet, sommarstuga…",
  purchaseAmountLabel: "Köpesumma",
  purchaseAmountPlaceholder: "Vad du betalade för den",
  purchaseDateLabel: "Köpdatum",

  // Update-value modal.
  updateValueTitle: "Uppdatera värde",
  valueLabel: "Nuvarande värde",
  valuePlaceholder: "Vad den är värd nu",
  asOfLabel: "Per datum",
  valueHistory: "Värdehistorik",
  noValueHistory: "Inga värden registrerade ännu.",
  deleteValueTitle: "Ta bort värde?",
  deleteValueConfirm:
    "Värdet som registrerats för {date} tas bort. Det går inte att ångra.",

  // Mortgage editor modal.
  newMortgageTitle: "Nytt bolån",
  editMortgageTitle: "Redigera bolån",
  mortgageNameLabel: "Namn",
  mortgageNamePlaceholder: "SBAB lån 1…",
  accountLabel: "Konto",
  accountHint:
    "Kontot det här lånet betalas från. ”Hitta betalningar” söker igenom kontots bankhistorik efter den återkommande dragningen.",
  chooseAccount: "Välj ett konto",
  noAccount: "Inget konto",
  noAccountsYet: "Inga konton ännu",

  // Find-payments walk.
  findTitle: "Hitta bolånebetalningar",
  findNoAccount:
    "Koppla ett bankkonto till det här bolånet först — ”Hitta betalningar” söker igenom kontots historik efter den återkommande dragningen.",
  findNoneFound:
    "Inga återkommande månadsdragningar hittades i kontots historik.",
  findPickPrincipal: "Vilken dragning är betalningen (amorteringen)?",
  findPickInterest: "Separat räntedragning? (valfritt)",
  findNoInterest: "Ingen — en kombinerad dragning",
  findPreview: "Betalningar att lägga till",
  findMonthsOne: "{count} månad",
  findMonthsOther: "{count} månader",
  findAlreadyAdded: "Redan tillagd",
  findAddOne: "Lägg till {count} betalning",
  findAddOther: "Lägg till {count} betalningar",
  findEmptySelection: "Välj en dragning ovan för att förhandsgranska.",

  // Delete property confirm.
  deletePropertyTitle: "Ta bort fastighet?",
  deletePropertyConfirm:
    "{name} och dess bolån tas bort. Det går inte att ångra.",
  deleteMortgageTitle: "Ta bort bolån?",
  deleteMortgageConfirm:
    "{name} och dess betalningar tas bort. Det går inte att ångra.",

  // Shared verbs.
  save: "Spara",
  create: "Skapa",
  delete: "Ta bort",
};

export default properties;
