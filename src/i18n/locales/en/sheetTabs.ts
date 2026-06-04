import type { Widen } from "./_widen";

const sheetTabs = {
  add: "Add sheet",
  addAccount: "Add account",
  overview: "Overview",
  pickActive: "Pick active sheet",
  switchSheet: "Switch sheet",
  newSheet: "New sheet",
  tabAriaLabel: "{name} (long-press to edit)",
  tablistLabel: "Sheets",
} as const;

export type SheetTabsCatalog = Widen<typeof sheetTabs>;

export default sheetTabs;
