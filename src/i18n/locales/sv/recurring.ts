import type { RecurringCatalog } from "../en/recurring";

const recurring: RecurringCatalog = {
  panelTitle: "Återkommande kandidater",
  panelHint:
    "Upptäckta i importerad historik. Klicka på Befordra för att göra om en till en återkommande serie.",
  promote: "Befordra",
  promoteFull: "Gör återkommande",
  promoteHint:
    "Schemalägger {n} framtida poster över de kommande 12 månaderna från det upptäckta mönstret.",
  promoteHintDisabled:
    "Inga framtida datum kvar i det upptäckta mönstret — inget att schemalägga.",
  dismiss: "Ej återkommande",
  dismissAll: "Avvisa alla",
  dismissAllConfirm: "Avvisa alla kandidater?",
  dismissAllConfirmHint:
    "{n} återkommande kandidat markeras som ej återkommande och döljs i denna panel. Du kan återställa dem senare i Inställningar.",
  dismissAllConfirmHintPlural:
    "{n} återkommande kandidater markeras som ej återkommande och döljs i denna panel. Du kan återställa dem senare i Inställningar.",
  dismissAllAction: "Avvisa alla ({n})",
  showMore: "Visa {n} till",
  occurrencesSince: "{n} förekomster sedan",
  confident: "{n}% säker",
  suggested: "Föreslagen:",
  cadenceWeekly: "Veckovis",
  cadenceBiweekly: "Varannan vecka",
  cadenceMonthly: "Månadsvis",
  cadenceQuarterly: "Kvartalsvis",
  cadenceYearly: "Årsvis",
  none: "Inga förslag just nu.",
  everyMonthOn: "Varje månad den {day}",
  irregular: "Oregelbunden",
  avgInterval: "~ var {days} dag",
  viewEntriesAria: "Visa poster för {description}",
  entriesTitle: "Poster — {description}",
};

export default recurring;
