import type { TransferCollapseCatalog } from "../en/transferCollapse";

const transferCollapse: TransferCollapseCatalog = {
  title: "Överföringar mellan konton",
  hint: "Speglade par från din importerade historik. Slå ihop slår samman dem till en överföringstransaktion och döljer båda källposterna; Hoppa över lämnar paret orört för denna session; Aldrig döljer paret från framtida sökningar.",
  noMatches:
    "Inga matchande par hittades i din importerade historik. Ett par måste ha samma belopp, motsatta tecken och datum inom tre dagar.",
  allSkipped:
    "Alla upptäckta par har hoppats över i denna session. Stäng dialogen för att avvisa den.",
  collapsedDone:
    "Klart — de matchande paren slogs ihop till överföringar. De två bankposterna bakom varje par döljs nu under en enda överföring.",
  pairsPending: "{n} par väntar",
  pairsPendingPlural: "{n} par väntar",
  confident: "{n}% säker",
  unknownAccount: "Okänt konto",
  collapseAll: "Slå ihop alla",
  collapse: "Slå ihop",
  skip: "Hoppa över",
  never: "Aldrig",
  skipAll: "Avvisa alla",
  none: "Inga överföringspar just nu.",
};

export default transferCollapse;
