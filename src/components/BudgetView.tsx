import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AccountModal, type AccountDraft } from "./AccountModal";
import { UpdateBalanceModal } from "./UpdateBalanceModal";
import { AccountsSheetView } from "./AccountsSheetView";
import { ApplySeriesEditDialog } from "./ApplySeriesEditDialog";
import { BudgetLoading } from "./BudgetLoading";
import { ChangelogModal } from "./ChangelogModal";
import { BulkActionBar } from "./BulkActionBar";
import { BulkEditModal, type BulkPatch } from "./BulkEditModal";
import { SheetModal, type SheetDraft } from "./SheetModal";
import {
  TransactionModal,
  type TransactionDraft,
  type TransactionModalRequest,
} from "./TransactionModal";
import { SheetTabs } from "./SheetTabs";
import {
  ComplexEntryModal,
  type ComplexEntryDraft,
  type ComplexEntrySeed,
} from "./ComplexEntryModal";
import { ConfirmDialog, type ConfirmAction } from "./ConfirmDialog";
import {
  EditEntryModal,
  type EditPatch,
  type EditScope,
  type HistoryMatchPreview,
  type HistoryPromotePrefill,
} from "./EditEntryModal";
import {
  EditRowModal,
  type EditRowPatch,
  type EditRowScope,
} from "./EditRowModal";
import { SplitEntryModal, type SplitSubmission } from "./SplitEntryModal";
import { DownloadModal, type DownloadConfig } from "./DownloadModal";
import { HistoryEntryEditModal } from "./HistoryEntryEditModal";
import { HistoryModal } from "./HistoryModal";
import { ImportHistoryModal } from "./ImportHistoryModal";
import {
  ReconciliationModal,
  type ReconciliationApply,
} from "./ReconciliationModal";
import { MatchRuleModal, type MatchRuleDraft } from "./MatchRuleModal";
import { MoveCopyModal } from "./MoveCopyModal";
import { HeaderMenu } from "./HeaderMenu";
import { UndoRedoBar } from "./UndoRedoBar";
import { SaveStateButton } from "./SaveStateButton";
import { SettingsModal } from "./SettingsModal";
import { SheetView } from "./SheetView";
import { ConflictResolutionModal } from "./ConflictResolutionModal";
import { ReconnectCloudModal } from "./ReconnectCloudModal";
import { SyncDetailsModal } from "./SyncDetailsModal";
import { SyncStatus } from "./SyncStatus";
import {
  buildBudgetExportRows,
  CSV_MIME_TYPE,
  exportRowsToTable,
  rowsToCsv,
} from "../data/budget-export";
import {
  buildAccountsExport,
  JSON_MIME_TYPE,
  serializeAccountsExport,
} from "../data/accounts-export";
import { allCategories, allTypes } from "../data/presets";
import {
  accountBalance,
  createDefaultSheet,
  findColumnByType,
  getLastSeriesDate,
  getMonthKey,
  isRowSavable,
  newId,
  rowsInSeriesFrom,
  userDataWithSavableRows,
} from "../data/sheet";
import { coverageDelta, coveredMonths } from "../data/coverage";
import { detectPaydayDayOfMonth } from "../data/payday";
import {
  findCandidates,
  findOrphans,
  findRuleDrivenCandidates,
  type MatchCandidate,
  type OrphanRow,
} from "../data/reconciliation";
import type {
  Account,
  AccountBudget,
  Category,
  CellValue,
  Column,
  EntryType,
  HistoryEntry,
  HistoryEntrySplit,
  MatchRule,
  Row,
  Settings,
  Sheet,
  StoredUser,
  Transaction,
  UserData,
} from "../data/types";
import { normaliseDescription } from "../data/description-normaliser";
import { RecurringCandidatesPanel } from "./RecurringCandidatesPanel";
import { TransferCollapseModal } from "./TransferCollapseModal";
import type { RecurringCandidate } from "../data/recurring-detection";
import {
  detectTransferCandidates,
  type TransferCandidate,
} from "../data/transfer-collapse";
import {
  type RecurrenceRule,
  shiftRuleStartToFuture,
} from "../data/recurrence";
import { reducer } from "../data/reducer";
import type { StorageAdapter } from "../storage/adapter";
import {
  type BackendId,
  type EncryptionMode,
  getCloudReauthAutoOpen,
  setCloudReauthAutoOpen,
} from "../storage/backend-preference";
import { mergeHistory, type ParsedBankFile } from "../storage/bank-parsers";
import { useUserDataStorage } from "../storage/useUserDataStorage";
import {
  type AccountsDownloadPrefs,
  type BudgetDownloadPrefs,
  getAccountsDownloadPrefs,
  getBudgetDownloadPrefs,
  setAccountsDownloadPrefs,
  setBudgetDownloadPrefs,
} from "../storage/download-preferences";
import { bcp47, type Lang, useT } from "../i18n";
import { useChangelogAutoOpen, useIdleSignOut, useTheme } from "../hooks";
import { writeLanguagePreference } from "../i18n/language-preference";
import { BUILD_LABEL } from "../utils/build-env";
import { todayIso } from "../utils/date";
import {
  slugifyFilename,
  todayStamp,
  triggerDownload,
} from "../utils/download";
import { formatNumber, withCurrency } from "../utils/format";
import { buildXlsx, XLSX_MIME_TYPE } from "../utils/xlsx";
import { budgetExportFormats } from "../utils/xlsx-format";

type DeletePrompt = { kind: "delete"; row: Row };
type EditPrompt = { kind: "edit"; row: Row };
type EditRowPrompt = { kind: "edit-row"; row: Row };
type SplitPrompt = { kind: "split"; row: Row };
type BulkDeletePrompt = { kind: "bulk-delete"; rowIds: string[] };
type MoveCopyPrompt = { kind: "move" | "copy"; rows: Row[] };
type PendingSeriesEdit = {
  rowId: string;
  columnId: string;
  // Pre-snapshotted so the dialog renders without re-deriving from
  // possibly-stale row state if the user kept editing elsewhere.
  fieldLabel: string;
  anchorDate: string;
  lastSeriesDate: string | null;
  value: CellValue;
};

// Reconciliation modal state, populated immediately after an import
// dispatch. Snapshotted from the pre-import data + parsed entries so
// the modal doesn't have to chase the reducer to reproduce the
// matcher's view of the world. The reducer applies stored series
// rules silently in advance; `candidates` therefore only contains
// pairs that don't already fit a learned rule.
type ReconciliationState = {
  accountId: string;
  // For rendering: pre-import data so the modal can look up row /
  // entry shapes from a stable reference even if the user keeps
  // working in the background.
  preImportData: UserData;
  // History entries newly added by this import (excluding ones the
  // silent series-rule pass already paired up).
  newEntries: HistoryEntry[];
  candidates: MatchCandidate[];
  orphans: OrphanRow[];
  // Day-of-month the orphan move-to picker defaults to.
  paydayDay: number;
};

// In-flight recurring-candidate promotion. Captured when the user
// clicks Promote on the recurring-candidate panel and consumed by
// the ComplexEntryModal's submit so the dispatcher knows the
// candidate key to mark as consumed and the raw bank text for the
// merchant-hint key.
type RecurringPromoteContext = {
  key: string;
  sourceDescription: string;
};

