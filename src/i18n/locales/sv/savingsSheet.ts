import type { SavingsSheetCatalog } from "../en/savingsSheet";

const savingsSheet: SavingsSheetCatalog = {
  title: "Sparande",
  name: "Namn",
  bank: "Bank",
  balance: "Saldo",
  actions: "Åtgärder",
  addAccount: "Lägg till sparkonto",
  total: "Totalt",
  noAccounts: "Inga sparkonton än. Lägg till ett med knappen nedan.",
  glyphLabel: "{name}-ikon",
  editAria: "Redigera {name}",
  editTitle: "Redigera sparkonto",
  deleteAria: "Ta bort {name}",
  deleteTitle: "Ta bort sparkonto",
  deleteConfirm:
    "Ta bort {name}? Dess registrerade saldohistorik tas bort, tillsammans med transaktioner och överföringar kopplade till det.",
  updateBalance: "Uppdatera saldo",
  importHistory: "Importera historik",
  viewHistory: "Visa historik",
  cutHistory: "Klipp historik",
  noHistory: "Inga transaktioner importerade än",
  nothingToCut: "Ingen historik eller transaktioner att klippa",

  // Skapa / redigera-modal.
  newTitle: "Nytt sparkonto",
  namePlaceholder: "t.ex. Buffert",
  description: "Beskrivning",
  bankPlaceholder: "t.ex. Exempelbanken",
  clearing: "Clearingnummer",
  accountNumber: "Kontonummer",
  currentBalance: "Aktuellt saldo",
  create: "Skapa",

  // Uppdatera saldo-modal.
  updateBalanceTitle: "Uppdatera saldo",
  balanceLabel: "Saldo",
  balancePlaceholder: "0",
  asOfLabel: "Per datum",
  balanceHistory: "Saldohistorik",
  noBalanceHistory: "Inga saldon registrerade än.",
  deleteBalanceAria: "Ta bort registrerat saldo",
};

export default savingsSheet;
