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
  size: "Storlek",
  currentValue: "Nuvarande värde",
  noValue: "Inget värde registrerat",
  updateValue: "Uppdatera värde",
  editProperty: "Redigera fastighet",
  deleteProperty: "Ta bort fastighet",
  mortgages: "Bolån",
  noMortgages: "Inga bolån på den här fastigheten.",
  addMortgage: "Lägg till bolån",
  editMortgage: "Redigera bolån",
  deleteMortgage: "Ta bort bolån",
  noPaymentsYet: "Inga betalningar ännu",
  paymentsCountOne: "{count} betalning",
  paymentsCountOther: "{count} betalningar",
  paidTotal: "Betalt",
  balanceShort: "Skuld",
  loanShort: "Lån",
  rateShort: "Ränta",
  rateResetsOne: "ändras varje månad",
  rateResetsOther: "ändras var {count}:e mån",
  nextRateChangeShort: "Nästa ändring",
  amortShort: "Amortering",
  amortPerMonth: "{amount}/mån",

  // Property editor modal.
  newPropertyTitle: "Ny fastighet",
  editPropertyTitle: "Redigera fastighet",
  nameLabel: "Namn",
  namePlaceholder: "Lägenhet, sommarstuga…",
  purchaseAmountLabel: "Köpesumma",
  purchaseAmountPlaceholder: "Vad du betalade för den",
  purchaseDateLabel: "Köpdatum",
  sizeLabel: "Storlek",
  sizePlaceholder: "Boyta",

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
  loanAmountLabel: "Lånebelopp",
  loanAmountPlaceholder: "Summan du lånade",
  currentBalanceLabel: "Nuvarande skuld",
  currentBalancePlaceholder: "Vad som är kvar att betala",
  interestRateLabel: "Räntesats (%)",
  interestRatePlaceholder: "t.ex. 3,45",
  rateChangeDateLabel: "Datum för ränteändring",
  rateChangeRateLabel: "Ränta (%)",
  addRateChange: "Lägg till ränteändring",
  removeRateChange: "Ta bort ränteändring",
  rateHistoryHint:
    "Lägg till en ränteändring med datumet den trädde i kraft — den nyaste är den aktuella räntan. Lämna det första datumet tomt för ursprungsräntan. Tidigare räntor låter sökningen dela upp varje betalning korrekt.",
  rateChangeMonthsLabel: "Räntan ändras var (månad)",
  rateChangeMonthsPlaceholder: "t.ex. 3",
  rateChangeMonthsHint:
    "Hur ofta räntan omförhandlas — 3 för rörlig ränta, 12 för 1 års bindningstid.",
  nextRateChangeLabel: "Nästa ränteändring",
  amortizationLabel: "Månadsamortering",
  amortModePercent: "% av ursprungslån",
  amortModeFixed: "Fast summa",
  amortPercentPlaceholder: "t.ex. 2",
  amortFixedPlaceholder: "Belopp per månad",
  amortPercentHint:
    "Årlig amortering som en procent av det ursprungliga lånebeloppet. Ange ett lånebelopp för att se månadsbeloppet.",
  amortFixedHint: "Ett fast belopp som amorteras varje månad.",
  amortPreview: "≈ {amount} per månad",
  accountLabel: "Konto",
  accountHint:
    "Kontot fastighetens bolån betalas från. ”Hitta bolånebetalningar” söker igenom kontots bankhistorik efter dragningarna.",
  chooseAccount: "Välj ett konto",
  noAccount: "Inget konto",
  noAccountsYet: "Inga konton ännu",
  lenderLabel: "Långivare",
  lenderPlaceholder: "Välj ett företag…",
  lenderHint:
    "Banken som fastighetens bolån finns hos. ”Hitta bolånebetalningar” använder den — och bolånetypen — för att hitta rätt dragningar.",

  // Find-payments walk.
  findTitle: "Hitta bolånebetalningar",
  findNoProperties: "Lägg till en fastighet med ett bolån först.",
  findSelectProperty: "Fastighet",
  findNoMortgages: "Den här fastigheten har inga bolån ännu.",
  findNoAccount:
    "Ge fastighetens bolån ett bankkonto först — sökningen går igenom kontots historik efter dragningen.",
  findNoneFound: "Inga matchande dragningar hittades i kontohistoriken.",
  findNeedsTags:
    "Inget att utgå från ännu. Märk den här fastighetens bolånedragningar med deras företag och bolånetypen i din budget (en månad räcker), och kom sedan tillbaka — sökningen använder de märkningarna för att hitta resten.",
  findSplitHint:
    "Varje dragning delas upp på fastighetens {count} bolån efter deras amortering och ränta.",
  findTxnCountOne: "{count} transaktion",
  findTxnCountOther: "{count} transaktioner",
  findSelectCharges: "Dragningar att lägga till",
  findSeedTags:
    "Matchat från dragningar du märkt med det här bolånets företag eller bolånetypen.",
  findSeedPayments: "Matchat från betalningarna som redan finns på bolånet.",
  findPreview: "Betalningar att lägga till",
  findAlreadyAdded: "Redan tillagd",
  findAddOne: "Lägg till {count} betalning",
  findAddOther: "Lägg till {count} betalningar",

  // Amount band around each matched charge.
  findToleranceLabel: "Matchningstolerans",
  findToleranceValue: "±{pct}%",
  findToleranceHint:
    "Hur mycket en dragnings belopp får variera mellan månaderna och ändå räknas — vidga det om räntan ändrats under perioden.",
  findSpanMonthsOne: "över {count} månad",
  findSpanMonthsOther: "över {count} månader",
  findRange: "{start} – {end}",

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
