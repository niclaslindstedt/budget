import type { EditHistoryCatalog } from "../en/editHistory";

const editHistory: EditHistoryCatalog = {
  title: "Redigera historikpost",
  description: "Beskrivning",
  descriptionPlaceholder: "Skriv över bankens beskrivning",
  type: "Typ",
  company: "Företag",
  originalDescription: "Original från banken",
  hint:
    "Byter namn på bara denna post. Bankens text lämnas orörd så du " +
    "kan se vad som stod i kontoutdraget. För att etikettera alla " +
    "poster med samma beskrivning, använd mönsterknappen i stället.",
  primaryIncomeTitle: "Primär inkomst",
  primaryIncomeToggle: "Markera denna avsändare som primär inkomst",
  primaryIncomeHelp:
    "Bankposter med exakt denna beskrivning (nu och i framtida importer) skjuts till nästa budgetmånad när de landar före den ordinarie lönedagen. Vid jobbyte lägger du bara till den nya bankens mönster — det gamla fortsätter att tagga historiken.",
  primaryIncomeAnchorDay: "Ordinarie lönedag (dag i månaden)",
};

export default editHistory;
