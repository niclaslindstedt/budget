import type { ReconciliationApply } from "../accounts/AccountReconciliationModal";
import type { RenameSuggestion } from "../../data/rename-patterns";
import type { MatchCandidate, OrphanRow } from "../../data/reconciliation";
import type { ParsedBankEntry } from "../../storage/banks";
import type { StorageAdapter } from "../../storage/adapter";
import type {
  BackendId,
  EncryptionMode,
} from "../../storage/backend-preference";
import type {
  CellValue,
  HeaderAction,
  HistoryEntry,
  Row,
  Sheet,
  StoredUser,
  UserData,
} from "../../data/types";
import type { useT } from "../../i18n";

// Auth-shaped slice of the AppShell prop boundary. Bundled together
// so App.tsx forwards one object instead of threading eight individual
// props through (every new auth callback or per-user flag would otherwise
// widen the AppShell signature).
export type AppShellAuth = {
  user: StoredUser;
  // The active user's password — handed to the idle tracker so it can
  // re-stamp `sessionStorage` with the user's chosen TTL on each tick.
  password: string;
  hasOtherUsers: boolean;
  // Returns the active user's password — used by the export flow to
  // wrap downloaded files in the same envelope shape the storage
  // adapter uses.
  getEncryptionPassword: () => string | null;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
};

// Storage / backend slice of the AppShell prop boundary. Bundled so
// the adapter + per-backend connection flags + every backend callback
// flow as one object instead of ~20 individual props. New backends
// (or new per-backend toggles) extend the bundle rather than the
// AppShell signature.
export type AppShellStorage = {
  adapter: StorageAdapter;
  backend: BackendId;
  encryption: EncryptionMode;
  cloudOfflineMode: boolean;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  folderAvailable: boolean;
  folderReconnectNeeded: boolean;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => Promise<void>;
  onDisconnectGdrive: () => void;
  onReconnectCloud: () => Promise<void>;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
  onSetCloudOfflineMode: (on: boolean) => void;
};

export type DeletePrompt = { kind: "delete"; row: Row };
export type EditPrompt = { kind: "edit"; row: Row };
export type EditRowPrompt = { kind: "edit-row"; row: Row };
export type SplitPrompt = { kind: "split"; row: Row };
export type BulkDeletePrompt = { kind: "bulk-delete"; rowIds: string[] };
export type MoveCopyPrompt = { kind: "move" | "copy"; rows: Row[] };

export type PendingSeriesEdit = {
  rowId: string;
  columnId: string;
  // Pre-snapshotted so the dialog renders without re-deriving from
  // possibly-stale row state if the user kept editing elsewhere.
  fieldLabel: string;
  anchorDate: string;
  lastSeriesDate: string | null;
  value: CellValue;
};

// Reconciliation modal state, populated after the user picks a bank
// file but BEFORE the import is committed to `state.history`. The
// modal is the commit gate: Apply / Skip-all dispatch the deferred
// `importBankHistory`, X / Escape / click-outside discard the parsed
// file unread. Snapshotted from the pre-import data + parsed entries
// so the modal doesn't have to chase the reducer to reproduce the
// matcher's view of the world.
export type ReconciliationState = {
  accountId: string;
  // For rendering: pre-import data so the modal can look up row /
  // entry shapes from a stable reference even if the user keeps
  // working in the background.
  preImportData: UserData;
  // Entries that WILL be added when the import commits (i.e. the
  // freshly parsed rows minus those that dedup against the existing
  // history). Computed once so the matcher view stays stable across
  // background edits.
  newEntries: HistoryEntry[];
  candidates: MatchCandidate[];
  orphans: OrphanRow[];
  // Parsed bank file held in memory until commit. Dispatched verbatim
  // as the `importBankHistory` payload when the user clicks Apply or
  // Skip all; dropped on cancel.
  pendingImport: {
    bankParserId: string;
    bankClearing?: string;
    bankAccountNumber?: string;
    filename: string;
    entries: ParsedBankEntry[];
    now: number;
  };
};

// Rename-predictor modal state. Populated as the last step of every
// import pipeline that has learned renames to suggest. Holds the
// staged commit payload so the import is only dispatched when the user
// commits via Skip / Apply — Cancel drops everything and nothing lands
// in `state.history`. The reconciliation payload is `null` on the
// quiet-path branch (no candidates / orphans to triage) and a
// populated object when we deferred dispatch through
// `AccountReconciliationModal`.
export type RenamePredictorState = {
  accountId: string;
  suggestions: RenameSuggestion[];
  pendingImport: ReconciliationState["pendingImport"];
  pendingReconciliation: {
    decisions: ReconciliationApply;
  } | null;
};

// In-flight recurring-candidate promotion. Captured when the user
// clicks Promote on the recurring-candidate panel and consumed by
// the BudgetComplexEntryModal's submit so the dispatcher knows the
// candidate key to mark as consumed and the raw bank text for the
// merchant-hint key.
export type RecurringPromoteContext = {
  key: string;
  sourceDescription: string;
};

// Retrospective orphan-triage modal state. Null = closed. Populated
// when the user taps a covered month's "N entries to move or delete"
// footer button in the budget page; cleared on apply / cancel. Same
// modal component as the import-time reconciliation, but here the
// pendingImport is null because no import is in flight.
export type ManualTriageState = {
  accountId: string;
  preImportData: UserData;
  orphans: OrphanRow[];
};

// Balance-correction row queued for deletion (set when the user
// clicks the divider line in the budget view). The deltaText is
// pre-formatted so the ConfirmDialog body keeps reading naturally
// after the row itself is gone.
export type CorrectionDeletePrompt = {
  sheetId: string;
  itemId: string;
  rowId: string;
  deltaText: string;
};

// Pattern-rule modal entry-point. Three shapes cover the entry paths:
// `entryId` from a synthesized history row (looked up against
// `data.history` so a concurrent re-import / delete closes the modal
// cleanly), `row` from a user-authored budget row (the row itself
// carries everything the modal needs to seed), and `ruleId` from the
// Patterns tab in Settings (no seed; opens the modal in edit mode).
export type MatchRulePrompt =
  | { kind: "history"; entryId: string }
  | { kind: "row"; row: Row }
  | { kind: "edit"; ruleId: string };

export function headerActionDescription(
  action: HeaderAction,
  sheets: readonly Sheet[],
  t: ReturnType<typeof useT>,
): string {
  if (action.kind === "sheet") {
    const target = sheets.find((s) => s.id === action.sheetId);
    // Dangling reference falls back to the default action's label
    // so the tooltip matches what the click will actually do.
    if (!target) return t("settings.headerAction.top");
    return t("settings.headerAction.sheet", { name: target.name });
  }
  return t(`settings.headerAction.${action.kind}`);
}
