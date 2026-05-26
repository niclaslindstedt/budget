import type { TransferCatalog } from "../en/transfer";

const transfer: TransferCatalog = {
  title: "Överföring",
  titleEdit: "Redigera överföring",
  titleNew: "Ny överföring",
  date: "Datum",
  description: "Beskrivning",
  descriptionPlaceholder: "Vad är denna överföring för?",
  amount: "Belopp",
  transfer: "Överföring",
  from: "Från",
  to: "Till",
  type: "Typ",
  swap: "Byt från- och till-konton",
  needTwoAccounts: "En överföring kräver två olika konton.",
  markAsDone: "Markera som klar",
  pickAccount: "Välj ett konto",
  deleteTitle: "Ta bort överföring?",
  deleteHint: "De två bankposterna som slogs ihop kommer tillbaka.",
  isTransfer: "Detta är en överföring mellan två konton",
  importedLockedHint:
    "Importerad från bankhistoriken — datum, belopp och konton är låsta. Avmarkera överföringsväljaren för att exponera de två ursprungliga bankposterna.",
  uncollapseTitle: "Markera som icke-överföring?",
  uncollapseHint:
    "De två bankposterna som slogs ihop kommer tillbaka i sina respektive konton. Eventuell beskrivning eller typ du satt på överföringen kasseras — de beskriver den sammanslagna överföringen, inte de underliggande bankposterna.",
  uncollapseConfirm: "Markera som icke-överföring",
};

export default transfer;
