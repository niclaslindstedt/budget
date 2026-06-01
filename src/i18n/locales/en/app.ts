import type { Widen } from "./_widen";

const app = {
  title: "Budget",
  tagline: "A local-first budget app.",
  loading: "Loading your budget…",
  noBudget: "No budget loaded.",
  versionPrefix: "v",
  scrollToToday: "Scroll to today",
  openSettings: "Open settings",
  settings: "Settings",
  headerToolbar: "Budget actions",
  selectRows: "Select rows",
  exitSelectMode: "Exit select mode",
  selectUnavailable: "Select rows isn’t available on this sheet",
  selectShort: "Select",
  undo: "Undo",
  undoShort: "Undo (⌘Z)",
  redo: "Redo",
  redoShort: "Redo (⌘⇧Z)",
  actionHistory: "Action history",
  folderHasBudget: "Folder already contains a budget",
  deleteSelected: "Delete selected",
  deleteSheet: "Delete sheet",
  deleteThisRow: "Delete this row",
  justThisOne: "Just this one",
  thisAndAllFuture: "This and all future ({n})",
  thisAndAllThrough: "This and all through {date} ({n})",
  deleteRows: "Delete {n} rows",
  deleteRowOne: "Delete {n} row",
  removeCorrection: "Remove correction",
  deleteAccount: "Delete account",
  removeBalanceCorrection: "Remove balance correction",
  aboutToSignOut: "About to sign out",
  signOutWarning:
    "You're about to be signed out in {seconds} seconds for inactivity.",
  stayActive: "Stay signed in",
  signOutNow: "Sign out now",
  balanceCorrection: "Balance correction",
} as const;

export type AppCatalog = Widen<typeof app>;

export default app;
