import type { SplitRowCatalog } from "../en/splitRow";

const splitRow: SplitRowCatalog = {
  title: "Dela upp post",
  intro:
    "Dela upp den här posten i flera delar — användbart när en " +
    "betalning täcker olika saker (bolåneränta vs. amortering, ett " +
    "bankgiro som betalade både mat och försäkring, osv.). Varje " +
    "uppdelning blir en egen rad på samma datum.",
  original: "Original",
  splits: "Uppdelningar",
  splitN: "Uppdelning {n}",
  description: "Beskrivning",
  descriptionPlaceholder: "Vad gäller den här delen?",
  amount: "Belopp",
  type: "Typ",
  addSplit: "Lägg till en uppdelning",
  removeSplit: "Ta bort denna uppdelning",
  remainder: "Rest",
  remainderZero: "Allt är uppdelat — ingen rest.",
  remainderHint:
    "Det som blir över stannar på originalraden och flyttas längst " +
    "ner i listan.",
  remainderOpposite:
    "Uppdelningarna summerar till mer än originalet. Resten får " +
    "motsatt tecken mot originalet.",
  button: "Dela upp",
  buttonDisabled: "Lägg till minst en uppdelning",
  needDescAndAmount: "Fyll i beskrivning och belopp för varje uppdelning.",
  revert: "Ångra uppdelning",
  revertTitle:
    "Ta bort uppdelningen och visa posten som banken ursprungligen rapporterade den.",
  cell: "Dela upp post",
  cellTitle: "Dela upp denna post i flera delar",
  cantSplit: "Den här raden kan inte delas upp",
};

export default splitRow;
