import type { InsightsSheetCatalog } from "../en/insightsSheet";

const insightsSheet: InsightsSheetCatalog = {
  netWorthTitle: "Nettoförmögenhet",
  netWorthSeries: "Nettoförmögenhet",
  breakdownTitle: "Fördelning",
  chartTitle: "Över tid",
  chartEmpty: "Inte tillräckligt med daterad data att rita ännu.",
  chartNoneInRange: "Ingen data i den här perioden. Välj en längre.",
  chartAllHidden: "Inga band valda. Bocka i ett för att rita det.",
  noData:
    "Inget att summera ännu. Lägg till konton, sparande, saker, fastigheter eller lån så samlas allt här.",

  categoryAccounts: "Konton",
  categorySavings: "Sparande",
  categoryItems: "Saker",
  categoryInvestments: "Investeringar",
  categoryCars: "Bilar",
  categoryProperties: "Fastigheter",
  categoryPropertiesNet: "Fastigheter & bolån",
  categoryLoans: "Övriga lån",

  settingsAction: "Inställningar för nettoförmögenhet",
  settingsTitle: "Inställningar för nettoförmögenhet",
  settingsIntro:
    "Välj vad som räknas in i din nettoförmögenhet. Ange en ägarandel för det du inte äger själv — en samägd bostad, ett konto delat med en partner. En fastighets andel gäller även dess bolån.",
  includeAria: "Inkludera {name}",
  shareLabel: "Andel",
  shareAria: "Ägarandel för {name}, i procent",
  linkedLoansNote:
    "Lån länkade till en fastighets bolån följer fastighetens inställning och listas inte här.",
  propertyMortgages: "bolån {amount}",
};

export default insightsSheet;
