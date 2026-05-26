import type { EditRowCatalog } from "../en/editRow";

const editRow: EditRowCatalog = {
  title: "Redigera rad",
  titleRecurring: "Redigera återkommande rad",
  scope: "Omfattning",
  scopeApplyTo: "Tillämpa på",
  scopeJustThis: "Bara denna rad",
  scopeJustThisDate: "Endast denna rad ({date})",
  scopeThisAndFuture: "Denna rad och alla framtida",
  scopeAll: "Alla rader i serien",
  scopeAllAmountDisabled:
    "Beloppet är låst i denna omfattning — att ändra det skulle skriva om tidigare, redan avstämda poster.",
  scopeAlwaysJustThis:
    "Datum och klarmarkering gäller alltid endast för denna rad.",
  affectedRows: "Berörda rader",
  affectedRowsCountOne: "{n} rad uppdateras",
  affectedRowsCountOther: "{n} rader uppdateras",
  affectedRowsCurrent: "aktuell",
  completed: "Klar",
  primaryIncomeTitle: "Primär inkomst",
  primaryIncomeToggle: "Markera serien som primär inkomst",
  primaryIncomeHelp:
    "När lönen landar några dagar tidigare (helg / röd dag) skjuts den in i nästa budgetmånad — tillsammans med alla andra poster samma dag. Ange den ordinarie lönedagen nedan så att appen kan skilja på tidiga och i tid-utbetalningar.",
  primaryIncomeAnchorDay: "Ordinarie lönedag (dag i månaden)",
};

export default editRow;
