import { createContext, useContext } from "react";

// Modal-open commands the page chrome (header menu, bottom bar, header
// star, sync status) and the pages (budget / accounts title menus)
// dispatch instead of each receiving a per-modal opener callback as a
// prop. AppShell owns the modal state and supplies the dispatch through
// context; the caller just names the modal it wants opened. Adding such
// a modal becomes a new command kind plus a handler in AppShell, rather
// than a new prop threaded down the page / chrome trees.
//
// Scope: the chrome-only modals (settings, changelog, search, …) plus
// the sheet-meta / download triggers that live on both the bottom bar
// and the page title menus. The sheet-meta/download commands carry the
// `sheetId` they act on. Page-level row triggers (edit / split / delete
// a budget row) stay on the prop path until a later slice — see the
// AppShell modal-mount entry in docs/refactoring-roadmap.md.
export type ModalCommand =
  | { kind: "open-settings" }
  | { kind: "open-changelog" }
  | { kind: "open-search" }
  | { kind: "open-action-history" }
  | { kind: "open-achievements-list" }
  | { kind: "open-achievements-unlock" }
  | { kind: "open-sync-details" }
  | { kind: "open-new-sheet" }
  | { kind: "open-edit-sheet"; sheetId: string }
  | { kind: "open-download-sheet"; sheetId: string };

export type ModalDispatch = (command: ModalCommand) => void;

// Imperative handlers AppShell wires to each command. Kept separate
// from the dispatch so `applyModalCommand` stays a pure function that
// unit tests can drive with spies — the chrome → command → handler
// mapping is verified without rendering AppShell.
export type ModalCommandHandlers = {
  openSettings: () => void;
  openChangelog: () => void;
  openSearch: () => void;
  openActionHistory: () => void;
  openAchievementsList: () => void;
  openAchievementsUnlock: () => void;
  openSyncDetails: () => void;
  openNewSheet: () => void;
  openEditSheet: (sheetId: string) => void;
  openDownloadSheet: (sheetId: string) => void;
};

export function applyModalCommand(
  command: ModalCommand,
  handlers: ModalCommandHandlers,
): void {
  switch (command.kind) {
    case "open-settings":
      handlers.openSettings();
      return;
    case "open-changelog":
      handlers.openChangelog();
      return;
    case "open-search":
      handlers.openSearch();
      return;
    case "open-action-history":
      handlers.openActionHistory();
      return;
    case "open-achievements-list":
      handlers.openAchievementsList();
      return;
    case "open-achievements-unlock":
      handlers.openAchievementsUnlock();
      return;
    case "open-sync-details":
      handlers.openSyncDetails();
      return;
    case "open-new-sheet":
      handlers.openNewSheet();
      return;
    case "open-edit-sheet":
      handlers.openEditSheet(command.sheetId);
      return;
    case "open-download-sheet":
      handlers.openDownloadSheet(command.sheetId);
      return;
  }
}

const ModalDispatchContext = createContext<ModalDispatch | null>(null);

export const ModalDispatchProvider = ModalDispatchContext.Provider;

// Chrome components call this to open a universal modal. Throws when
// used outside the provider so a missing wrap surfaces immediately
// instead of a button silently no-opping.
export function useModalDispatch(): ModalDispatch {
  const dispatch = useContext(ModalDispatchContext);
  if (!dispatch) {
    throw new Error(
      "useModalDispatch must be used within a ModalDispatchProvider",
    );
  }
  return dispatch;
}