type BudgetViewProps = {
  adapter: StorageAdapter;
  user: StoredUser;
  // The active user's password — handed to the idle tracker so it can
  // re-stamp `sessionStorage` with the user's chosen TTL on each tick.
  password: string;
  hasOtherUsers: boolean;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  folderAvailable: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  cloudOfflineMode: boolean;
  // Returns the active user's password — used by the export flow to
  // wrap downloaded files in the same envelope shape the storage
  // adapter uses.
  getEncryptionPassword: () => string | null;
  // App owns this ref and reads it from the cloud-link conflict path
  // when the user picks "replace with current budget"; BudgetView's
  // job is to keep it pointed at whatever `useUserDataStorage` is
  // showing on screen so the upload reflects the latest in-memory edits.
  currentDataRef: React.MutableRefObject<UserData | null>;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
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

export function BudgetView({
  adapter,
  user,
  password,
  hasOtherUsers,
  backend,
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  folderAvailable,
  folderReconnectNeeded,
  encryption,
  cloudOfflineMode,
  getEncryptionPassword,
  currentDataRef,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onDeleteAccount,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onReconnectCloud,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onSelectBrowser,
  onSetEncryption,
  onSetCloudOfflineMode,
}: BudgetViewProps) {
  const t = useT();
  const {
    data,
    dispatch,
    status,
    dirty,
    saveNow,
    resolveKeepLocal,
    resolveKeepRemote,
    confirmShrinkSave,
    discardShrinkSave,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUserDataStorage(adapter, reducer, {
    beforeSerialize: userDataWithSavableRows,
  });
  // Mirror in-memory data into the App-owned ref so the cloud-link
  // conflict path can upload the latest budget. Updated on every render
  // because both data changes and ref-identity changes (after a sign-
  // out / sign-in round trip) need to land here.
  useEffect(() => {
    currentDataRef.current = data;
  }, [currentDataRef, data]);
  const [complexOpen, setComplexOpen] = useState(false);
  const [complexSeedDate, setComplexSeedDate] = useState("");
  // Pre-fill payload for the ComplexEntryModal. `null` keeps the modal's
  // existing blank-form behaviour for the budget add-row button; a
  // populated seed comes from the recurring-candidate promote flow.
  const [complexSeed, setComplexSeed] = useState<ComplexEntrySeed | null>(null);
  // Promote-flow context. When set, the ComplexEntryModal opens pre-
  // filled with the candidate's detected description / amount / cadence
  // and a submit dispatches `promoteRecurringCandidate` (instead of
  // `addRowsFromComplex`) so the candidate is consumed and the merchant
  // hint is recorded against the original bank text.
  const [recurringPromoteContext, setRecurringPromoteContext] =
    useState<RecurringPromoteContext | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [editPrompt, setEditPrompt] = useState<EditPrompt | null>(null);
  // Generic row editor — opens on long-press or the pen action button.
  // Distinct from `editPrompt`, which drives `EditEntryModal` (the
  // recurring promote / series editor).
  const [editRowPrompt, setEditRowPrompt] = useState<EditRowPrompt | null>(
    null,
  );
  // Split-entry modal state. Opens when the scissors action button is
  // clicked. Cleared on save / cancel and self-clears when the row it
  // targets disappears (e.g. via an undo or a concurrent edit).
  const [splitPrompt, setSplitPrompt] = useState<SplitPrompt | null>(null);
  // Captures the most recent inline edit on a recurring row so the user
  // can choose to fan the change out to every following entry in the
  // series. `null` while no prompt is pending.
  const [pendingSeriesEdit, setPendingSeriesEdit] =
    useState<PendingSeriesEdit | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeletePrompt, setBulkDeletePrompt] =
    useState<BulkDeletePrompt | null>(null);
  const [moveCopyPrompt, setMoveCopyPrompt] = useState<MoveCopyPrompt | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  // Auto-surface the sync-details modal for states the user can't
  // ignore: a paused shrink save (data-loss safeguard) and a parse
  // failure (build can't read the stored bytes). Both block
  // autosave, so the user must see the explanation to act.
  useEffect(() => {
    if (status.kind === "shrink-warning" || status.kind === "parse-error") {
      setSyncDetailsOpen(true);
    }
  }, [status.kind]);
  const [reconnectCloudOpen, setReconnectCloudOpen] = useState(false);
  const [cloudReauthAutoOpen, setCloudReauthAutoOpenState] = useState(() =>
    getCloudReauthAutoOpen(),
  );
  const handleSetCloudReauthAutoOpen = useCallback((on: boolean) => {
    setCloudReauthAutoOpen(on);
    setCloudReauthAutoOpenState(on);
  }, []);
  // Auto-open the dedicated reconnect modal the moment a cloud
  // auth-error surfaces, so the user can reconnect without hunting
  // for the status pill. The `cloudReauthAutoOpen` device preference
  // flips this off for users who'd rather notice on their own.
  // Anchored on `status.kind` so it fires exactly once per error
  // transition — re-opens on every new auth-error, not on every
  // render while one sits there.
  useEffect(() => {
    if (status.kind !== "auth-error") return;
    if (!cloudReauthAutoOpen) return;
    setReconnectCloudOpen(true);
  }, [status.kind, cloudReauthAutoOpen]);
  // Once the storage hook moves out of `auth-error` (token refreshed,
  // user disconnected, backend swapped), drop the modal automatically
  // so it doesn't sit on top of the sheet after the user has solved
  // the problem somewhere else.
  useEffect(() => {
    if (status.kind !== "auth-error" && reconnectCloudOpen) {
      setReconnectCloudOpen(false);
    }
  }, [status.kind, reconnectCloudOpen]);
  // Bumped each time the user clicks the budget icon/title in the
  // header. SheetView watches this counter and re-scrolls to today's
  // row (or the current fiscal month) on every increment, even when
  // the active sheet and month haven't changed.
  const [scrollToTodayTick, setScrollToTodayTick] = useState(0);
  const onScrollToToday = useCallback(() => {
    setScrollToTodayTick((tick) => tick + 1);
  }, []);
  // null = closed; { sheet: null } = new-sheet modal; { sheet: <Sheet> } = edit.
  const [sheetModal, setSheetModal] = useState<{ sheet: Sheet | null } | null>(
    null,
  );
  // null = closed; otherwise the sheet queued for deletion. Rendered as a
  // ConfirmDialog on top of the SheetModal so the user has a chance to
  // back out before the dispatch fires.
  const [deleteSheetPrompt, setDeleteSheetPrompt] = useState<{
    sheetId: string;
    name: string;
  } | null>(null);
  // null = closed; { account: null } = create-account modal; otherwise edit.
  const [accountModal, setAccountModal] = useState<{
    account: Account | null;
  } | null>(null);
  // null = closed; otherwise the account queued for deletion. Rendered
  // as a ConfirmDialog on top of the AccountModal so an accidental tap
  // on the trash button doesn't wipe the account, its transactions, and
  // its history entries in one shot.
  const [deleteAccountPrompt, setDeleteAccountPrompt] = useState<{
    accountId: string;
    name: string;
  } | null>(null);
  // null = closed; otherwise the id of the account whose balance the
  // user is updating from the Accounts page. The modal looks the account
  // up by id each render so a concurrent rename / delete doesn't strand
  // a stale snapshot in component state.
  const [updateBalanceForId, setUpdateBalanceForId] = useState<string | null>(
    null,
  );
  // Account ids for the import-history and view-history modals.
  // Same null-or-id pattern as `updateBalanceForId` so a concurrent
  // delete / rename doesn't leave a stale snapshot in state.
  const [importHistoryForId, setImportHistoryForId] = useState<string | null>(
    null,
  );
  const [viewHistoryForId, setViewHistoryForId] = useState<string | null>(null);
  // Post-import reconciliation modal state. Null = closed. Populated
  // when an import produces candidate merges or orphans the user
  // should triage; cleared on apply / cancel.
  const [reconciliation, setReconciliation] =
    useState<ReconciliationState | null>(null);
  // null = closed; otherwise the id of the correction row queued for
  // deletion (set when the user clicks the divider line in the budget
  // view). The ConfirmDialog renders against this state to ask for
  // confirmation before dispatching `deleteRows`.
  const [correctionDeletePrompt, setCorrectionDeletePrompt] = useState<{
    sheetId: string;
    itemId: string;
    rowId: string;
    deltaText: string;
  } | null>(null);
  // null = closed; otherwise the request describes the mode (promote /
  // create / edit). The TransactionModal seeds itself from the request.
  const [transactionRequest, setTransactionRequest] =
    useState<TransactionModalRequest | null>(null);
  // null = closed; otherwise the history entry the user invoked the
  // pattern-rule modal from. Looked up by id each render so a
  // concurrent re-import / delete can't leave a stale entry snapshot
  // stranded in state; if the entry is gone the modal closes.
  const [matchRulePrompt, setMatchRulePrompt] = useState<{
    entryId: string;
  } | null>(null);
  // null = closed; otherwise the history entry the user invoked the
  // per-entry edit modal from (the pen button on a history row).
  // Resolved fresh each render so a concurrent re-import / delete
  // can't strand a stale snapshot in state.
  const [historyEditPrompt, setHistoryEditPrompt] = useState<{
    entryId: string;
  } | null>(null);
  // null = closed; otherwise the sheet the user is downloading. The
  // shape carries the resolved prefs so the modal can seed itself
  // from per-device defaults without re-reading localStorage.
  const [downloadPrompt, setDownloadPrompt] = useState<{
    sheetId: string;
    budgetPrefs: BudgetDownloadPrefs;
    accountsPrefs: AccountsDownloadPrefs;
  } | null>(null);

  const activeSheet =
    data.sheets.find((s) => s.id === data.activeSheetId) ?? data.sheets[0];

  // The active sheet's first AccountBudget block. For sheets of type
  // "budget" this is what the rest of the view renders against. For
  // "accounts" sheets there's no budget item — `activeBudget` is null
  // and we render `AccountsSheetView` in place of `SheetView`. The
  // budget-only callbacks below fall back to a stub when null so the
  // type checker stays happy; they're never invoked while an accounts
  // sheet is active because the budget UI isn't on screen.
  const activeBudget: AccountBudget | null =
    activeSheet.items.find(
      (it): it is AccountBudget => it.type === "accountBudget",
    ) ?? null;
  const stubBudget = useMemo<AccountBudget>(
    () => ({
      id: "stub",
      type: "accountBudget",
      accountId: null,
      columns: [],
      rows: [],
    }),
    [],
  );
  const activeItem: AccountBudget = activeBudget ?? stubBudget;

  const sheetId = activeSheet.id;
  const itemId = activeItem.id;

  // Usage count for each EntryType, summed across every budget in the
  // workspace. Feeds the TypePicker's "most used first" sort so the
  // dropdown floats popular labels to the top, like a country picker's
  // common-locales section. Walking every row on every render is cheap
  // because the workspace is small (a few thousand rows at most) and
  // `data` is referentially stable between edits.
  // Merged category / type lists exposed to every picker, renderer,
  // and resolver. Built-in `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES`
  // come first (minus the ones the user has hidden via Settings),
  // followed by the user-added entries on `data.categories` /
  // `data.types`. Computing them once here keeps the merge rules in
  // one place — pickers downstream stay unaware of the preset / user
  // split.
  const allCategoriesMerged = useMemo(() => allCategories(data), [data]);
  const allTypesMerged = useMemo(() => allTypes(data), [data]);

  const typeUsageById = useMemo<ReadonlyMap<string, number>>(() => {
    const map = new Map<string, number>();
    for (const sheet of data.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        for (const row of item.rows) {
          if (typeof row.typeId !== "string") continue;
          map.set(row.typeId, (map.get(row.typeId) ?? 0) + 1);
        }
      }
    }
    return map;
  }, [data.sheets]);

  // Warn before unload when the in-memory state has changes the
  // auto-save deliberately skipped (e.g. a half-filled row). The
  // browser shows its own generic confirmation prompt; we just have
  // to opt in.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Global Cmd/Ctrl+Z (and Cmd/Ctrl+Shift+Z / Ctrl+Y for redo) handler.
  // Bails out when the focus is inside an editable element so the
  // browser's native field-level undo keeps working while typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (isUndo && canUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo && canRedo) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, canUndo, canRedo]);

  // Project the user's "Text size" preference onto the document root so
  // the body's `font-size: calc(... * var(--app-font-scale))` rule (and
  // every `rem`/`em` dimension downstream) picks up the multiplier.
  // Restored to the canonical 1 on sign-out so the auth screen always
  // renders at the default size.
  const fontScale = data.settings.fontScale;
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-scale",
      String(fontScale),
    );
    return () => {
      document.documentElement.style.removeProperty("--app-font-scale");
    };
  }, [fontScale]);

  // Theme / font / custom-theme — writes `data-theme`,
  // `--app-font-family`, and the inline colour / shape / motion vars
  // on `<html>` so the styles.css palette rules (and every Tailwind
  // utility resolved through `@theme inline`) follow the user's
  // Appearance picks. See src/hooks/useTheme.ts for the per-effect
  // contract.
  useTheme(data.settings);

  // Mirror the bucket's language preference into the plaintext
  // localStorage store and notify the top-level <LanguageProvider> in
  // main.tsx so the entire tree re-renders in the picked language.
  // The plaintext mirror lets the auth screen, the standalone routes,
  // and the loading shell start up in the right language before the
  // bucket loads (the bucket may be encrypted, so the canonical
  // setting isn't readable until after sign-in).
  const language = data.settings.language;
  useEffect(() => {
    writeLanguagePreference(language);
    document.documentElement.lang = bcp47(language);
    window.dispatchEvent(
      new CustomEvent<Lang>("budget:language", { detail: language }),
    );
  }, [language]);

  const isGuest = user.isDefault === true;
  const { warningSecondsLeft, onStaySignedIn } = useIdleSignOut({
    user,
    password,
    ttlMs: data.settings.sessionTimeoutMinutes * 60_000,
    onSignOut,
  });

  // Drop ids that no longer exist (e.g. after an import) so the toolbar
  // never claims a stale count.
  useEffect(() => {
    const existing = new Set(activeItem.rows.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (existing.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeItem.rows]);

  const onUpdateCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) =>
      dispatch({
        type: "updateCell",
        sheetId,
        itemId,
        rowId,
        columnId,
        value,
      }),
    [dispatch, sheetId, itemId],
  );
  const onCommitCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      const row = activeItem.rows.find((r) => r.id === rowId);
      if (!row?.seriesId) return;
      const col = activeItem.columns.find((c) => c.id === columnId);
      // Only propagate fields that make sense across every occurrence —
      // date and completed are inherently per-occurrence, balance is
      // computed.
      if (!col || (col.type !== "description" && col.type !== "amount")) {
        return;
      }
      const dateCol = findColumnByType(activeItem.columns, "date");
      const anchorDate =
        dateCol && typeof row.cells[dateCol.id] === "string"
          ? (row.cells[dateCol.id] as string)
          : "";
      let lastSeriesDate: string | null = null;
      if (dateCol) {
        const seriesDates = activeItem.rows
          .filter((r) => r.seriesId === row.seriesId)
          .map((r) => r.cells[dateCol.id])
          .filter((d): d is string => typeof d === "string");
        if (seriesDates.length > 0) {
          lastSeriesDate = seriesDates.sort().at(-1) ?? null;
        }
      }
      setPendingSeriesEdit({
        rowId,
        columnId,
        fieldLabel: col.label,
        anchorDate,
        lastSeriesDate,
        value,
      });
    },
    [activeItem.rows, activeItem.columns],
  );
  const onApplyPendingToFuture = useCallback(
    (untilIso: string | null) => {
      if (!pendingSeriesEdit) return;
      dispatch({
        type: "propagateCellToFuture",
        sheetId,
        itemId,
        rowId: pendingSeriesEdit.rowId,
        columnId: pendingSeriesEdit.columnId,
        value: pendingSeriesEdit.value,
        untilIso,
      });
      setPendingSeriesEdit(null);
    },
    [dispatch, pendingSeriesEdit, sheetId, itemId],
  );
  const onDismissPendingSeriesEdit = useCallback(() => {
    setPendingSeriesEdit(null);
  }, []);

  // Drop the pending prompt if the row vanishes (sheet switch, delete,
  // import) so a stale prompt can't fan out a no-longer-relevant edit.
  useEffect(() => {
    if (!pendingSeriesEdit) return;
    const exists = activeItem.rows.some(
      (r) => r.id === pendingSeriesEdit.rowId,
    );
    if (!exists) setPendingSeriesEdit(null);
  }, [pendingSeriesEdit, activeItem.rows]);
  // Same guard for the generic edit-row modal: if the row vanishes
  // while the modal is open the user would be staring at a stale
  // snapshot, so close it.
  useEffect(() => {
    if (!editRowPrompt) return;
    const exists = activeItem.rows.some((r) => r.id === editRowPrompt.row.id);
    if (!exists) setEditRowPrompt(null);
  }, [editRowPrompt, activeItem.rows]);
  // Same guard for the split modal. History rows aren't in
  // `activeItem.rows` (they're synthesized from `UserData.history`), so
  // their existence is verified against the active account's history
  // entries instead.
  useEffect(() => {
    if (!splitPrompt) return;
    if (splitPrompt.row.historyEntryId) {
      const entries =
        (activeItem.accountId && data.history[activeItem.accountId]) || [];
      const exists = entries.some(
        (e) => e.id === splitPrompt.row.historyEntryId,
      );
      if (!exists) setSplitPrompt(null);
      return;
    }
    const exists = activeItem.rows.some((r) => r.id === splitPrompt.row.id);
    if (!exists) setSplitPrompt(null);
  }, [splitPrompt, activeItem.rows, activeItem.accountId, data.history]);
  const onAddRow = useCallback(
    (date: string) => dispatch({ type: "addRow", sheetId, itemId, date }),
    [dispatch, sheetId, itemId],
  );
  const onToggleRowTransfer = useCallback(
    (row: Row) => {
      // Synthesized history rows can't be flipped via the budget-row
      // reducer — they're derived from `UserData.history`. Route those
      // through the entry-update path so the flag lands on the
      // underlying `HistoryEntry` (and propagates back via
      // `synthesizeHistoryRow` on the next render).
      if (row.historyEntryId) {
        const accountId = activeItem.accountId;
        if (!accountId) return;
        dispatch({
          type: "updateHistoryEntry",
          accountId,
          entryId: row.historyEntryId,
          patch: { isTransfer: !row.isTransfer },
        });
        return;
      }
      dispatch({ type: "toggleRowTransfer", sheetId, itemId, rowId: row.id });
    },
    [dispatch, sheetId, itemId, activeItem.accountId],
  );
  const onAddComplex = useCallback((date: string) => {
    setComplexSeedDate(date);
    setComplexSeed(null);
    setRecurringPromoteContext(null);
    setComplexOpen(true);
  }, []);
  const onDeleteRequest = useCallback(
    (row: Row) => {
      // A row that hasn't been persisted yet (no description + amount) is
      // a transient placeholder — discard it without prompting.
      if (!isRowSavable(row, activeItem.columns)) {
        dispatch({ type: "deleteRows", sheetId, itemId, rowIds: [row.id] });
        return;
      }
      setDeletePrompt({ kind: "delete", row });
    },
    [activeItem.columns, dispatch, sheetId, itemId],
  );
  const onEditRequest = useCallback((row: Row) => {
    setEditPrompt({ kind: "edit", row });
  }, []);
  const onEditRowRequest = useCallback((row: Row) => {
    // Synthesized rows (transaction / history) and balance-correction
    // rows have their own edit flows; the row component already
    // suppresses the long-press and the pen button on them, but guard
    // here too so a stray dispatch never opens the modal on a row it
    // can't meaningfully edit.
    if (row.transactionId || row.historyEntryId || row.isCorrection) return;
    setEditRowPrompt({ kind: "edit-row", row });
  }, []);
  const onSplitRequest = useCallback((row: Row) => {
    // Transactions have their own edit modal, correction rows are
    // display-only — splitting either of those is meaningless. History
    // rows are allowed: splitting a bank entry writes a `splits` array
    // on the underlying `HistoryEntry`, which the synthesizer fans out
    // into multiple rows on the next render.
    if (row.transactionId || row.isCorrection) return;
    setSplitPrompt({ kind: "split", row });
  }, []);
  const onMatchRuleRequest = useCallback((row: Row) => {
    // Only history rows render the button, but the prop type is the
    // generic Row shape so guard the marker explicitly.
    if (!row.historyEntryId) return;
    setMatchRulePrompt({ entryId: row.historyEntryId });
  }, []);
  const onEditHistoryRequest = useCallback((row: Row) => {
    if (!row.historyEntryId) return;
    setHistoryEditPrompt({ entryId: row.historyEntryId });
  }, []);
  const onUpdateHistoryEntry = useCallback(
    (
      accountId: string,
      entryId: string,
      patch: { userDescription?: string; userTypeId?: string | null },
    ) =>
      dispatch({
        type: "updateHistoryEntry",
        accountId,
        entryId,
        patch,
      }),
    [dispatch],
  );
  const onCorrectionDeleteRequest = useCallback(
    (row: Row) => {
      // Pre-format the signed delta so the prompt reads naturally even
      // after the row is gone (the dialog body keeps showing the text
      // until React unmounts it on close).
      const amountCol = findColumnByType(activeItem.columns, "amount");
      const amount =
        amountCol && typeof row.cells[amountCol.id] === "number"
          ? (row.cells[amountCol.id] as number)
          : 0;
      const sign = amount >= 0 ? "+" : "−";
      const deltaText = `${sign}${withCurrency(
        formatNumber(Math.abs(amount), data.settings),
        data.settings,
      )}`;
      setCorrectionDeletePrompt({
        sheetId,
        itemId: activeItem.id,
        rowId: row.id,
        deltaText,
      });
    },
    [activeItem, sheetId, data.settings],
  );
  const onReorderColumns = useCallback(
    (fromId: string, toId: string) =>
      dispatch({ type: "reorderColumns", sheetId, itemId, fromId, toId }),
    [dispatch, sheetId, itemId],
  );
  const onImport = useCallback(
    (next: UserData) => dispatch({ type: "replace", data: next }),
    [dispatch],
  );
  const onCreateCategory = useCallback(
    (draft: Omit<Category, "id">): Category => {
      const category: Category = { id: newId(), ...draft };
      dispatch({ type: "addCategory", category });
      return category;
    },
    [dispatch],
  );
  const onUpdateCategory = useCallback(
    (categoryId: string, patch: Partial<Omit<Category, "id">>) =>
      dispatch({ type: "updateCategory", categoryId, patch }),
    [dispatch],
  );
  const onDeleteCategory = useCallback(
    (categoryId: string) => dispatch({ type: "deleteCategory", categoryId }),
    [dispatch],
  );
  const onSetPresetCategoryHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetCategoryHidden", presetId, hidden }),
    [dispatch],
  );
  const onCreateType = useCallback(
    (draft: Omit<EntryType, "id">): EntryType => {
      const entryType: EntryType = { id: newId(), ...draft };
      dispatch({ type: "addType", entryType });
      return entryType;
    },
    [dispatch],
  );
  const onUpdateType = useCallback(
    (typeId: string, patch: Partial<Omit<EntryType, "id">>) =>
      dispatch({ type: "updateType", typeId, patch }),
    [dispatch],
  );
  const onDeleteType = useCallback(
    (typeId: string) => dispatch({ type: "deleteType", typeId }),
    [dispatch],
  );
  const onSetPresetTypeHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetTypeHidden", presetId, hidden }),
    [dispatch],
  );
  const onSetPresetTypeKind = useCallback(
    (presetId: string, kind: "income" | "expense" | "any") =>
      dispatch({ type: "setPresetTypeKind", presetId, kind }),
    [dispatch],
  );
  const onSaveSettings = useCallback(
    (settings: Settings) => dispatch({ type: "updateSettings", settings }),
    [dispatch],
  );

  const lastSeenChangelogVersion = data.settings.lastSeenChangelogVersion;
  const { isOpen: changelogOpen, onClose: onCloseChangelog } =
    useChangelogAutoOpen({
      settings: data.settings,
      lastSeenChangelogVersion,
      dispatch,
    });

  const onSelectSheet = useCallback(
    (id: string) => dispatch({ type: "selectSheet", sheetId: id }),
    [dispatch],
  );
  const onOpenNewSheet = useCallback(() => {
    setSheetModal({ sheet: null });
  }, []);
  const onOpenEditSheet = useCallback(
    (id: string) => {
      const target = data.sheets.find((s) => s.id === id);
      if (target) setSheetModal({ sheet: target });
    },
    [data.sheets],
  );
  const onOpenDownloadSheet = useCallback(
    (id: string) => {
      const target = data.sheets.find((s) => s.id === id);
      if (!target) return;
      setDownloadPrompt({
        sheetId: id,
        budgetPrefs: getBudgetDownloadPrefs(user.id),
        accountsPrefs: getAccountsDownloadPrefs(user.id),
      });
    },
    [data.sheets, user.id],
  );
  const onCloseDownload = useCallback(() => setDownloadPrompt(null), []);
  const onConfirmDownload = useCallback(
    (config: DownloadConfig) => {
      if (!downloadPrompt) return;
      const target = data.sheets.find((s) => s.id === downloadPrompt.sheetId);
      if (!target) {
        setDownloadPrompt(null);
        return;
      }
      const stamp = todayStamp();
      const baseSlug = slugifyFilename(target.name);
      if (config.kind === "budget") {
        const budgetItem = target.items.find(
          (it): it is AccountBudget => it.type === "accountBudget",
        );
        if (budgetItem) {
          const accountsById = new Map<string, string>();
          for (const a of data.accounts) accountsById.set(a.id, a.name);
          const opening = budgetItem.accountId
            ? (data.accounts.find((a) => a.id === budgetItem.accountId)
                ?.openingBalance ?? 0)
            : 0;
          const history = budgetItem.accountId
            ? (data.history[budgetItem.accountId] ?? [])
            : [];
          const rows = buildBudgetExportRows({
            item: budgetItem,
            openingBalance: opening,
            history,
            transactions: data.transactions,
            accountsById,
            types: allTypesMerged,
            categories: allCategoriesMerged,
            merchantHints: data.merchantHints,
            matchRules: data.matchRules,
            includeHistory: config.includeHistory,
            includeFuture: config.includeFuture,
          });
          const currencySuffix = data.settings.currency.trim();
          const amountHeader = t("sheet.amount");
          const balanceHeader = t("sheet.balance");
          // CSV headers carry the currency in parentheses so the
          // column is self-describing once it leaves the app; XLSX
          // encodes the symbol inside each cell's number format
          // instead, so its headers stay plain.
          const csvAmountHeader =
            currencySuffix !== ""
              ? `${amountHeader} (${currencySuffix})`
              : amountHeader;
          const csvBalanceHeader =
            currencySuffix !== ""
              ? `${balanceHeader} (${currencySuffix})`
              : balanceHeader;
          const baseHeaders = {
            date: t("sheet.date"),
            type: t("sheet.type"),
            category: t("sheet.category"),
            description: t("sheet.description"),
          };
          if (config.format === "csv") {
            const table = exportRowsToTable(rows, {
              ...baseHeaders,
              amount: csvAmountHeader,
              balance: csvBalanceHeader,
            });
            const csv = rowsToCsv(table);
            triggerDownload(csv, `${baseSlug}-${stamp}.csv`, CSV_MIME_TYPE);
          } else {
            const table = exportRowsToTable(rows, {
              ...baseHeaders,
              amount: amountHeader,
              balance: balanceHeader,
            });
            const bytes = buildXlsx([
              {
                name: target.name,
                rows: table,
                // Column order matches `exportRowsToTable`:
                // date, description, type, category, amount, balance.
                columnFormats: [
                  { kind: "date" },
                  { kind: "general" },
                  { kind: "general" },
                  { kind: "general" },
                  { kind: "currency" },
                  { kind: "currency", alwaysTwoDecimals: true },
                ],
                formats: budgetExportFormats(data.settings),
                asTable: true,
              },
            ]);
            triggerDownload(bytes, `${baseSlug}-${stamp}.xlsx`, XLSX_MIME_TYPE);
          }
          setBudgetDownloadPrefs(user.id, {
            format: config.format,
            includeHistory: config.includeHistory,
          });
        }
      } else {
        const payload = buildAccountsExport({
          accounts: data.accounts,
          transactions: data.transactions,
          selectedAccountIds: config.selectedAccountIds,
          accountInfo: config.accountInfo,
          includeTransactions: config.includeTransactions,
        });
        // The selected list only carries the accounts the user kept
        // ticked, but we still want to remember every account's per-
        // row decision so a re-open with a new account doesn't
        // forget the older toggles.
        const accountSelected: Record<string, boolean> = {};
        for (const a of data.accounts) {
          accountSelected[a.id] = config.selectedAccountIds.includes(a.id);
        }
        // The TransactionsExportEntry list (when present) is
        // gated per-account by `accountTransactions` — drop the
        // entries whose endpoints are toggled off so a per-account
        // exclude actually removes them from the JSON.
        if (payload.transactions) {
          const allowed = new Set<string>();
          for (const id of config.selectedAccountIds) {
            if (config.accountTransactions[id] ?? true) allowed.add(id);
          }
          payload.transactions = payload.transactions.filter(
            (tx) =>
              allowed.has(tx.fromAccountId) || allowed.has(tx.toAccountId),
          );
        }
        const text = serializeAccountsExport(payload);
        triggerDownload(text, `accounts-${stamp}.json`, JSON_MIME_TYPE);
        setAccountsDownloadPrefs(user.id, {
          accountInfo: config.accountInfo,
          accountTransactions: config.accountTransactions,
          accountSelected,
          includeTransactions: config.includeTransactions,
        });
      }
      setDownloadPrompt(null);
    },
    [
      downloadPrompt,
      data.sheets,
      data.accounts,
      data.transactions,
      data.history,
      data.merchantHints,
      data.matchRules,
      data.settings,
      allTypesMerged,
      allCategoriesMerged,
      user.id,
      t,
    ],
  );
  const onSaveSheet = useCallback(
    (draft: SheetDraft) => {
      // Resolve the final accountId. When the user typed a name into
      // the inline "new account" form we mint the account here, then
      // bind the sheet's budget item to its fresh id in the same
      // dispatch batch so a refresh mid-save can't strand the budget
      // pointing at nothing.
      let finalAccountId = draft.accountId;
      if (draft.newAccountName) {
        const account: Account = { id: newId(), name: draft.newAccountName };
        dispatch({ type: "createAccount", account });
        finalAccountId = account.id;
      }

      if (sheetModal?.sheet) {
        const target = sheetModal.sheet;
        dispatch({
          type: "updateSheetMeta",
          sheetId: target.id,
          meta: draft,
        });
        // Update the account binding on the sheet's budget item if it
        // changed. Finding the first AccountBudget mirrors the picker
        // in the view: the current UI exposes one block per sheet.
        const budgetItem = target.items.find(
          (it): it is AccountBudget => it.type === "accountBudget",
        );
        if (budgetItem && budgetItem.accountId !== finalAccountId) {
          dispatch({
            type: "setItemAccount",
            sheetId: target.id,
            itemId: budgetItem.id,
            accountId: finalAccountId,
          });
        }
      } else {
        const sheet = createDefaultSheet(draft.name, finalAccountId, {
          type: draft.type,
          glyph: draft.glyph,
          color: draft.color,
          description: draft.description,
        });
        dispatch({ type: "addSheet", sheet });
      }
    },
    [dispatch, sheetModal],
  );
  const onDeleteSheet = useCallback(() => {
    if (!sheetModal?.sheet) return;
    setDeleteSheetPrompt({
      sheetId: sheetModal.sheet.id,
      name: sheetModal.sheet.name,
    });
  }, [sheetModal]);
  const deleteSheetActions: ConfirmAction[] = useMemo(() => {
    if (!deleteSheetPrompt) return [];
    const target = deleteSheetPrompt;
    return [
      {
        label: t("app.deleteSheet"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteSheet", sheetId: target.sheetId });
          setDeleteSheetPrompt(null);
          setSheetModal(null);
        },
      },
    ];
  }, [deleteSheetPrompt, dispatch, t]);

  // Account / transaction modal handlers. Kept on the BudgetView so
  // they share the same dispatch and Account state as the rest of the
  // workspace — the modals themselves stay pure presentational shells.
  const onOpenCreateAccount = useCallback(() => {
    setAccountModal({ account: null });
  }, []);
  const onOpenEditAccount = useCallback(
    (accountId: string) => {
      const target = data.accounts.find((a) => a.id === accountId);
      if (target) setAccountModal({ account: target });
    },
    [data.accounts],
  );
  const onSaveAccount = useCallback(
    (draft: AccountDraft) => {
      // Strip empty strings from optional fields so a cleared input
      // restores "unset" rather than persisting an empty value the
      // schema would carry through every export.
      const patch: Partial<Account> = {
        name: draft.name,
        description: draft.description || undefined,
        glyph: draft.glyph ?? undefined,
        color: draft.color ?? undefined,
        bank: draft.bank || undefined,
        clearing: draft.clearing || undefined,
        accountNumber: draft.accountNumber || undefined,
        iban: draft.iban || undefined,
        bic: draft.bic || undefined,
        currency: draft.currency || undefined,
      };
      if (accountModal?.account) {
        dispatch({
          type: "updateAccount",
          accountId: accountModal.account.id,
          patch,
        });
      } else {
        const account: Account = {
          id: newId(),
          name: draft.name,
          ...(draft.description && { description: draft.description }),
          ...(draft.glyph && { glyph: draft.glyph }),
          ...(draft.color && { color: draft.color }),
          ...(draft.bank && { bank: draft.bank }),
          ...(draft.clearing && { clearing: draft.clearing }),
          ...(draft.accountNumber && { accountNumber: draft.accountNumber }),
          ...(draft.iban && { iban: draft.iban }),
          ...(draft.bic && { bic: draft.bic }),
          ...(draft.currency && { currency: draft.currency }),
        };
        dispatch({ type: "createAccount", account });
      }
      setAccountModal(null);
    },
    [dispatch, accountModal],
  );
  const onDeleteFinancialAccount = useCallback(() => {
    if (!accountModal?.account) return;
    setDeleteAccountPrompt({
      accountId: accountModal.account.id,
      name: accountModal.account.name,
    });
  }, [accountModal]);
  const deleteAccountActions: ConfirmAction[] = useMemo(() => {
    if (!deleteAccountPrompt) return [];
    const target = deleteAccountPrompt;
    return [
      {
        label: t("app.deleteAccount"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteAccount", accountId: target.accountId });
          setDeleteAccountPrompt(null);
          setAccountModal(null);
        },
      },
    ];
  }, [deleteAccountPrompt, dispatch, t]);

  // Bank-history import / viewer flows. The Accounts page surfaces a
  // per-row Upload button (always enabled) and a History viewer
  // button (enabled when entries exist). Both are scoped to the
  // clicked account so the import flow never has to ask "which
  // account is this for?".
  const onOpenImportHistory = useCallback((accountId: string) => {
    setImportHistoryForId(accountId);
  }, []);
  const onOpenViewHistory = useCallback((accountId: string) => {
    setViewHistoryForId(accountId);
  }, []);
  const importHistoryAccount = useMemo(
    () =>
      importHistoryForId
        ? (data.accounts.find((a) => a.id === importHistoryForId) ?? null)
        : null,
    [importHistoryForId, data.accounts],
  );
  const viewHistoryAccount = useMemo(
    () =>
      viewHistoryForId
        ? (data.accounts.find((a) => a.id === viewHistoryForId) ?? null)
        : null,
    [viewHistoryForId, data.accounts],
  );
  const onConfirmImportHistory = useCallback(
    (parsed: ParsedBankFile, filename: string) => {
      if (!importHistoryAccount) return;
      const accountId = importHistoryAccount.id;
      const now = Date.now();
      // Snapshot pre-import state so we can compute the matcher view
      // against the same world the user just confirmed against.
      const preImportData = data;
      const existingHistory = preImportData.history[accountId] ?? [];
      const { merged, addedIds } = mergeHistory(
        existingHistory,
        parsed.entries,
        now,
      );
      const newEntries = merged.filter((e) => addedIds.has(e.id));

      // Walk every account-budget that tracks this account; the
      // matcher works per (rows, columns) tuple so each item runs
      // independently but contributes to the same candidate pool.
      const rowsForAccount: Array<{
        sheetId: string;
        itemId: string;
        rows: Row[];
        columns: Column[];
      }> = [];
      for (const sheet of preImportData.sheets) {
        for (const item of sheet.items) {
          if (item.type !== "accountBudget") continue;
          if (item.accountId !== accountId) continue;
          rowsForAccount.push({
            sheetId: sheet.id,
            itemId: item.id,
            rows: item.rows,
            columns: item.columns,
          });
        }
      }

      // Auto-rule-driven matches (mirrors the reducer's silent pass)
      // so we exclude those rows from the user-facing candidate set.
      const autoMatchedRowIds = new Set<string>();
      for (const { rows, columns } of rowsForAccount) {
        const auto = findRuleDrivenCandidates(
          preImportData.seriesMatchRules,
          newEntries,
          rows,
          columns,
        );
        for (const m of auto) autoMatchedRowIds.add(m.rowId);
      }

      // Coverage snapshot: months covered by history before vs.
      // after this import. Orphan detection scopes to the diff.
      const beforeCovered =
        rowsForAccount.length > 0
          ? coveredMonths(
              existingHistory,
              rowsForAccount.flatMap((r) => r.rows),
              rowsForAccount[0].columns,
            )
          : new Set<string>();
      // Apply silent auto-deletions before computing post-coverage
      // so the rule's actions don't accidentally suppress coverage.
      const afterRowsForAccount = rowsForAccount.map((r) => ({
        ...r,
        rows: r.rows.filter((row) => !autoMatchedRowIds.has(row.id)),
      }));
      const afterCovered =
        afterRowsForAccount.length > 0
          ? coveredMonths(
              merged,
              afterRowsForAccount.flatMap((r) => r.rows),
              afterRowsForAccount[0].columns,
            )
          : new Set<string>();
      const newlyCovered = coverageDelta(beforeCovered, afterCovered);

      const allCandidates: MatchCandidate[] = [];
      const allOrphans: OrphanRow[] = [];
      for (const { rows, columns } of afterRowsForAccount) {
        const candidates = findCandidates(newEntries, rows, columns).filter(
          (c) => !autoMatchedRowIds.has(c.rowId),
        );
        for (const c of candidates) allCandidates.push(c);
        const claimedIds = new Set(candidates.map((c) => c.rowId));
        const orphans = findOrphans(rows, columns, newlyCovered, claimedIds);
        for (const o of orphans) allOrphans.push(o);
      }

      dispatch({
        type: "importBankHistory",
        accountId,
        bankParserId: parsed.bankParserId,
        bankClearing: parsed.bankClearing,
        bankAccountNumber: parsed.bankAccountNumber,
        filename,
        entries: parsed.entries,
        now,
      });
      setImportHistoryForId(null);

      if (allCandidates.length > 0 || allOrphans.length > 0) {
        const paydayDay = detectPaydayDayOfMonth(
          preImportData,
          preImportData.settings.startOfMonth,
        );
        setReconciliation({
          accountId,
          preImportData,
          newEntries,
          candidates: allCandidates,
          orphans: allOrphans,
          paydayDay,
        });
      }
    },
    [data, dispatch, importHistoryAccount],
  );

  const onApplyReconciliation = useCallback(
    (decisions: ReconciliationApply) => {
      if (
        decisions.mergedRowIds.length === 0 &&
        decisions.seriesRules.length === 0 &&
        decisions.orphans.length === 0
      ) {
        setReconciliation(null);
        return;
      }
      dispatch({
        type: "applyReconciliation",
        mergedRowIds: decisions.mergedRowIds,
        seriesRules: decisions.seriesRules,
        orphans: decisions.orphans,
      });
      setReconciliation(null);
    },
    [dispatch],
  );

  // Balance-correction flow. The Accounts page surfaces a clickable
  // balance per account; clicking opens UpdateBalanceModal, which lets
  // the user assert a new balance and confirms a correction row will
  // be added on today's date.
  const onOpenUpdateBalance = useCallback((accountId: string) => {
    setUpdateBalanceForId(accountId);
  }, []);
  const updateBalanceAccount = useMemo(
    () =>
      updateBalanceForId
        ? (data.accounts.find((a) => a.id === updateBalanceForId) ?? null)
        : null,
    [updateBalanceForId, data.accounts],
  );
  const updateBalanceCurrent = useMemo(
    () =>
      updateBalanceAccount ? accountBalance(data, updateBalanceAccount.id) : 0,
    [data, updateBalanceAccount],
  );
  const updateBalanceHasBudget = useMemo(() => {
    if (!updateBalanceAccount) return false;
    return data.sheets.some((s) =>
      s.items.some(
        (it) =>
          it.type === "accountBudget" &&
          it.accountId === updateBalanceAccount.id,
      ),
    );
  }, [updateBalanceAccount, data.sheets]);
  const updateBalanceDate = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const onConfirmUpdateBalance = useCallback(
    (newBalance: number) => {
      if (!updateBalanceAccount) return;
      const delta = newBalance - updateBalanceCurrent;
      if (delta === 0) {
        setUpdateBalanceForId(null);
        return;
      }
      dispatch({
        type: "correctAccountBalance",
        accountId: updateBalanceAccount.id,
        date: updateBalanceDate,
        amount: delta,
      });
      setUpdateBalanceForId(null);
    },
    [dispatch, updateBalanceAccount, updateBalanceCurrent, updateBalanceDate],
  );

  // Transaction modal entry points. The promote-row path computes the
  // direction from the row's amount sign so the modal only has to ask
  // for the OTHER account.
  const onTransactionRequest = useCallback(
    (row: Row) => {
      if (!activeBudget || activeBudget.accountId === null) return;
      if (row.transactionId) {
        // Synthesized transaction row — open it in edit mode by
        // looking up the underlying transaction.
        const tx = data.transactions.find((t) => t.id === row.transactionId);
        if (!tx) return;
        setTransactionRequest({
          kind: "edit",
          transactionId: tx.id,
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          fromAccountId: tx.fromAccountId,
          toAccountId: tx.toAccountId,
          typeId: tx.typeId ?? null,
          completed: tx.completed ?? false,
        });
        return;
      }
      const dateCol = findColumnByType(activeBudget.columns, "date");
      const descCol = findColumnByType(activeBudget.columns, "description");
      const amountCol = findColumnByType(activeBudget.columns, "amount");
      const rawDate = dateCol ? row.cells[dateCol.id] : null;
      const rawDesc = descCol ? row.cells[descCol.id] : null;
      const rawAmount = amountCol ? row.cells[amountCol.id] : null;
      const amount = typeof rawAmount === "number" ? rawAmount : 0;
      setTransactionRequest({
        kind: "promote",
        row,
        selfAccountId: activeBudget.accountId,
        seedDate: typeof rawDate === "string" ? rawDate : "",
        seedDescription: typeof rawDesc === "string" ? rawDesc : "",
        seedAmount: amount,
        outgoing: amount < 0,
        seedTypeId: row.typeId ?? null,
      });
    },
    [activeBudget, data.transactions],
  );
  const onOpenCreateTransaction = useCallback(() => {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    setTransactionRequest({
      kind: "create",
      defaultFromId: data.accounts[0]?.id ?? null,
      defaultToId: data.accounts[1]?.id ?? null,
      seedDate: today,
    });
  }, [data.accounts]);
  const onOpenEditTransaction = useCallback(
    (transactionId: string) => {
      const tx = data.transactions.find((t) => t.id === transactionId);
      if (!tx) return;
      setTransactionRequest({
        kind: "edit",
        transactionId: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
        typeId: tx.typeId ?? null,
        completed: tx.completed ?? false,
      });
    },
    [data.transactions],
  );
  const onPromoteTransaction = useCallback(
    (draft: TransactionDraft) => {
      if (!activeBudget || transactionRequest?.kind !== "promote") return;
      const transaction: Transaction = {
        id: newId(),
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        fromAccountId: draft.fromAccountId,
        toAccountId: draft.toAccountId,
        ...(draft.typeId !== null && { typeId: draft.typeId }),
        ...(draft.completed && { completed: draft.completed }),
      };
      dispatch({
        type: "promoteRowToTransaction",
        sheetId,
        itemId: activeBudget.id,
        rowId: transactionRequest.row.id,
        transaction,
      });
      setTransactionRequest(null);
    },
    [dispatch, activeBudget, sheetId, transactionRequest],
  );
  const onCreateTransaction = useCallback(
    (draft: TransactionDraft) => {
      const transaction: Transaction = {
        id: newId(),
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        fromAccountId: draft.fromAccountId,
        toAccountId: draft.toAccountId,
        ...(draft.typeId !== null && { typeId: draft.typeId }),
        ...(draft.completed && { completed: draft.completed }),
      };
      dispatch({ type: "createTransaction", transaction });
      setTransactionRequest(null);
    },
    [dispatch],
  );
  const onEditTransactionSave = useCallback(
    (transactionId: string, draft: TransactionDraft) => {
      dispatch({
        type: "updateTransaction",
        transactionId,
        patch: {
          date: draft.date,
          description: draft.description,
          amount: draft.amount,
          fromAccountId: draft.fromAccountId,
          toAccountId: draft.toAccountId,
          typeId: draft.typeId,
          completed: draft.completed,
        },
      });
      setTransactionRequest(null);
    },
    [dispatch],
  );
  const onDeleteTransactionFromModal = useCallback(
    (transactionId: string) => {
      dispatch({ type: "deleteTransaction", transactionId });
      setTransactionRequest(null);
    },
    [dispatch],
  );
  const onComplexSubmit = useCallback(
    (draft: ComplexEntryDraft) => {
      if (recurringPromoteContext) {
        dispatch({
          type: "promoteRecurringCandidate",
          sheetId,
          itemId,
          key: recurringPromoteContext.key,
          sourceDescription: recurringPromoteContext.sourceDescription,
          description: draft.description,
          amount: draft.amount,
          typeId: draft.typeId,
          dates: draft.dates,
          now: Date.now(),
        });
      } else {
        dispatch({ type: "addRowsFromComplex", sheetId, itemId, draft });
      }
      setComplexOpen(false);
      setComplexSeed(null);
      setRecurringPromoteContext(null);
    },
    [dispatch, sheetId, itemId, recurringPromoteContext],
  );
  const onConvertToRecurring = useCallback(
    (rowId: string, futureDates: string[], typeId: string | null) => {
      dispatch({
        type: "convertToRecurring",
        sheetId,
        itemId,
        rowId,
        futureDates,
        typeId,
      });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId],
  );
  const onEditSeries = useCallback(
    (rowId: string, patch: EditPatch, scope: EditScope) => {
      dispatch({ type: "editSeries", sheetId, itemId, rowId, patch, scope });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId],
  );
  const onSplitSubmit = useCallback(
    (rowId: string, splits: SplitSubmission[], remainderAmount: number) => {
      const row = splitPrompt?.row;
      if (!row) {
        setSplitPrompt(null);
        return;
      }
      if (row.historyEntryId && activeItem.accountId) {
        // History rows can't be replaced inline — the entry is the
        // bank's authoritative record and its amount must be preserved.
        // Fold any remainder into a final split that keeps the entry's
        // raw bank description so the on-screen presentation still
        // mirrors what the bank reported. The splits' signed amounts
        // sum exactly to `entry.amount` after this fold.
        const entries = data.history[activeItem.accountId] ?? [];
        const entry = entries.find((e) => e.id === row.historyEntryId);
        if (!entry) {
          setSplitPrompt(null);
          return;
        }
        const fullSplits: HistoryEntrySplit[] = splits.map((s) => ({
          description: s.description,
          amount: s.amount,
          typeId: s.typeId,
        }));
        if (remainderAmount !== 0) {
          fullSplits.push({
            description: entry.description,
            amount: remainderAmount,
            typeId: null,
          });
        }
        dispatch({
          type: "splitHistoryEntry",
          accountId: activeItem.accountId,
          entryId: row.historyEntryId,
          splits: fullSplits,
        });
        setSplitPrompt(null);
        return;
      }
      dispatch({
        type: "splitRow",
        sheetId,
        itemId,
        rowId,
        splits,
        remainderAmount,
      });
      setSplitPrompt(null);
    },
    [
      dispatch,
      sheetId,
      itemId,
      splitPrompt,
      activeItem.accountId,
      data.history,
    ],
  );
  // Drop a history entry's persisted split decomposition. The
  // reducer's `splitHistoryEntry` action treats an empty splits
  // array as "clear the field", so the synthesizer falls back to
  // rendering a single row for the bank entry on the next pass.
  // Only history rows can be reverted — regular row splits create
  // independent rows that no longer share an id linking them back
  // to the original.
  const onSplitRevert = useCallback(() => {
    const row = splitPrompt?.row;
    if (!row?.historyEntryId || !activeItem.accountId) {
      setSplitPrompt(null);
      return;
    }
    dispatch({
      type: "splitHistoryEntry",
      accountId: activeItem.accountId,
      entryId: row.historyEntryId,
      splits: [],
    });
    setSplitPrompt(null);
  }, [dispatch, splitPrompt, activeItem.accountId]);
  const onSaveEditRow = useCallback(
    (rowId: string, patch: EditRowPatch, scope: EditRowScope) => {
      // Description / amount / category / type are series-wide fields —
      // `editSeries` with a `just-this` scope is the same as a single-
      // row write, so the same dispatch covers both the one-off and
      // recurring cases uniformly. Date and completed are inherently
      // per-occurrence, so they always land on the anchor row via
      // `updateCell` regardless of scope.
      dispatch({
        type: "editSeries",
        sheetId,
        itemId,
        rowId,
        patch: {
          description: patch.description,
          amount: patch.amount,
          typeId: patch.typeId,
        },
        scope,
      });
      const dateCol = findColumnByType(activeItem.columns, "date");
      if (dateCol) {
        dispatch({
          type: "updateCell",
          sheetId,
          itemId,
          rowId,
          columnId: dateCol.id,
          value: patch.date,
        });
      }
      const completedCol = findColumnByType(activeItem.columns, "completed");
      if (completedCol) {
        dispatch({
          type: "updateCell",
          sheetId,
          itemId,
          rowId,
          columnId: completedCol.id,
          value: patch.completed,
        });
      }
      setEditRowPrompt(null);
    },
    [activeItem.columns, dispatch, sheetId, itemId],
  );

  const onToggleSelect = useCallback((rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);
  const onToggleSelectMonth = useCallback(
    (rowIds: string[], target: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of rowIds) {
          if (target) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [],
  );
  const onCancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  const onToggleSelectMode = useCallback(() => {
    setSelectMode((on) => {
      if (on) setSelectedIds(new Set());
      return !on;
    });
  }, []);

  const dateCol = useMemo(
    () => findColumnByType(activeItem.columns, "date"),
    [activeItem.columns],
  );

  const selectedRows = useMemo(
    () => activeItem.rows.filter((r) => selectedIds.has(r.id)),
    [activeItem.rows, selectedIds],
  );

  // Source-month set fed to MoveCopyModal so the user can't pick a no-op
  // target. Driven by whichever rows the modal is currently acting on:
  // the bulk selection when the prompt was opened from the bulk-select
  // toolbar, the single row when opened from the row's swipe-menu …
  // dropdown.
  const moveCopySourceMonths = useMemo<ReadonlySet<string>>(() => {
    if (!dateCol) return new Set();
    const rows = moveCopyPrompt?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) {
      const key = getMonthKey(r.cells[dateCol.id], data.settings.startOfMonth);
      if (key !== "undated") set.add(key);
    }
    return set;
  }, [moveCopyPrompt, dateCol, data.settings.startOfMonth]);

  // Last ISO date in the candidate series — defaults the "until" picker.
  const editLastSeriesDate = useMemo<string | null>(() => {
    const row = editPrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    return getLastSeriesDate(activeItem.rows, row.seriesId, dateCol.id);
  }, [editPrompt, activeItem.rows, dateCol]);
  // Same defaulting for the generic edit-row modal's scope picker.
  const editRowLastSeriesDate = useMemo<string | null>(() => {
    const row = editRowPrompt?.row;
    if (!row?.seriesId || !dateCol) return null;
    return getLastSeriesDate(activeItem.rows, row.seriesId, dateCol.id);
  }, [editRowPrompt, activeItem.rows, dateCol]);

  // Look up the bank entry behind a history-row split prompt so the
  // modal can pre-fill any existing splits and use the entry's
  // authoritative amount instead of whatever individual split-row
  // amount is currently in the cells map.
  const splitHistoryEntry = useMemo<HistoryEntry | null>(() => {
    const row = splitPrompt?.row;
    if (!row?.historyEntryId || !activeItem.accountId) return null;
    const entries = data.history[activeItem.accountId] ?? [];
    return entries.find((e) => e.id === row.historyEntryId) ?? null;
  }, [splitPrompt, activeItem.accountId, data.history]);
  const splitInitialSplits = useMemo<SplitSubmission[] | undefined>(() => {
    if (!splitHistoryEntry?.splits || splitHistoryEntry.splits.length === 0) {
      return undefined;
    }
    return splitHistoryEntry.splits.map((s) => ({
      description: s.description,
      amount: s.amount,
      typeId: s.typeId ?? null,
    }));
  }, [splitHistoryEntry]);
  const splitAuthoritativeAmount = splitHistoryEntry?.amount;
  const splitAuthoritativeDescription = splitHistoryEntry?.description;

  // Resolve the seed entry for the pattern-rule modal from
  // `matchRulePrompt.entryId`. Looked up fresh each render so a
  // concurrent delete / re-import doesn't strand a stale snapshot.
  const matchRuleSeedEntry = useMemo<HistoryEntry | null>(() => {
    if (!matchRulePrompt) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    return entries.find((e) => e.id === matchRulePrompt.entryId) ?? null;
  }, [matchRulePrompt, activeItem.accountId, data.history]);

  // Every history entry on the active account, fed into the rule
  // modal's live preview so the user sees what their pattern matches
  // before they save it.
  const matchRuleAllEntries = useMemo<readonly HistoryEntry[]>(() => {
    const accountId = activeItem.accountId;
    if (!accountId) return [];
    return data.history[accountId] ?? [];
  }, [activeItem.accountId, data.history]);

  // Resolve the entry for the per-entry edit modal from
  // `historyEditPrompt.entryId`. Looked up fresh each render so a
  // concurrent delete / re-import doesn't strand a stale snapshot.
  const historyEditEntry = useMemo<HistoryEntry | null>(() => {
    if (!historyEditPrompt) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    return entries.find((e) => e.id === historyEditPrompt.entryId) ?? null;
  }, [historyEditPrompt, activeItem.accountId, data.history]);

  const onSubmitHistoryEdit = useCallback(
    (patch: { userDescription: string; userTypeId: string | null }) => {
      const accountId = activeItem.accountId;
      if (!accountId || !historyEditPrompt) return;
      dispatch({
        type: "updateHistoryEntry",
        accountId,
        entryId: historyEditPrompt.entryId,
        patch,
      });
      setHistoryEditPrompt(null);
    },
    [dispatch, activeItem.accountId, historyEditPrompt],
  );

  const onSubmitMatchRule = useCallback(
    (draft: MatchRuleDraft) => {
      const rule: MatchRule = {
        id: newId(),
        pattern: draft.pattern,
      };
      if (draft.description) rule.description = draft.description;
      if (draft.typeId) rule.typeId = draft.typeId;
      if (draft.amountSign !== "any") rule.amountSign = draft.amountSign;
      if (draft.transferFilter !== "any")
        rule.transferFilter = draft.transferFilter;
      if (draft.amountMin !== undefined) rule.amountMin = draft.amountMin;
      if (draft.amountMax !== undefined) rule.amountMax = draft.amountMax;
      dispatch({ type: "createMatchRule", rule });
      setMatchRulePrompt(null);
    },
    [dispatch],
  );

  // Pre-fill values for the history-row promote modal. Looks the
  // active history entry up by id (the synthesized row carries only
  // the overlaid description), normalises its raw bank text, and
  // hands the matching merchant hint's labels back to the modal so a
  // returning user sees their last choices rather than blanks.
  const editHistoryHintPrefill = useMemo<HistoryPromotePrefill | null>(() => {
    const row = editPrompt?.row;
    if (!row?.historyEntryId) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    const entry = entries.find((e) => e.id === row.historyEntryId);
    if (!entry) return null;
    const key = normaliseDescription(entry.description);
    const hint = data.merchantHints[key];
    if (!hint) return null;
    return {
      description: hint.description ?? null,
      typeId: hint.typeId ?? null,
    };
  }, [editPrompt, activeItem.accountId, data.history, data.merchantHints]);

  // Bank-history entries on the active account that share the
  // promote-target row's normalised description. Surfaced in the
  // EditEntryModal so the user sees which past entries will adopt
  // the typed label / type via the merchant-hint overlay. Skipped
  // for series rows (the modal is in edit-series mode, not promote).
  // For history-row promotions, the bucket key is derived from the
  // source entry's raw bank text (the synthesized row's description
  // cell may already carry a user override that doesn't normalise
  // back to the bank text). For regular row promotions the bucket
  // key comes from the description cell directly.
  const editHistoryMatches = useMemo<HistoryMatchPreview[] | null>(() => {
    const row = editPrompt?.row;
    if (!row || row.seriesId) return null;
    const accountId = activeItem.accountId;
    if (!accountId) return null;
    const entries = data.history[accountId] ?? [];
    let targetKey: string;
    if (row.historyEntryId) {
      const entry = entries.find((e) => e.id === row.historyEntryId);
      if (!entry) return null;
      targetKey = normaliseDescription(entry.description);
    } else {
      const descId = findColumnByType(activeItem.columns, "description")?.id;
      if (!descId) return null;
      const rawDesc = row.cells[descId];
      if (typeof rawDesc !== "string" || rawDesc.trim() === "") return null;
      targetKey = normaliseDescription(rawDesc);
    }
    if (targetKey.length < 3) return null;
    const matches: HistoryMatchPreview[] = [];
    for (const e of entries) {
      if (e.hidden) continue;
      if (e.collapsedIntoTransactionId) continue;
      if (normaliseDescription(e.description) !== targetKey) continue;
      matches.push({
        id: e.id,
        date: e.date,
        description: e.description,
        amount: e.amount,
      });
    }
    matches.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return matches;
  }, [editPrompt, activeItem.accountId, activeItem.columns, data.history]);

  const deleteActions: ConfirmAction[] = useMemo(() => {
    if (!deletePrompt) return [];
    const row = deletePrompt.row;
    if (!row.seriesId || !dateCol) {
      return [
        {
          label: t("app.deleteThisRow"),
          tone: "danger",
          onSelect: () => {
            dispatch({
              type: "deleteRows",
              sheetId,
              itemId,
              rowIds: [row.id],
            });
            setDeletePrompt(null);
          },
        },
      ];
    }
    const futureIds = rowsInSeriesFrom(activeItem.rows, row, dateCol.id).map(
      (r) => r.id,
    );
    return [
      {
        label: t("app.justThisOne"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: [row.id] });
          setDeletePrompt(null);
        },
      },
      {
        label: t("app.thisAndAllFuture", { n: futureIds.length }),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: futureIds });
          setDeletePrompt(null);
        },
      },
    ];
  }, [deletePrompt, activeItem.rows, dateCol, dispatch, sheetId, itemId, t]);

  const bulkDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!bulkDeletePrompt) return [];
    const ids = bulkDeletePrompt.rowIds;
    return [
      {
        label:
          ids.length === 1
            ? t("app.deleteRowOne", { n: ids.length })
            : t("app.deleteRows", { n: ids.length }),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: ids });
          setBulkDeletePrompt(null);
          onCancelSelect();
        },
      },
    ];
  }, [bulkDeletePrompt, dispatch, sheetId, itemId, onCancelSelect, t]);

  const correctionDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!correctionDeletePrompt) return [];
    const target = correctionDeletePrompt;
    return [
      {
        label: t("app.removeCorrection"),
        tone: "danger",
        onSelect: () => {
          dispatch({
            type: "deleteRows",
            sheetId: target.sheetId,
            itemId: target.itemId,
            rowIds: [target.rowId],
          });
          setCorrectionDeletePrompt(null);
        },
      },
    ];
  }, [correctionDeletePrompt, dispatch, t]);

  const onBulkEdit = useCallback(() => setBulkEditOpen(true), []);
  const onBulkDelete = useCallback(() => {
    setBulkDeletePrompt({ kind: "bulk-delete", rowIds: [...selectedIds] });
  }, [selectedIds]);
  const onBulkMove = useCallback(() => {
    setMoveCopyPrompt({ kind: "move", rows: selectedRows });
  }, [selectedRows]);
  const onBulkCopy = useCallback(() => {
    setMoveCopyPrompt({ kind: "copy", rows: selectedRows });
  }, [selectedRows]);
  const onCopyRequest = useCallback((row: Row) => {
    setMoveCopyPrompt({ kind: "copy", rows: [row] });
  }, []);

  const onApplyBulkPatch = useCallback(
    (rowIds: string[], patch: BulkPatch) => {
      dispatch({ type: "bulkUpdate", sheetId, itemId, rowIds, patch });
    },
    [dispatch, sheetId, itemId],
  );
  const onApplyBulkRecurring = useCallback(
    (rowIds: string[], futureDates: string[]) => {
      dispatch({
        type: "bulkMakeRecurring",
        sheetId,
        itemId,
        rowIds,
        futureDates,
      });
    },
    [dispatch, sheetId, itemId],
  );

  // Recurring-candidate promote / dismiss. Promote opens the complex-
  // entry modal pre-seeded with the detected description, amount, and
  // cadence so the user can adjust before committing — submit then
  // dispatches `promoteRecurringCandidate`, which mints the series
  // rows, records a merchant hint against the candidate's bank text,
  // and consumes the candidate by adding its key to
  // `recurringDismissals` (so the panel drops it). Dismiss persists
  // the key directly without minting anything.
  const onPromoteRecurringCandidate = useCallback(
    (
      candidate: RecurringCandidate,
      rule: RecurrenceRule,
      _dates: string[],
      typeId: string | null,
    ) => {
      if (!activeBudget) return;
      const shifted = shiftRuleStartToFuture(rule, todayIso());
      setRecurringPromoteContext({
        key: candidate.key,
        sourceDescription: candidate.description,
      });
      setComplexSeedDate(shifted.kind === "once" ? shifted.date : todayIso());
      setComplexSeed({
        description: candidate.description,
        amount: candidate.suggestedAmount,
        typeId,
        rule: shifted,
      });
      setComplexOpen(true);
    },
    [activeBudget],
  );
  const onDismissRecurringCandidate = useCallback(
    (key: string) => {
      dispatch({ type: "dismissRecurringCandidate", key });
    },
    [dispatch],
  );
  const onDismissAllRecurringCandidates = useCallback(
    (keys: readonly string[]) => {
      dispatch({ type: "dismissRecurringCandidates", keys });
    },
    [dispatch],
  );

  // Promote a single history entry the user clicked on into a real
  // recurring series. Routes through the same future-row minting as
  // the recurring-candidate panel but also stamps the merchant hint
  // with the user-typed description and typeId so past entries
  // sharing the merchant key adopt the label on the next render.
  const onPromoteHistory = useCallback(
    (
      historyEntryId: string,
      sourceDescription: string,
      promotion: {
        description: string;
        amount: number;
        typeId: string | null;
        dates: string[];
        applyToHistoric: boolean;
      },
    ) => {
      if (!activeBudget) return;
      if (promotion.dates.length === 0) return;
      dispatch({
        type: "promoteHistoryToRecurring",
        sheetId,
        itemId: activeBudget.id,
        sourceDescription,
        description: promotion.description,
        amount: promotion.amount,
        typeId: promotion.typeId,
        dates: promotion.dates,
        applyToHistoric: promotion.applyToHistoric,
        now: Date.now(),
      });
      setEditPrompt(null);
      // Silences the unused parameter warning while keeping the id in
      // the API surface for future use (e.g. selectively hiding the
      // source row or recording the promotion against its id).
      void historyEntryId;
    },
    [dispatch, sheetId, activeBudget],
  );

  // Transfer-collapse modal handlers. Open is driven by the user
  // (a button on the Accounts page) and auto-opens after an import
  // when new candidates are detected — see the effect below.
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  // Snapshot of the candidate count at the previous import so the
  // auto-open trigger only fires when a fresh import actually
  // introduced new pairs (not every render, not after a dismissal).
  const previousImportCountRef = useRef<number>(
    Object.values(data.historyImports).reduce(
      (acc, list) => acc + list.length,
      0,
    ),
  );
  useEffect(() => {
    const totalImports = Object.values(data.historyImports).reduce(
      (acc, list) => acc + list.length,
      0,
    );
    if (totalImports <= previousImportCountRef.current) {
      previousImportCountRef.current = totalImports;
      return;
    }
    previousImportCountRef.current = totalImports;
    const dismissed = new Set(data.transferCollapseDismissals);
    const candidates = detectTransferCandidates({
      history: data.history,
      dismissedPairKeys: dismissed,
    });
    if (candidates.length > 0) setTransferModalOpen(true);
  }, [data.historyImports, data.history, data.transferCollapseDismissals]);
  const onCollapseTransferPair = useCallback(
    (candidate: TransferCandidate) => {
      dispatch({
        type: "collapseTransferPair",
        fromAccountId: candidate.fromAccountId,
        toAccountId: candidate.toAccountId,
        fromEntryId: candidate.fromEntry.id,
        toEntryId: candidate.toEntry.id,
        date: candidate.date,
        description: candidate.fromEntry.description,
        amount: candidate.amount,
      });
    },
    [dispatch],
  );
  const onDismissTransferPair = useCallback(
    (pairKey: string) => {
      dispatch({ type: "dismissTransferPair", pairKey });
    },
    [dispatch],
  );
  const onOpenTransferCollapse = useCallback(() => {
    setTransferModalOpen(true);
  }, []);

  // Settings clear-all handlers for the merchant-hint memory and the
  // two dismissal allowlists. Each dispatches a single action; the
  // reducer no-ops when the collection is already empty.
  const onClearMerchantHints = useCallback(
    () => dispatch({ type: "clearMerchantHints" }),
    [dispatch],
  );
  const onClearRecurringDismissals = useCallback(
    () => dispatch({ type: "clearRecurringDismissals" }),
    [dispatch],
  );
  const onClearTransferDismissals = useCallback(
    () => dispatch({ type: "clearTransferDismissals" }),
    [dispatch],
  );
  const handleMoveCopySubmit = useCallback(
    (targetMonths: string[]) => {
      if (!moveCopyPrompt) return;
      const rowIds = moveCopyPrompt.rows.map((r) => r.id);
      if (moveCopyPrompt.kind === "move") {
        dispatch({
          type: "bulkShiftToMonth",
          sheetId,
          itemId,
          rowIds,
          targetMonth: targetMonths[0],
        });
      } else {
        dispatch({
          type: "bulkCopyToMonths",
          sheetId,
          itemId,
          rowIds,
          targetMonths,
        });
      }
      setMoveCopyPrompt(null);
      onCancelSelect();
    },
    [dispatch, moveCopyPrompt, sheetId, itemId, onCancelSelect],
  );

  return (
    // No outer bottom padding: iOS 26 Safari's Liquid Glass address bar
    // is translucent and samples page pixels for its tint, so the sheet
    // is allowed to extend behind it. `<main>` owns the bottom padding
    // — large enough that the AddRowButton at the foot of the last
    // month clears both the safe-area band and the floating SheetTabs
    // pill instead of ending its scroll under either.
    <div className="mx-auto flex min-h-dvh max-w-full flex-col px-1 md:px-5">
      {/* `data-modal-background` is the toggle target for the modal
          lifecycle hook in src/utils/scroll-lock.ts — any open modal
          flips `inert` on every match, freezing focus and pointer
          events on the chrome behind the backdrop. `display: contents`
          keeps the flex column layout unchanged. */}
      <div className="contents" data-modal-background>
        <header className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-page-bg px-2 pt-3 pb-3 md:mb-6 md:gap-x-4 md:gap-y-3 md:px-0 md:pt-4 md:pb-4">
          <button
            type="button"
            onClick={onScrollToToday}
            aria-label={t("app.scrollToToday")}
            title={t("app.scrollToToday")}
            className="inline-flex cursor-pointer items-center gap-2 rounded border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <img
              src="/icons/icon-64.png"
              srcSet="/icons/icon-64.png 1x, /icons/icon-256.png 4x"
              alt=""
              aria-hidden
              width={24}
              height={24}
              className="h-6 w-6 rounded-sm"
            />
            <span className="flex items-baseline gap-2">
              <span className="text-base font-bold tracking-wide text-fg-bright">
                budget
              </span>
              <span
                className="text-xs font-normal text-muted tabular-nums"
                aria-label={`Build ${BUILD_LABEL}`}
              >
                {BUILD_LABEL}
              </span>
            </span>
          </button>
          <div className="ml-auto inline-flex items-center gap-2">
            {backend === "dropbox" || backend === "gdrive" ? (
              <SyncStatus
                providerName={
                  backend === "dropbox" ? "Dropbox" : "Google Drive"
                }
                status={status}
                dirty={dirty}
                onSave={saveNow}
                onOpenDetails={() => setSyncDetailsOpen(true)}
              />
            ) : (
              <SaveStateButton
                dirty={dirty}
                saving={status.kind === "saving"}
                onSave={saveNow}
              />
            )}
            <HeaderMenu
              user={user}
              hasOtherUsers={hasOtherUsers}
              onOpenSettings={() => setSettingsOpen(true)}
              onSignOut={onSignOut}
              onSwitchUser={onSwitchUser}
              onCreateAccount={onCreateAccount}
            />
          </div>
        </header>
        <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-[calc(5rem+env(safe-area-inset-bottom))]">
          {status.kind === "loading" ? (
            <BudgetLoading />
          ) : activeSheet.type === "accounts" ? (
            <AccountsSheetView
              sheet={activeSheet}
              data={data}
              settings={data.settings}
              onCreateAccount={onOpenCreateAccount}
              onEditAccount={onOpenEditAccount}
              onUpdateBalance={onOpenUpdateBalance}
              onCreateTransaction={onOpenCreateTransaction}
              onEditTransaction={onOpenEditTransaction}
              onImportHistory={onOpenImportHistory}
              onViewHistory={onOpenViewHistory}
              onFindTransfers={onOpenTransferCollapse}
              onEditSheet={onOpenEditSheet}
              onDownloadSheet={onOpenDownloadSheet}
            />
          ) : (
            <>
              <RecurringCandidatesPanel
                history={
                  activeItem.accountId
                    ? (data.history[activeItem.accountId] ?? [])
                    : []
                }
                dismissedKeys={data.recurringDismissals}
                merchantHints={data.merchantHints}
                types={allTypesMerged}
                settings={data.settings}
                onPromote={onPromoteRecurringCandidate}
                onDismiss={onDismissRecurringCandidate}
                onDismissAll={onDismissAllRecurringCandidates}
              />
              <SheetView
                sheet={activeSheet}
                item={activeItem}
                data={data}
                types={allTypesMerged}
                categories={allCategoriesMerged}
                typeUsageById={typeUsageById}
                onCreateType={onCreateType}
                accounts={data.accounts}
                transactions={data.transactions}
                history={
                  activeItem.accountId
                    ? (data.history[activeItem.accountId] ?? [])
                    : []
                }
                merchantHints={data.merchantHints}
                matchRules={data.matchRules}
                openingBalance={
                  activeItem.accountId
                    ? (data.accounts.find((a) => a.id === activeItem.accountId)
                        ?.openingBalance ?? 0)
                    : 0
                }
                settings={data.settings}
                selectMode={selectMode}
                selectedIds={selectedIds}
                scrollToTodayTick={scrollToTodayTick}
                onUpdateCell={onUpdateCell}
                onCommitCell={onCommitCell}
                onAddRow={onAddRow}
                onAddComplex={onAddComplex}
                onDeleteRequest={onDeleteRequest}
                onEditRequest={onEditRequest}
                onEditRowRequest={onEditRowRequest}
                onSplitRequest={onSplitRequest}
                onTransactionRequest={onTransactionRequest}
                onToggleRowTransfer={onToggleRowTransfer}
                onMatchRuleRequest={onMatchRuleRequest}
                onEditHistoryRequest={onEditHistoryRequest}
                onCopyRequest={onCopyRequest}
                onUpdateHistoryEntry={onUpdateHistoryEntry}
                onCorrectionDeleteRequest={onCorrectionDeleteRequest}
                onReorderColumns={onReorderColumns}
                onToggleSelect={onToggleSelect}
                onToggleSelectMonth={onToggleSelectMonth}
                onEditSheet={onOpenEditSheet}
                onDownloadSheet={onOpenDownloadSheet}
              />
            </>
          )}
        </main>
        {status.kind === "loading" ? null : (
          <>
            <UndoRedoBar
              canUndo={canUndo}
              canRedo={canRedo}
              selectMode={selectMode}
              onUndo={undo}
              onRedo={redo}
              onToggleSelectMode={onToggleSelectMode}
            />
            {selectMode ? (
              <BulkActionBar
                count={selectedIds.size}
                onEdit={onBulkEdit}
                onDelete={onBulkDelete}
                onMove={onBulkMove}
                onCopy={onBulkCopy}
                onCancel={onCancelSelect}
              />
            ) : (
              <SheetTabs
                sheets={data.sheets}
                activeSheetId={activeSheet.id}
                onSelect={onSelectSheet}
                onEdit={onOpenEditSheet}
                onAdd={onOpenNewSheet}
              />
            )}
          </>
        )}
      </div>
      <SheetModal
        open={sheetModal !== null}
        sheet={sheetModal?.sheet ?? null}
        currentAccountId={
          sheetModal?.sheet
            ? (sheetModal.sheet.items.find(
                (it): it is AccountBudget => it.type === "accountBudget",
              )?.accountId ?? null)
            : null
        }
        accounts={data.accounts}
        canDelete={data.sheets.length > 1}
        // The Accounts flavour is a singleton. The picker greys it out
        // when one already exists (unless the current draft is editing
        // that very sheet).
        accountsSheetTaken={data.sheets.some(
          (s) => s.type === "accounts" && s.id !== sheetModal?.sheet?.id,
        )}
        onClose={() => setSheetModal(null)}
        onSave={onSaveSheet}
        onDelete={onDeleteSheet}
      />
      {downloadPrompt !== null &&
        (() => {
          const target = data.sheets.find(
            (s) => s.id === downloadPrompt.sheetId,
          );
          if (!target) return null;
          if (target.type === "accounts") {
            return (
              <DownloadModal
                open
                kind="accounts"
                accounts={data.accounts}
                initial={downloadPrompt.accountsPrefs}
                onClose={onCloseDownload}
                onSubmit={onConfirmDownload}
              />
            );
          }
          const budgetItem = target.items.find(
            (it): it is AccountBudget => it.type === "accountBudget",
          );
          const accountId = budgetItem?.accountId ?? null;
          const hasHistory = accountId
            ? (data.history[accountId]?.length ?? 0) > 0
            : false;
          return (
            <DownloadModal
              open
              kind="budget"
              initial={downloadPrompt.budgetPrefs}
              hasHistory={hasHistory}
              sheetName={target.name}
              onClose={onCloseDownload}
              onSubmit={onConfirmDownload}
            />
          );
        })()}
      <AccountModal
        open={accountModal !== null}
        account={accountModal?.account ?? null}
        onClose={() => setAccountModal(null)}
        onSave={onSaveAccount}
        onDelete={onDeleteFinancialAccount}
      />
      <UpdateBalanceModal
        open={updateBalanceAccount !== null}
        account={updateBalanceAccount}
        currentBalance={updateBalanceCurrent}
        settings={data.settings}
        date={updateBalanceDate}
        canRecord={updateBalanceHasBudget}
        onConfirm={onConfirmUpdateBalance}
        onCancel={() => setUpdateBalanceForId(null)}
      />
      <ImportHistoryModal
        open={importHistoryAccount !== null}
        account={importHistoryAccount}
        existing={
          importHistoryAccount
            ? (data.history[importHistoryAccount.id] ?? [])
            : []
        }
        settings={data.settings}
        onCancel={() => setImportHistoryForId(null)}
        onConfirm={onConfirmImportHistory}
      />
      <ReconciliationModal
        open={reconciliation !== null}
        onClose={() => setReconciliation(null)}
        onApply={onApplyReconciliation}
        accountId={reconciliation?.accountId ?? ""}
        preImportData={reconciliation?.preImportData ?? data}
        newEntries={reconciliation?.newEntries ?? []}
        candidates={reconciliation?.candidates ?? []}
        orphans={reconciliation?.orphans ?? []}
        paydayDay={reconciliation?.paydayDay ?? data.settings.startOfMonth}
        settings={data.settings}
      />
      <HistoryModal
        open={viewHistoryAccount !== null}
        account={viewHistoryAccount}
        entries={
          viewHistoryAccount ? (data.history[viewHistoryAccount.id] ?? []) : []
        }
        imports={
          viewHistoryAccount
            ? (data.historyImports[viewHistoryAccount.id] ?? [])
            : []
        }
        settings={data.settings}
        onCancel={() => setViewHistoryForId(null)}
      />
      <TransferCollapseModal
        open={transferModalOpen}
        history={data.history}
        accounts={data.accounts}
        dismissedPairKeys={data.transferCollapseDismissals}
        settings={data.settings}
        onClose={() => setTransferModalOpen(false)}
        onCollapse={onCollapseTransferPair}
        onDismiss={onDismissTransferPair}
      />
      <TransactionModal
        open={transactionRequest !== null}
        request={transactionRequest}
        accounts={data.accounts}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setTransactionRequest(null)}
        onPromote={onPromoteTransaction}
        onCreate={onCreateTransaction}
        onEdit={onEditTransactionSave}
        onDelete={onDeleteTransactionFromModal}
        onCreateType={onCreateType}
      />
      <ComplexEntryModal
        open={complexOpen}
        initialDate={complexSeedDate}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        sheets={data.sheets}
        currentSheetId={activeSheet.id}
        seed={complexSeed}
        title={
          recurringPromoteContext ? t("complex.promoteCandidate") : undefined
        }
        submitVerb={
          recurringPromoteContext ? t("complex.promoteVerb") : undefined
        }
        onClose={() => {
          setComplexOpen(false);
          setComplexSeed(null);
          setRecurringPromoteContext(null);
        }}
        onCreate={onComplexSubmit}
        onCreateType={onCreateType}
      />
      <EditEntryModal
        open={editPrompt !== null}
        row={editPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        lastSeriesDate={editLastSeriesDate}
        historyHintPrefill={editHistoryHintPrefill}
        historyMatches={editHistoryMatches ?? undefined}
        onClose={() => setEditPrompt(null)}
        onConvertToRecurring={onConvertToRecurring}
        onEditSeries={onEditSeries}
        onPromoteHistory={onPromoteHistory}
        onCreateType={onCreateType}
      />
      <EditRowModal
        open={editRowPrompt !== null}
        row={editRowPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        lastSeriesDate={editRowLastSeriesDate}
        onClose={() => setEditRowPrompt(null)}
        onSave={onSaveEditRow}
        onCreateType={onCreateType}
      />
      <SplitEntryModal
        open={splitPrompt !== null}
        row={splitPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        initialSplits={splitInitialSplits}
        authoritativeAmount={splitAuthoritativeAmount}
        authoritativeDescription={splitAuthoritativeDescription}
        onClose={() => setSplitPrompt(null)}
        onSplit={onSplitSubmit}
        onRevert={onSplitRevert}
        onCreateType={onCreateType}
      />
      <MatchRuleModal
        open={matchRulePrompt !== null && matchRuleSeedEntry !== null}
        seedEntry={matchRuleSeedEntry}
        allEntries={matchRuleAllEntries}
        existing={null}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setMatchRulePrompt(null)}
        onSubmit={onSubmitMatchRule}
        onCreateType={onCreateType}
      />
      <HistoryEntryEditModal
        open={historyEditPrompt !== null && historyEditEntry !== null}
        entry={historyEditEntry}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setHistoryEditPrompt(null)}
        onSubmit={onSubmitHistoryEdit}
        onCreateType={onCreateType}
      />
      <ApplySeriesEditDialog
        open={pendingSeriesEdit !== null}
        fieldLabel={pendingSeriesEdit?.fieldLabel ?? ""}
        anchorDate={pendingSeriesEdit?.anchorDate ?? ""}
        lastSeriesDate={pendingSeriesEdit?.lastSeriesDate ?? null}
        onCancel={onDismissPendingSeriesEdit}
        onApplyToFuture={onApplyPendingToFuture}
      />
      <BulkEditModal
        open={bulkEditOpen && selectedRows.length > 0}
        rows={selectedRows}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        typeUsageById={typeUsageById}
        settings={data.settings}
        onClose={() => setBulkEditOpen(false)}
        onApplyPatch={onApplyBulkPatch}
        onApplyRecurring={onApplyBulkRecurring}
        onCreateType={onCreateType}
      />
      <MoveCopyModal
        open={moveCopyPrompt !== null}
        mode={moveCopyPrompt?.kind ?? "move"}
        rows={moveCopyPrompt?.rows ?? []}
        sourceMonths={moveCopySourceMonths}
        onClose={() => setMoveCopyPrompt(null)}
        onSubmit={handleMoveCopySubmit}
      />
      <ConfirmDialog
        open={deletePrompt !== null}
        title={
          deletePrompt?.row.seriesId
            ? t("confirm.deleteRecurring")
            : t("confirm.deleteRow")
        }
        description={
          deletePrompt?.row.seriesId
            ? t("confirm.deleteRecurringHint")
            : t("confirm.deleteRowHint")
        }
        actions={deleteActions}
        onCancel={() => setDeletePrompt(null)}
      />
      <ConfirmDialog
        open={bulkDeletePrompt !== null}
        title={t("app.deleteSelected")}
        description={
          (bulkDeletePrompt?.rowIds.length ?? 0) === 1
            ? t("confirm.deleteSelectedHintOne", {
                n: bulkDeletePrompt?.rowIds.length ?? 0,
              })
            : t("confirm.deleteSelectedHintOther", {
                n: bulkDeletePrompt?.rowIds.length ?? 0,
              })
        }
        actions={bulkDeleteActions}
        onCancel={() => setBulkDeletePrompt(null)}
      />
      <ConfirmDialog
        open={deleteSheetPrompt !== null}
        title={t("app.deleteSheet")}
        description={
          deleteSheetPrompt
            ? t("confirm.deleteSheetHint", { name: deleteSheetPrompt.name })
            : null
        }
        actions={deleteSheetActions}
        onCancel={() => setDeleteSheetPrompt(null)}
      />
      <ConfirmDialog
        open={deleteAccountPrompt !== null}
        title={t("app.deleteAccount")}
        description={
          deleteAccountPrompt
            ? t("confirm.deleteAccountHint", { name: deleteAccountPrompt.name })
            : null
        }
        actions={deleteAccountActions}
        onCancel={() => setDeleteAccountPrompt(null)}
      />
      <ConfirmDialog
        open={correctionDeletePrompt !== null}
        title={t("app.removeBalanceCorrection")}
        description={
          correctionDeletePrompt
            ? t("confirm.correctionRemoveHint", {
                delta: correctionDeletePrompt.deltaText,
              })
            : ""
        }
        actions={correctionDeleteActions}
        onCancel={() => setCorrectionDeletePrompt(null)}
      />
      <SyncDetailsModal
        open={syncDetailsOpen}
        backend={backend}
        status={status}
        dirty={dirty}
        onSaveNow={saveNow}
        onReconnect={
          backend === "dropbox" || backend === "gdrive"
            ? onReconnectCloud
            : null
        }
        onConfirmShrink={confirmShrinkSave}
        onDiscardShrink={discardShrinkSave}
        onClose={() => setSyncDetailsOpen(false)}
      />
      <ReconnectCloudModal
        open={reconnectCloudOpen}
        backend={backend}
        onConfirm={onReconnectCloud}
        onClose={() => setReconnectCloudOpen(false)}
      />
      <ConflictResolutionModal
        open={status.kind === "conflict"}
        providerName={
          backend === "dropbox"
            ? "Dropbox"
            : backend === "gdrive"
              ? "Google Drive"
              : t("settings.storage.cloudConnect")
        }
        local={status.kind === "conflict" ? status.local : data}
        remote={status.kind === "conflict" ? status.remote : data}
        onKeepLocal={resolveKeepLocal}
        onKeepRemote={resolveKeepRemote}
      />
      <SettingsModal
        open={settingsOpen}
        settings={data.settings}
        backend={backend}
        dropboxConnected={dropboxConnected}
        gdriveConnected={gdriveConnected}
        folderConnected={folderConnected}
        folderAvailable={folderAvailable}
        folderReconnectNeeded={folderReconnectNeeded}
        encryption={encryption}
        cloudOfflineMode={cloudOfflineMode}
        isGuest={isGuest}
        username={user.username}
        merchantHintCount={Object.keys(data.merchantHints).length}
        recurringDismissalCount={data.recurringDismissals.length}
        transferDismissalCount={data.transferCollapseDismissals.length}
        data={data}
        onImport={onImport}
        adapter={adapter}
        getEncryptionPassword={getEncryptionPassword}
        onClose={() => setSettingsOpen(false)}
        onSave={onSaveSettings}
        onConnectDropbox={onConnectDropbox}
        onDisconnectDropbox={onDisconnectDropbox}
        onConnectGdrive={onConnectGdrive}
        onDisconnectGdrive={onDisconnectGdrive}
        onConnectFolder={onConnectFolder}
        onReconnectFolder={onReconnectFolder}
        onDisconnectFolder={onDisconnectFolder}
        onSelectBrowser={onSelectBrowser}
        onSetEncryption={onSetEncryption}
        onSetCloudOfflineMode={onSetCloudOfflineMode}
        cloudReauthAutoOpen={cloudReauthAutoOpen}
        onSetCloudReauthAutoOpen={handleSetCloudReauthAutoOpen}
        onClearMerchantHints={onClearMerchantHints}
        onClearRecurringDismissals={onClearRecurringDismissals}
        onClearTransferDismissals={onClearTransferDismissals}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={onDeleteCategory}
        onSetPresetCategoryHidden={onSetPresetCategoryHidden}
        onCreateType={onCreateType}
        onUpdateType={onUpdateType}
        onDeleteType={onDeleteType}
        onSetPresetTypeHidden={onSetPresetTypeHidden}
        onSetPresetTypeKind={onSetPresetTypeKind}
        onDeleteAccount={onDeleteAccount}
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={onCloseChangelog}
        since={lastSeenChangelogVersion}
      />
      <ConfirmDialog
        open={warningSecondsLeft !== null}
        title={t("app.aboutToSignOut")}
        description={
          warningSecondsLeft !== null
            ? warningSecondsLeft === 1
              ? t("confirm.signOutWarningOne", { n: warningSecondsLeft })
              : t("confirm.signOutWarningOther", { n: warningSecondsLeft })
            : null
        }
        actions={[{ label: t("confirm.stayActive"), onSelect: onStaySignedIn }]}
        hideCancel
        onCancel={onStaySignedIn}
      />
    </div>
  );
}
