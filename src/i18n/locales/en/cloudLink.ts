import type { Widen } from "./_widen";

const cloudLink = {
  sourceBrowser: "this browser's budget",
  sourceFolder: "your previous folder budget",
  sourceLocalFolder: "your local folder budget",
  sourceDropbox: "your Dropbox budget",
  sourceGdrive: "your Google Drive budget",
  untouchedBrowser: "this browser's current budget",
  untouchedFolder: "your previous folder budget",
  untouchedLocalFolder: "your local folder budget",
  untouchedDropbox: "your Dropbox budget",
  untouchedGdrive: "your Google Drive budget",
  folderAlreadyHas: "Folder already contains a budget",
  folderBothBody:
    "The folder you picked already contains a budget file. Pick which version to keep — the other will be replaced.",
  eitherWayKept:
    "Either way, {untouched} stays where it is — switching backends doesn't delete it, so you can still get back to it later.",
  useTheFolderVersion: "Use the folder version",
  replaceFolderWith: "Replace folder with {source}",
  cloudAlreadyHas: "{name} already has a budget",
  cloudBothBody:
    "{name} already contains a budget file. Pick which version to keep — the other will be replaced.",
  useTheCloudVersion: "Use the {name} version",
  replaceCloudWith: "Replace {name} with {source}",
  linkingCloud: "Linking {name}",
  emptyCloudBody:
    "{name} is connected and empty. Bring {source} over, or start fresh on {name}?",
  untouchedKeptShort:
    "{untouched} stays where it is either way — switching backends doesn't delete it.",
  bringSourceOver: "Bring {source} over to {name}",
  startFreshOn: "Start fresh on {name}",
  useExistingCloud: "Use existing {name} budget?",
  useExistingCloudBody:
    "{name} already contains a budget file. Switching will use that as your active budget on this device.",
  switchTo: "Switch to {name}",
  cloudLinked: "{name} linked",
  cloudLinkedBody:
    "{name} is connected. New entries will be saved there from now on.",
} as const;

export type CloudLinkCatalog = Widen<typeof cloudLink>;

export default cloudLink;
