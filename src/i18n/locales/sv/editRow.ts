import type { EditRowCatalog } from "../en/editRow";

const editRow: EditRowCatalog = {
  title: "Redigera post",
  titleRecurring: "Redigera återkommande post",
  scope: "Omfattning",
  scopeApplyTo: "Tillämpa på",
  scopeJustThis: "Bara denna post",
  scopeJustThisDate: "Endast denna post ({date})",
  scopeThisAndFuture: "Denna post och alla framtida",
  scopeAll: "Alla poster i serien",
  scopeAllAmountDisabled:
    "Beloppet är låst i denna omfattning — att ändra det skulle skriva om tidigare, redan avstämda poster.",
  scopeAlwaysJustThis:
    "Datum och klarmarkering gäller alltid endast för denna post.",
  affectedRows: "Berörda poster",
  affectedRowsCountOne: "{n} post uppdateras",
  affectedRowsCountOther: "{n} poster uppdateras",
  affectedRowsCurrent: "aktuell",
  completed: "Klar",
  isTransfer: "Markera som överföring",
  primaryIncomeTitle: "Primär inkomst",
  primaryIncomeToggle: "Markera serien som primär inkomst",
  primaryIncomeHelp:
    "När lönen landar några dagar tidigare (helg / röd dag) skjuts den in i nästa budgetmånad — tillsammans med alla andra poster samma dag. Ange den ordinarie lönedagen nedan så att appen kan skilja på tidiga och i tid-utbetalningar.",
  primaryIncomeAnchorDay: "Ordinarie lönedag (dag i månaden)",
};

export default editRow;
