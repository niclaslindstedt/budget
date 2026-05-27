import type { MetadataCatalog } from "../en/metadata";

const metadata: MetadataCatalog = {
  title: "Metadataläge",
  progress: "{month} · {index} av {total}",
  fromBank: "Från banken",
  typeLabel: "Typ",
  companyLabel: "Företag",
  companyHint: "Tagga företaget som tog emot pengarna.",
  noCompanyLabel: "Inget företag behövs",
  noCompanyHint: "Denna post dyker inte upp här igen för att företag saknas.",
  descriptionLabel: "Beskrivning",
  descriptionPlaceholder: "Lämna tomt för att behålla bankens text",
  descriptionHint: "Tomt fält behåller bankens text.",
  skip: "Hoppa över",
  needsTypePrompt: "Välj en typ för att spara.",
  needsCompanyPrompt:
    'Välj ett företag — eller bocka i "Inget företag behövs" — för att spara.',
  allCaught: "Allt är ifyllt.",
  allCaughtHint:
    "Varje importerad post på detta konto har en typ eller en egen beskrivning.",
};

export default metadata;
