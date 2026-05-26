import type { ReconciliationApply } from "../accounts/ReconciliationModal";
import type { RenameSuggestion } from "../../data/rename-patterns";
import type { MatchCandidate, OrphanRow } from "../../data/reconciliation";
import type { ParsedBankEntry } from "../../storage/banks";
import type { CellValue, HistoryEntry, Row, UserData } from "../../data/types";

// Per-row modal prompts. Each variant captures the row the user
// targeted so the modal can render against a stable snapshot even if
// the underlying data changes.
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
// `ReconciliationModal`.
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
// the ComplexEntryModal's submit so the dispatcher knows the
// candidate key to mark as consumed and the raw bank text for the
// merchant-hint key.
export type RecurringPromoteContext = {
  key: string;
  sourceDescription: string;
};
