import type { BulkEditCatalog } from "../en/bulkEdit";

const bulkEdit: BulkEditCatalog = {
  title: "Redigera {n} poster",
  titleOne: "Redigera post",
  description: "Beskrivning",
  descriptionUnchanged: "Lämna oförändrad",
  amount: "Belopp",
  date: "Datum",
  type: "Typ",
  apply: "Använd på {n}",
  applyOne: "Använd",
  hint: "Tomma fält lämnas som de är.",
  changeType: "Ändra typ",
  changeDate: "Ändra datum",
  changeAmount: "Ändra belopp",
  sharedAmountHint: "Alla {n} rader delar {amount}",
  differentAmountsHint:
    "Markerade rader har olika belopp — redigera varje rad separat för att ändra dem.",
  makeEachRecurring: "Gör var och en återkommande",
  makeEachRecurringHint:
    "Replikera varje markerad rad på datumen nedan; var och en blir en egen serie.",
  markAsTransfer: "Markera / avmarkera som överföring",
  markAsTransferHint:
    "När inställningen ”Dölj överföringar” är på döljs överföringsrader från budgettabellen. Beloppet räknas fortfarande med i saldot.",
  markAsTransferOn: "Markera varje vald rad som överföring",
  markAsTransferOff: "Avmarkera varje vald rad",
};

export default bulkEdit;
