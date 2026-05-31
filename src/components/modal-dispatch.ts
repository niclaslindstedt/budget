import { createContext, useContext, useEffect, useRef } from "react";

import type { Row } from "../data/types";

// Modal-open commands the page chrome (header menu, bottom bar, header
// star, sync status), the pages (budget / accounts title menus), and the
// budget table's per-row affordances dispatch instead of each receiving a
// per-modal opener callback as a prop. The caller just names the modal it
// wants opened; whoever owns that modal's state supplies the handler.
// Adding such a modal becomes a new command kind plus a handler, rather
// than a new prop threaded down the page / chrome / row trees.
//
// Scope: the chrome-only modals (settings, changelog, search, …), the
// sheet-meta / download triggers that live on both the bottom bar and the
// page title menus (carrying the `sheetId` they act on), and the
// budget-row triggers fired from `BudgetRow` / `BudgetEntryActionsMenu` /
// the correction-line divider (carrying the `Row` they act on). Handlers
// keep their own guards — e.g. `open-delete-row` discards an unsaved
// placeholder row instead of prompting — so a command only names the
// user's intent; the handler decides what actually opens.
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
  | { kind: "open-line-items"; row: Row }
  | { kind: "open-transfer-row"; row: Row }
  | { kind: "open-match-rule"; row: Row }
  | { kind: "open-edit-history"; row: Row }
  | { kind: "open-copy-row"; row: Row }
  | { kind: "open-correction-delete"; row: Row }
  | { kind: "open-edit-company"; companyId: string };

export type ModalDispatch = (command: ModalCommand) => void;

// Imperative handlers wired to each command. Kept separate from the
// dispatch so `applyModalCommand` stays a pure function that unit tests
// can drive with spies — the chrome → command → handler mapping is
// verified without rendering AppShell.
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
  lineItems: (row: Row) => void;
  transferRow: (row: Row) => void;
  matchRule: (row: Row) => void;
  editHistory: (row: Row) => void;
  copyRow: (row: Row) => void;
  correctionDelete: (row: Row) => void;
  // Open the company editor for an existing company. Fired by the
  // long-press / right-click escape hatch on a budget row's company
  // pill, so the user can rename a merchant (or re-pin its associated
  // types) without detouring through Settings → Companies.
  editCompany: (companyId: string) => void;
};

// A subset of the handler table. AppShell supplies a base slice (the
// handlers whose state it still owns); each modal host that owns a hook's
// state registers the slice it can open via `useRegisterModalHandlers`.
// The provider merges them at dispatch time, so a handler travels with
// the state it opens rather than being forced to live on AppShell.
export type PartialModalCommandHandlers = Partial<ModalCommandHandlers>;

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
    case "open-line-items":
      handlers.lineItems(command.row);
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
    case "open-edit-company":
      handlers.editCompany(command.companyId);
      return;
  }
}

// Fold the base slice and every registered slice into one handler table.
// Later slices win on key collision, so a host that takes over a handler
// AppShell still lists in its base slice would override it — but the
// migration drops the key from the base slice in the same change, so in
// practice the slices are disjoint and the order only matters as a
// tie-break. Kept pure (and exported) so the merge is unit-testable
// without rendering the provider.
export function mergeHandlerSlices(
  base: PartialModalCommandHandlers,
  slices: Iterable<PartialModalCommandHandlers>,
): PartialModalCommandHandlers {
  const merged: PartialModalCommandHandlers = { ...base };
  for (const slice of slices) Object.assign(merged, slice);
  return merged;
}

// A getter for one contributor's current slice. The provider reads it on
// every dispatch so a host can register once and still expose fresh
// closures.
export type SliceGetter = () => PartialModalCommandHandlers;

// Shared context value. The provider (`ModalDispatchProvider`, in its own
// file so the module stays component-free) supplies both halves: the
// `dispatch` consumers call and the `registerHandlers` hosts call.
export type ModalDispatchContextValue = {
  dispatch: ModalDispatch;
  registerHandlers: (getter: SliceGetter) => () => void;
};

export const ModalDispatchContext =
  createContext<ModalDispatchContextValue | null>(null);

function useModalDispatchContext(): ModalDispatchContextValue {
  const ctx = useContext(ModalDispatchContext);
  if (!ctx) {
    throw new Error(
      "useModalDispatch must be used within a ModalDispatchProvider",
    );
  }
  return ctx;
}

// Chrome / page / row components call this to open a modal. Throws when
// used outside the provider so a missing wrap surfaces immediately
// instead of a button silently no-opping.
export function useModalDispatch(): ModalDispatch {
  return useModalDispatchContext().dispatch;
}

// A modal host that owns a hook's state calls this to register the slice
// of handlers it can open. The slice is read fresh on every dispatch (via
// a ref) so the host can pass inline closures without re-registering; the
// registration itself runs once per mount and tears down on unmount.
export function useRegisterModalHandlers(
  slice: PartialModalCommandHandlers,
): void {
  const { registerHandlers } = useModalDispatchContext();
  const sliceRef = useRef(slice);
  sliceRef.current = slice;
  useEffect(() => registerHandlers(() => sliceRef.current), [registerHandlers]);
}
