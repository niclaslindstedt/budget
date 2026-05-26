import type { CloudLinkCatalog } from "../en/cloudLink";

const cloudLink: CloudLinkCatalog = {
  sourceBrowser: "den här webbläsarens budget",
  sourceFolder: "din tidigare mappbudget",
  sourceLocalFolder: "din lokala mappbudget",
  sourceDropbox: "din Dropbox-budget",
  sourceGdrive: "din Google Drive-budget",
  untouchedBrowser: "den här webbläsarens nuvarande budget",
  untouchedFolder: "din tidigare mappbudget",
  untouchedLocalFolder: "din lokala mappbudget",
  untouchedDropbox: "din Dropbox-budget",
  untouchedGdrive: "din Google Drive-budget",
  folderAlreadyHas: "Mappen innehåller redan en budget",
  folderBothBody:
    "Mappen du valde innehåller redan en budgetfil. Välj vilken version som ska behållas — den andra ersätts.",
  eitherWayKept:
    "Oavsett vad, {untouched} stannar där den är — att byta lagring tar inte bort den, så du kan komma tillbaka till den senare.",
  useTheFolderVersion: "Använd mappversionen",
  replaceFolderWith: "Ersätt mappen med {source}",
  cloudAlreadyHas: "{name} har redan en budget",
  cloudBothBody:
    "{name} innehåller redan en budgetfil. Välj vilken version som ska behållas — den andra ersätts.",
  useTheCloudVersion: "Använd {name}-versionen",
  replaceCloudWith: "Ersätt {name} med {source}",
  linkingCloud: "Länkar {name}",
  emptyCloudBody:
    "{name} är ansluten och tom. Ta över {source}, eller börja om på {name}?",
  untouchedKeptShort:
    "{untouched} stannar där den är oavsett — att byta lagring tar inte bort den.",
  bringSourceOver: "Ta över {source} till {name}",
  startFreshOn: "Börja om på {name}",
  useExistingCloud: "Använd befintlig {name}-budget?",
  useExistingCloudBody:
    "{name} innehåller redan en budgetfil. Att byta använder den som din aktiva budget på denna enhet.",
  switchTo: "Byt till {name}",
  cloudLinked: "{name} länkad",
  cloudLinkedBody: "{name} är ansluten. Nya poster sparas där från och med nu.",
};

export default cloudLink;
