import type { TaxCatalog } from "../en/tax";

const tax: TaxCatalog = {
  // Skatteprofil-redigeraren
  newProfileTitle: "Ny skatteprofil",
  editProfileTitle: "Redigera skatteprofil",
  name: "Namn",
  namePlaceholder: "t.ex. Min lön, Stockholm",
  duplicateName: "Det finns redan en skatteprofil med det namnet.",
  country: "Land",
  municipality: "Kommun",
  municipalitySearch: "Sök kommun…",
  noMunicipalityMatch: "Ingen kommun matchar.",
  churchMember: "Medlem i kyrkan",
  churchMemberHint: "Lägger till kyrkoavgiften i uppskattningen.",
  birthYear: "Födelseår",
  birthYearPlaceholder: "t.ex. 1985",
  birthYearHint:
    "Används för förhöjt grundavdrag och jobbskatteavdrag från 66 år.",
  incomeKind: "Inkomsttyp",
  incomeEmployment: "Anställning",
  incomePension: "Pension",
  incomeKindHint: "Inkomst av anställning ger jobbskatteavdrag.",
  saveProfile: "Spara profil",
  deleteProfile: "Ta bort profil",
  deleteProfileConfirm:
    "Ta bort {name}? Lönesidor som använder den slutar uppskatta bruttolön.",

  // Skatteprofilväljaren (i sidredigeraren)
  label: "Skatteprofil",
  pickProfile: "Välj skatteprofil",
  noProfile: "Ingen profil",
  newProfile: "Ny profil",
  sheetHint:
    "Uppskattar varje lönebeskeds bruttolön från nettoinsättningen med dessa skatteregler. Välj ingen för att ange bruttolön manuellt.",

  // Markering av uppskattade värden i lönetabellen
  estimatedBadge: "≈",
  estimatedTitle: "Uppskattad från nettoinsättningen med skatteprofilen.",
};

export default tax;
