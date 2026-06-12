import type { ScenariosCatalog } from "../en/scenarios";

const scenarios: ScenariosCatalog = {
  pickBaseTitle: "Välj en basbudget",
  pickBaseBody:
    "Scenarier spelar upp tänk-om-framtider mot en budget du redan för. Välj budgetbladet att utgå ifrån — din riktiga budget ändras aldrig.",
  pickBaseLabel: "Basbudget",
  noBaseOption: "Ingen basbudget",
  changeBaseAction: "Byt basbudget",
  changeBaseConfirm:
    "Byter du basbudget rensas alla scenariers ändringar (de hör till den gamla budgetens rader). Scenarionamnen behålls. Fortsätta?",
  noBudgetSheets: "Det finns inga budgetblad att utgå ifrån ännu.",

  baselineTab: "Grundlinje",
  addScenario: "Nytt scenario",
  defaultName: "Scenario {n}",
  renameScenario: "Byt namn på scenario",
  deleteScenario: "Radera scenario",
  deleteConfirm: "Radera scenariot ”{name}”? Dess ändringar går förlorade.",
  scenarioName: "Namn",
  scenarioTabsLabel: "Scenarier",

  visualizeAction: "Visualisera scenarier",
  chartEmpty:
    "Inte tillräckligt med daterade rader i basbudgeten att rita ännu.",
  legendLabel: "Växla serier",
  legendToggleAria: "Växla {name} i diagrammet",

  monitorsTitle: "Saldobevakningar",
  monitorsIntro:
    "Hur mycket pengar som finns kvar på ett datum som spelar roll.",
  addMonitor: "Lägg till bevakning",
  removeMonitor: "Ta bort bevakning för {date}",
  monitorDateLabel: "Bevakningsdatum",
  noMonitors:
    "Inga bevakningsdatum ännu. Lägg till ett för att följa ett datum som spelar roll.",

  baselineReadOnly:
    "Grundlinjen är din budget som den är. Växla till ett scenario för att göra ändringar.",
  showEarlierMonths: "Visa tidigare månader",
  hideEarlierMonths: "Dölj tidigare månader",
  monthEmpty: "Inga rader i {month}.",
  excludeRow: "Uteslut {name} i det här scenariot",
  includeRow: "Ta med {name} igen",
  revertOverride: "Ångra ändring av {name}",
  editAmountAria: "Ändra belopp för {name} i det här scenariot",
  addRow: "Lägg till rad",
  addedRowBadge: "Tillagd i det här scenariot",
  editAddedRow: "Redigera tillagd rad",

  excludeSeriesBody:
    "Den här posten ({date}) utesluts ur scenariot. Uteslut även alla följande poster i dess återkommande serie?",
  includeSeriesBody:
    "Den här posten ({date}) tas med igen. Ta även med alla följande poster i dess återkommande serie?",

  modulateRow: "Justera belopp för {name}",
  modulateTitle: "Justera belopp",
  modulateBody:
    "Justeringen är länkad till din budget — ändras postens belopp där följer scenariot med automatiskt.",
  modulateOpLabel: "Justering",
  modulateOpAdd: "Lägg till belopp",
  modulateOpSubtract: "Dra av belopp",
  modulateOpMultiply: "Multiplicera med",
  modulateOpPercent: "Ändra med procent",
  modulateValueLabel: "Värde",
  modulateRemove: "Ta bort justering",

  rowModalTitleAdd: "Ny scenariorad",
  rowModalTitleEdit: "Redigera scenariorad",
  rowDate: "Datum",
  rowDescription: "Beskrivning",
  rowAmount: "Belopp",
  rowRecurrence: "Datum",
  rowDelete: "Radera rad",
  addRowsOne: "Lägg till {n} rad",
  addRowsOther: "Lägg till {n} rader",

  deleteRecurringTitle: "Radera återkommande rad?",
  deleteRecurringBody:
    "Den här raden ingår i en återkommande serie som scenariot lagt till.",
  deleteJustThis: "Bara den här raden",
  deleteThisAndFuture: "Den här och alla framtida rader ({n})",

  diffAction: "Visa ändringar",
  diffTitle: "Ändringar i {name}",
  diffEmpty:
    "Det här scenariot har inga ändringar ännu — det följer grundlinjen.",
  diffExcludedBadge: "utesluten",
  diffAddedBadge: "tillagd",
};

export default scenarios;
