import type { LoansSheetCatalog } from "../en/loansSheet";

const loansSheet: LoansSheetCatalog = {
  title: "Lån",
  name: "Namn",
  monthly: "Månadsvis",
  rate: "Ränta",
  paid: "Betalat",
  remaining: "Kvar",
  actions: "Åtgärder",
  total: "Totalt",
  addLoan: "Lägg till lån",
  noLoans: "Inga lån ännu. Lägg till ett med knappen nedan.",
  editAria: "Redigera {name}",
  editTitle: "Redigera lån",
  deleteAria: "Ta bort {name}",
  deleteTitle: "Ta bort lån",
  deleteConfirm:
    "Ta bort {name}? Dess registrerade betalningar tas bort. Ett länkat bolån påverkas inte — bara länken försvinner.",

  kindStudent: "Studielån",
  kindMortgage: "Bolån",
  kindCar: "Billån",
  kindPrivate: "Privatlån",
  kindPersonal: "Personligt lån",

  linkedTo: "Länkat till {name}",
  linkedToMany: "Länkat till {name} ({n} bolån)",

  updateBalance: "Uppdatera saldo",
  importPayments: "Importera betalningar",
  viewPayments: "Visa betalningar",
  noPayments: "Inga betalningar registrerade ännu",
  linkedBalanceHint:
    "Saldot kommer från det länkade bolånet — uppdatera det på fastighetsbladet",

  newTitle: "Nytt lån",
  namePlaceholder: "t.ex. Billån",
  description: "Beskrivning",
  kind: "Typ av lån",
  startDate: "Startdatum",
  startSum: "Startbelopp",
  rateLabel: "Ränta (%/år)",
  startFee: "Uppläggningsavgift",
  optionalHint: "Valfritt",
  lenderName: "Långivare (person)",
  lenderNamePlaceholder: "t.ex. Alex",
  company: "Långivare",
  linkMortgage: "Länka ett bolån från fastighet",
  linkNone: "Inte länkat — ange villkor nedan",
  linkedHint:
    "Villkor, betalningar och saldo kommer från det länkade bolånet på fastighetsbladet. Redigera dem där.",
  noMortgagesToLink:
    "Inga olänkade bolån på fastighetsbladet. Lägg till bolånet på en fastighet först, eller ange villkoren nedan.",
  balanceHint:
    "Kvarvarande skuld utgår från startbeloppet (plus avgift) och följer de registrerade betalningarna. Synka om den när som helst med Uppdatera saldo i radens …-meny.",
  balanceHintStudent:
    "Registrera vad du är skyldig med Uppdatera saldo i radens …-meny — saldot följer sedan de registrerade betalningarna.",
  create: "Skapa",

  updateBalanceTitle: "Uppdatera saldo",
  updateBalanceHint:
    "Ange den kvarvarande skulden per ett datum. Saldot vid varje annat datum beräknas från det senast registrerade saldot och betalningarna sedan dess.",
  balanceLabel: "Kvarvarande skuld",
  balancePlaceholder: "0",
  asOfLabel: "Per datum",
  balanceHistory: "Registrerade saldon",
  noBalanceHistory: "Inga saldon registrerade ännu.",
  deleteBalanceAria: "Ta bort registrerat saldo",

  paymentsTitle: "Betalningar",
  noPaymentsList: "Inga betalningar registrerade ännu.",
  deletePaymentAria: "Ta bort betalning",
  deleteAllPayments: "Ta bort alla",
  linkedPaymentsHint:
    "De här betalningarna är registrerade på det länkade bolånet och delas med fastighetsbladet.",

  importTitle: "Importera betalningar",
  importHint:
    "Bocka i banktransaktionerna som ska registreras som betalningar på {name}. Importen kommer ihåg bankbeskrivningen, så matchande dragningar på framtida importer kopplas automatiskt.",
  importEmpty:
    "Inga matchande transaktioner hittades. Märk banktransaktioner med typen {type} (eller importera ett kontoutdrag som innehåller lånets dragningar) och försök igen.",
  selectAll: "Markera alla",
  importSuggestedTitle: "Föreslagna liknande betalningar",
  importSuggestedHint:
    "Andra transaktioner med matchande bankbeskrivning och liknande belopp.",
  importTolerance: "Beloppstolerans",
  importSuggestedEmpty: "Inga liknande transaktioner inom ±{pct}%.",
  importApplyType: "Märk de importerade transaktionerna med typen {type}",
  importApplyName: "Byt namn på de importerade transaktionerna till {name}",
  importCountOne: "Importera {n} betalning",
  importCountOther: "Importera {n} betalningar",
};

export default loansSheet;
