import { createContext, useContext } from "react";

import type { Row } from "../data/types";

// Modal-open commands the page chrome (header menu, bottom bar, header
// star, sync status), the pages (budget / accounts title menus), and the
// budget table's per-row affordances dispatch instead of each receiving a
// per-modal opener callback as a prop. AppShell owns the modal state and
// supplies the dispatch through context; the caller just names the modal
// it wants opened. Adding such a modal becomes a new command kind plus a
// handler in AppShell, rather than a new prop threaded down the page /
// chrome / row trees.
//
// Scope: the chrome-only modals (settings, changelog, search, …), the
// sheet-meta / download triggers that live on both the bottom bar and the
// page title menus (carrying the `sheetId` they act on), and the
// budget-row triggers fired from `BudgetRow` / `BudgetEntryActionsMenu` /
// the correction-line divider (carrying the `Row` they act on). The
// AppShell handlers keep their own guards — e.g. `open-delete-row`
// discards an unsaved placeholder row instead of prompting — so a command
// only names the user's intent; the handler decides what actually opens.
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
  | { kind: "open-download-sheet"; sheetId: string }
  | { kind: "open-edit-entry"; row: Row }
  | { kind: "open-edit-row"; row: Row }
  | { kind: "open-delete-row"; row: Row }
  | { kind: "open-split-row"; row: Row }
  | { kind: "open-transfer-row"; row: Row }
  | { kind: "open-match-rule"; row: Row }
  | { kind: "open-edit-history"; row: Row }
  | { kind: "open-copy-row"; row: Row }
  | { kind: "open-correction-delete"; row: Row };

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
  // Budget-row triggers. Each receives the `Row` the user acted on; the
  // handler resolves what to open (and may no-op / dispatch directly,
  // e.g. discarding an unsaved row or guarding a synthesized row).
  editEntry: (row: Row) => void;
  editRow: (row: Row) => void;
  deleteRow: (row: Row) => void;
  splitRow: (row: Row) => void;
  transferRow: (row: Row) => void;
  matchRule: (row: Row) => void;
  editHistory: (row: Row) => void;
  copyRow: (row: Row) => void;
  correctionDelete: (row: Row) => void;
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
    case "open-edit-entry":
      handlers.editEntry(command.row);
      return;
    case "open-edit-row":
      handlers.editRow(command.row);
      return;
    case "open-delete-row":
      handlers.deleteRow(command.row);
      return;
    case "open-split-row":
      handlers.splitRow(command.row);
      return;
    case "open-transfer-row":
      handlers.transferRow(command.row);
      return;
    case "open-match-rule":
      handlers.matchRule(command.row);
      return;
    case "open-edit-history":
      handlers.editHistory(command.row);
      return;
    case "open-copy-row":
      handlers.copyRow(command.row);
      return;
    case "open-correction-delete":
      handlers.correctionDelete(command.row);
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
