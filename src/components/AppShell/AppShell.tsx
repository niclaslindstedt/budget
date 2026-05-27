import { useCallback, useEffect, useMemo, useState } from "react";

import { headerActionDescription } from "./types";
import { useAccountDialog } from "./hooks/useAccountDialog";
import { useAchievementsModal } from "./hooks/useAchievementsModal";
import { useAppearanceProjection } from "./hooks/useAppearanceProjection";
import { useBulkSelection } from "./hooks/useBulkSelection";
import { useChangelogState } from "./hooks/useChangelogState";
import { useComplexEntry } from "./hooks/useComplexEntry";
import { useDeletePrompts } from "./hooks/useDeletePrompts";
import { useEditPrompts } from "./hooks/useEditPrompts";
import { useHistoryEntryActions } from "./hooks/useHistoryEntryActions";
import { useRowMutations } from "./hooks/useRowMutations";
import { useSearchModal } from "./hooks/useSearchModal";
import { useSettingsModal } from "./hooks/useSettingsModal";
import { useSyncAutoOpens } from "./hooks/useSyncAutoOpens";
import { useDownloadFlow } from "./hooks/useDownloadFlow";
import { useImportFlow } from "./hooks/useImportFlow";
import { useMatchRuleUi } from "./hooks/useMatchRuleUi";
import { useTransferFlow } from "./hooks/useTransferFlow";
import { usePromptDerivations } from "./hooks/usePromptDerivations";
import { useSheetMetaDialog } from "./hooks/useSheetMetaDialog";
import { useSheetNav } from "./hooks/useSheetNav";
import { useTaxonomyCrud } from "./hooks/useTaxonomyCrud";
import { useToastEffects } from "./hooks/useToastEffects";
import { useUndoRedo } from "./hooks/useUndoRedo";

import { AccountModal } from "../accounts/AccountModal";
import { ActionHistoryModal } from "../ActionHistoryModal";
import { UpdateBalanceModal } from "../accounts/UpdateBalanceModal";
import { AccountsPage } from "../accounts/AccountsPage";
import { CutAccountHistoryModal } from "../accounts/CutAccountHistoryModal";
import { ApplySeriesEditDialog } from "../budget/ApplySeriesEditDialog";
import { DeleteRecurringDialog } from "../budget/DeleteRecurringDialog";
import { AppLoading } from "../AppLoading";
import { ChangelogModal } from "../ChangelogModal";
import { BottomBar } from "../BottomBar";
import { BulkEditModal } from "../budget/BulkEditModal";
import { SheetModal } from "../SheetModal";
import { TransferSearchModal } from "../budget/TransferSearchModal";
import { TransferModal } from "../accounts/TransferModal";
import { ComplexEntryModal } from "../budget/ComplexEntryModal";
import { ConfirmDialog, type ConfirmAction } from "../ConfirmDialog";
import {
  EditEntryModal,
  type EditPatch,
  type EditScope,
} from "../budget/EditEntryModal";
import {
  EditRowModal,
  type EditRowPatch,
  type EditRowScope,
} from "../budget/EditRowModal";
import {
  SplitEntryModal,
  type SplitSubmission,
} from "../budget/SplitEntryModal";
import { DownloadModal } from "../DownloadModal";
import { HistoryEntryEditModal } from "../accounts/HistoryEntryEditModal";
import { HistoryModal } from "../accounts/HistoryModal";
import { ImportHistoryModal } from "../accounts/ImportHistoryModal";
import { ReconciliationModal } from "../accounts/ReconciliationModal";
import { RenamePredictorModal } from "../accounts/RenamePredictorModal";
import { MatchRuleModal } from "../budget/MatchRuleModal";
import { MoveCopyModal } from "../budget/MoveCopyModal";
import { AchievementUnlockModal } from "../AchievementUnlockModal";
import { AchievementsModal } from "../AchievementsModal";
import { HeaderMenu } from "../HeaderMenu";
import { HeaderStar } from "../HeaderStar";
import { PullToRefreshIndicator } from "../PullToRefreshIndicator";
import { SaveStateButton } from "../SaveStateButton";
import { SettingsModal } from "../SettingsModal";
import { BudgetPage } from "../budget/BudgetPage";
import { ConflictResolutionModal } from "../ConflictResolutionModal";
import { ReconnectCloudModal } from "../ReconnectCloudModal";
import { SyncDetailsModal } from "../SyncDetailsModal";
import { SyncStatus } from "../SyncStatus";
import { allCategories, allTypes } from "../../data/presets";
import { isRowSavable, userDataWithSavableRows } from "../../data/budget/rows";
import { findColumnByType } from "../../data/sheet";
import type {
  AccountBudget,
  HistoryEntrySplit,
  Row,
  Settings,
  StoredUser,
  UserData,
} from "../../data/types";
import { RecurringCandidatesPanel } from "../budget/RecurringCandidatesPanel";
import { TransferCollapseModal } from "../accounts/TransferCollapseModal";
import { reducer } from "../../data/reducer";
import {
  unlock as unlockAchievement,
  useAchievementWatcher,
} from "../../data/achievements";
import type { StorageAdapter } from "../../storage/adapter";
import {
  type BackendId,
  type EncryptionMode,
} from "../../storage/backend-preference";
import { useUserDataStorage } from "../../storage/useUserDataStorage";
import { useT } from "../../i18n";
import {
  useEffectiveSettings,
  useIdleSignOut,
  useIsMobile,
  usePullToRefresh,
  useToast,
} from "../../hooks";
import { formatNumber, withCurrency } from "../../utils/format";
type AppShellProps = {
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
  // when the user picks "replace with current budget"; AppShell's
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

export function AppShell({
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
}: AppShellProps) {
  const t = useT();
  const toast = useToast();
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
    historyEntries,
    historyIndex,
    jumpToHistory,
    reload,
  } = useUserDataStorage(adapter, reducer, {
    beforeSerialize: userDataWithSavableRows,
    userId: user.id,
  });
  // Pull-to-refresh wiring. Listens for a downward drag from the top
  // of the page; on release past the trigger distance, re-runs
  // `adapter.load()` via `reload()` so the user can pick up edits
  // pushed by another device. Gated off during the initial load, an
  // open conflict modal, or a paused shrink save — those states
  // already own the screen and a quietly-replaced in-memory state
  // would race with their resolution.
  const ptrEnabled =
    status.kind !== "loading" &&
    status.kind !== "conflict" &&
    status.kind !== "shrink-warning";
  const ptr = usePullToRefresh(reload, { enabled: ptrEnabled });
  // Watch for achievement unlocks. Runs derived predicates on each
  // state delta and drains the manual-unlock bus; new unlocks land
  // in `data.settings.unseenAchievements` via `recordAchievementUnlock`,
  // which the HeaderStar below reads to decide whether to glow.
  // Gated on a loaded budget so the placeholder `freshUserData()`
  // state never gets compared against the hydrated snapshot — that
  // comparison would briefly flip the star on while loading, then
  // off again the moment the adapter replaces state with the
  // persisted bucket.
  useAchievementWatcher(data, dispatch, status.kind !== "loading");
  const {
    achievementsModalOpen,
    setAchievementsModalOpen,
    achievementsListOpen,
    setAchievementsListOpen,
  } = useAchievementsModal();
  // Mirror in-memory data into the App-owned ref so the cloud-link
  // conflict path can upload the latest budget. Updated on every render
  // because both data changes and ref-identity changes (after a sign-
  // out / sign-in round trip) need to land here.
  useEffect(() => {
    currentDataRef.current = data;
  }, [currentDataRef, data]);
  const {
    settingsOpen,
    setSettingsOpen,
    settingsInitialTab,
    setSettingsInitialTab,
    previewSettings,
    setPreviewSettings,
  } = useSettingsModal();
  const [actionHistoryOpen, setActionHistoryOpen] = useState(false);
  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchIndex,
    scrollToRowRequest,
    setScrollToRowRequest,
  } = useSearchModal({ data });
  const {
    syncDetailsOpen,
    setSyncDetailsOpen,
    reconnectCloudOpen,
    setReconnectCloudOpen,
  } = useSyncAutoOpens({
    status,
    cloudReauthAutoOpen: data.settings.cloudReauthAutoOpen,
  });

  useToastEffects({
    dropboxConnected,
    gdriveConnected,
    folderConnected,
    status,
    toast,
  });
  // Account ids for the import-history and view-history modals.
  const {
    deletePrompt,
    setDeletePrompt,
    correctionDeletePrompt,
    setCorrectionDeletePrompt,
    historyEditPrompt,
    setHistoryEditPrompt,
  } = useDeletePrompts();
  // null = closed; otherwise the sheet the user is downloading. The

  const activeSheet =
    data.sheets.find((s) => s.id === data.activeSheetId) ?? data.sheets[0];

  // The active sheet's first AccountBudget block. For sheets of type
  // "budget" this is what the rest of the view renders against. For
  // "accounts" sheets there's no budget item — `activeBudget` is null
  // and we render `AccountsPage` in place of `BudgetPage`. The
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

  const {
    editPrompt,
    setEditPrompt,
    editRowPrompt,
    setEditRowPrompt,
    splitPrompt,
    setSplitPrompt,
    pendingSeriesEdit,
    setPendingSeriesEdit,
  } = useEditPrompts({
    activeRows: activeItem.rows,
    activeAccountId: activeItem.accountId,
    history: data.history,
  });

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

  const { handleUndo, handleRedo } = useUndoRedo({
    canUndo,
    canRedo,
    historyEntries,
    historyIndex,
    undo,
    redo,
    toast,
  });

  // Resolve the bucketed `PersistedSettings` into the flat shape every
  // downstream component already consumes. The hook subscribes to the
  // viewport breakpoint so resizing a desktop browser narrow flips
  // `fontScale`, `showCurrency`, `abbreviateNumbers`, etc. to the
  // mobile bucket's values immediately.
  const isMobile = useIsMobile();
  const effectiveSettings = useEffectiveSettings(data.settings);
  // The SettingsModal's draft, when it's open, overrides the effective
  // settings for any Appearance projection so the user can see their
  // pick applied before saving. `null` whenever the modal is closed.
  const appearanceSettings = previewSettings ?? effectiveSettings;

  const language = data.settings.language;
  useAppearanceProjection({ appearanceSettings, language });

  const isGuest = user.isDefault === true;
  const { warningSecondsLeft, onStaySignedIn } = useIdleSignOut({
    user,
    password,
    ttlMs: data.settings.sessionTimeoutMinutes * 60_000,
    onSignOut,
  });

  const {
    onUpdateCell,
    onCommitCell,
    onSetFiscalMonthShift,
    onSetSeriesPrimaryIncome,
    onClearMerchantHints,
    onClearRecurringDismissals,
    onClearTransferDismissals,
  } = useRowMutations({
    sheetId,
    itemId,
    activeRows: activeItem.rows,
    activeColumns: activeItem.columns,
    setPendingSeriesEdit,
    dispatch,
  });
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
    [dispatch, pendingSeriesEdit, sheetId, itemId, setPendingSeriesEdit],
  );
  const onDismissPendingSeriesEdit = useCallback(() => {
    setPendingSeriesEdit(null);
  }, [setPendingSeriesEdit]);

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
    [activeItem.columns, dispatch, sheetId, itemId, setDeletePrompt],
  );
  const onEditRequest = useCallback(
    (row: Row) => {
      setEditPrompt({ kind: "edit", row });
    },
    [setEditPrompt],
  );
  const onEditRowRequest = useCallback(
    (row: Row) => {
      // Synthesized rows (transfer / history) and balance-correction
      // rows have their own edit flows; the row component already
      // suppresses the long-press and the pen button on them, but guard
      // here too so a stray dispatch never opens the modal on a row it
      // can't meaningfully edit.
      if (row.transferId || row.historyEntryId || row.isCorrection) return;
      setEditRowPrompt({ kind: "edit-row", row });
    },
    [setEditRowPrompt],
  );
  const onSplitRequest = useCallback(
    (row: Row) => {
      // Transfers have their own edit modal, correction rows are
      // display-only — splitting either of those is meaningless. History
      // rows are allowed: splitting a bank entry writes a `splits` array
      // on the underlying `HistoryEntry`, which the synthesizer fans out
      // into multiple rows on the next render.
      if (row.transferId || row.isCorrection) return;
      setSplitPrompt({ kind: "split", row });
    },
    [setSplitPrompt],
  );
  const onEditHistoryRequest = useCallback(
    (row: Row) => {
      if (!row.historyEntryId) return;
      setHistoryEditPrompt({ entryId: row.historyEntryId });
    },
    [setHistoryEditPrompt],
  );
  const onUpdateHistoryEntry = useCallback(
    (
      accountId: string,
      entryId: string,
      patch: {
        userDescription?: string;
        userTypeId?: string | null;
        userCompanyId?: string | null;
        noCompany?: boolean;
      },
    ) =>
      dispatch({
        type: "updateHistoryEntry",
        accountId,
        entryId,
        patch,
      }),
    [dispatch],
  );
  // Row-level company writer fired by the description popover's inline
  // CompanyPicker. Routes synthesized history rows through
  // `updateHistoryEntry` (clearing `noCompany` on assignment so the
  // metadata walkthrough's "needs attention" filter releases the
  // entry) and falls through to a single-row `bulkUpdate` for
  // user-authored budget rows.
  const onSetRowCompany = useCallback(
    (row: Row, companyId: string | null) => {
      if (row.historyEntryId && activeItem.accountId) {
        const patch: {
          userCompanyId: string | null;
          noCompany?: boolean;
        } = { userCompanyId: companyId };
        if (companyId !== null) patch.noCompany = false;
        dispatch({
          type: "updateHistoryEntry",
          accountId: activeItem.accountId,
          entryId: row.historyEntryId,
          patch,
        });
        return;
      }
      dispatch({
        type: "bulkUpdate",
        sheetId,
        itemId,
        rowIds: [row.id],
        patch: { companyId },
      });
    },
    [dispatch, sheetId, itemId, activeItem.accountId],
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
        formatNumber(Math.abs(amount), effectiveSettings),
        effectiveSettings,
      )}`;
      setCorrectionDeletePrompt({
        sheetId,
        itemId: activeItem.id,
        rowId: row.id,
        deltaText,
      });
    },
    [activeItem, sheetId, effectiveSettings, setCorrectionDeletePrompt],
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
  const {
    onCreateCategory,
    onUpdateCategory,
    onDeleteCategory,
    onSetPresetCategoryHidden,
    onCreateType,
    onUpdateType,
    onDeleteType,
    onSetPresetTypeHidden,
    onSetPresetTypeKind,
    onCreateCompany,
    onUpdateCompany,
    onDeleteCompany,
  } = useTaxonomyCrud({ dispatch });
  const onSaveSettings = useCallback(
    (draft: Settings) =>
      dispatch({
        type: "updateSettings",
        draft,
        scope: isMobile ? "mobile" : "desktop",
      }),
    [dispatch, isMobile],
  );
  const {
    changelogOpen,
    changelogSince,
    setChangelogManualOpen,
    onCloseChangelog,
  } = useChangelogState({
    lastSeenChangelogVersion: data.settings.lastSeenChangelogVersion,
    dispatch,
  });

  const { sheetPanelRef, onSelectSheet, onClickHeaderTitle } = useSheetNav({
    sheets: data.sheets,
    activeSheetId: data.activeSheetId,
    effectiveSettings,
    dispatch,
  });
  const {
    sheetModal,
    setSheetModal,
    deleteSheetPrompt,
    setDeleteSheetPrompt,
    deleteSheetActions,
    onOpenNewSheet,
    onOpenEditSheet,
    onSaveSheet,
    onDeleteSheet,
  } = useSheetMetaDialog({ sheets: data.sheets, dispatch, toast });
  const {
    downloadPrompt,
    onOpenDownloadSheet,
    onCloseDownload,
    onConfirmDownload,
  } = useDownloadFlow({
    data,
    effectiveSettings,
    dispatch,
    isMobile,
    language,
    allTypesMerged,
    allCategoriesMerged,
  });
  // Account / transfer modal handlers. Kept on the AppShell so
  // they share the same dispatch and Account state as the rest of the
  // workspace — the modals themselves stay pure presentational shells.
  const {
    accountModal,
    setAccountModal,
    deleteAccountPrompt,
    setDeleteAccountPrompt,
    deleteAccountActions,
    onOpenCreateAccount,
    onOpenEditAccount,
    onSaveAccount,
    onDeleteFinancialAccount,
    onRequestDeleteAccount,
    setUpdateBalanceForId,
    updateBalanceAccount,
    updateBalanceCurrent,
    updateBalanceHasBudget,
    updateBalanceDate,
    onOpenUpdateBalance,
    onConfirmUpdateBalance,
  } = useAccountDialog({ data, dispatch, toast });

  // Bank-history import / viewer flows. The Accounts page surfaces a
  // per-row Upload button (always enabled) and a History viewer
  // button (enabled when entries exist). Both are scoped to the
  // clicked account so the import flow never has to ask "which
  // account is this for?".
  const {
    importHistoryAccount,
    setImportHistoryForId,
    onOpenImportHistory,
    onConfirmImportHistory,
    viewHistoryAccount,
    setViewHistoryForId,
    onOpenViewHistory,
    cutHistoryAccount,
    setCutHistoryForId,
    onOpenCutHistory,
    onConfirmCutHistory,
    reconciliation,
    onApplyReconciliation,
    onCancelReconciliation,
    manualTriage,
    setManualTriage,
    onTriageMonth,
    onApplyManualTriage,
    renamePredictor,
    onCommitRenamePredictor,
    onCancelRenamePredictor,
    onMergeConflictIntoHistory,
    onMergeConflictUserRows,
  } = useImportFlow({ data, activeItem, sheetId, itemId, dispatch });

  const {
    transferRequest,
    setTransferRequest,
    onTransferRequest,
    onOpenCreateTransfer,
    onOpenEditTransfer,
    onCreateTransfer,
    onEditTransferSave,
    onDeleteTransferFromModal,
    uncollapsePrompt,
    setUncollapsePrompt,
    uncollapseActions,
    onUncollapseTransfer,
    transferModalOpen,
    setTransferModalOpen,
    onCollapseTransferPair,
    onDismissTransferPair,
  } = useTransferFlow({ data, activeBudget, dispatch });

  const {
    complexOpen,
    setComplexOpen,
    complexSeedDate,
    complexSeed,
    setComplexSeed,
    recurringPromoteContext,
    setRecurringPromoteContext,
    onAddComplex,
    onComplexSubmit,
    onPromoteRecurringCandidate,
    onDismissRecurringCandidate,
    onDismissAllRecurringCandidates,
    onPromoteHistory,
  } = useComplexEntry({
    activeBudget,
    sheetId,
    itemId,
    dispatch,
    closeEditPrompt: useCallback(() => setEditPrompt(null), [setEditPrompt]),
  });

  const onConvertToRecurring = useCallback(
    (
      rowId: string,
      futureDates: string[],
      typeId: string | null,
      companyId: string | null,
    ) => {
      dispatch({
        type: "convertToRecurring",
        sheetId,
        itemId,
        rowId,
        futureDates,
        typeId,
        companyId,
      });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId, setEditPrompt],
  );
  const onEditSeries = useCallback(
    (rowId: string, patch: EditPatch, scope: EditScope) => {
      unlockAchievement("secondDraft");
      dispatch({ type: "editSeries", sheetId, itemId, rowId, patch, scope });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId, setEditPrompt],
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
        unlockAchievement("splitTheBill");
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
      unlockAchievement("splitTheBill");
      setSplitPrompt(null);
    },
    [
      dispatch,
      sheetId,
      itemId,
      splitPrompt,
      activeItem.accountId,
      data.history,
      setSplitPrompt,
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
  }, [dispatch, splitPrompt, activeItem.accountId, setSplitPrompt]);
  const onSaveEditRow = useCallback(
    (rowId: string, patch: EditRowPatch, scope: EditRowScope) => {
      // Description / amount / category / type are series-wide fields —
      // `editSeries` with a `just-this` scope is the same as a single-
      // row write, so the same dispatch covers both the one-off and
      // recurring cases uniformly. `dateShiftDays` also rides this
      // dispatch so a series-wide nudge lands on every row in scope.
      // Completed is inherently per-occurrence and always lands on the
      // anchor via `updateCell` regardless of scope.
      dispatch({
        type: "editSeries",
        sheetId,
        itemId,
        rowId,
        patch: {
          description: patch.description,
          amount: patch.amount,
          typeId: patch.typeId,
          dateShiftDays:
            patch.dateShiftDays !== 0 ? patch.dateShiftDays : undefined,
        },
        scope,
      });
      const dateCol = findColumnByType(activeItem.columns, "date");
      const row = activeItem.rows.find((r) => r.id === rowId);
      const currentDate =
        dateCol && row && typeof row.cells[dateCol.id] === "string"
          ? (row.cells[dateCol.id] as string)
          : "";
      // Only stamp the date when the user actually typed a new one — a
      // redundant write here would overwrite (and undo) the shift the
      // editSeries dispatch just applied to the anchor row.
      if (dateCol && patch.date !== currentDate) {
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
    [
      activeItem.columns,
      activeItem.rows,
      dispatch,
      sheetId,
      itemId,
      setEditRowPrompt,
    ],
  );

  const dateCol = useMemo(
    () => findColumnByType(activeItem.columns, "date"),
    [activeItem.columns],
  );

  const {
    selectMode,
    selectedIds,
    selectedRows,
    onToggleSelect,
    onToggleSelectMonth,
    onToggleSelectMode,
    onCancelSelect,
    bulkEditOpen,
    setBulkEditOpen,
    onBulkEdit,
    onApplyBulkPatch,
    onApplyBulkRecurring,
    bulkDeletePrompt,
    setBulkDeletePrompt,
    bulkDeleteActions,
    onBulkDelete,
    moveCopyPrompt,
    setMoveCopyPrompt,
    moveCopySourceMonths,
    onBulkMove,
    onBulkCopy,
    onCopyRequest,
    handleMoveCopySubmit,
  } = useBulkSelection({
    sheetId,
    itemId,
    activeItem,
    startOfMonth: data.settings.startOfMonth,
    dispatch,
    toast,
    dateCol,
  });

  const {
    editLastSeriesDate,
    editRowLastSeriesDate,
    deleteLastSeriesDate,
    editRowSeriesRows,
    splitInitialSplits,
    splitAuthoritativeAmount,
    splitAuthoritativeDescription,
    historyEditEntry,
    editHistoryHintPrefill,
    editHistoryMatches,
  } = usePromptDerivations({
    editPrompt,
    editRowPrompt,
    splitPrompt,
    deletePrompt,
    historyEditPrompt,
    activeItem,
    dateCol,
    data,
  });

  const {
    matchRulePrompt,
    setMatchRulePrompt,
    matchRuleSeed,
    matchRuleExisting,
    matchRuleAllEntries,
    onMatchRuleRequest,
    onSubmitMatchRule,
    onDeleteMatchRule,
    onEditMatchRule,
    onMoveMatchRule,
    onReapplyMatchRules,
  } = useMatchRuleUi({ data, activeItem, dispatch, toast });

  const { onSubmitHistoryEdit, onSetHistoryEntryPrimaryIncome } =
    useHistoryEntryActions({
      activeAccountId: activeItem.accountId,
      historyEditPrompt,
      dispatch,
      setHistoryEditPrompt,
    });

  // Series rows are handled by `DeleteRecurringDialog` (which owns its
  // own scope picker, optional date bound, and button labels). This
  // memo only feeds `ConfirmDialog` for the single-row fallback path
  // (one-off rows, or series rows on a sheet with no date column).
  const deleteActions: ConfirmAction[] = useMemo(() => {
    if (!deletePrompt) return [];
    const row = deletePrompt.row;
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
  }, [deletePrompt, dispatch, sheetId, itemId, t, setDeletePrompt]);

  const onDeleteRecurringRows = useCallback(
    (rowIds: string[]) => {
      dispatch({ type: "deleteRows", sheetId, itemId, rowIds });
      setDeletePrompt(null);
    },
    [dispatch, sheetId, itemId, setDeletePrompt],
  );

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
  }, [correctionDeletePrompt, dispatch, t, setCorrectionDeletePrompt]);

  return (
    // The BottomBar is `position: sticky; bottom: 0` in browser
    // mode (so the AddRow at the foot of the last month ends its
    // scroll just above the bar) and `position: fixed; inset: auto
    // 0 0 0` in installed-PWA mode (see `src/styles.css`). The
    // `data-budget-shell` and `data-budget-main` attributes are the
    // hooks the standalone-mode rules target — wrapper pinned to
    // `min-height: 100dvh`, main given a `padding-bottom` reserve
    // so the AddRow clears the now-out-of-flow bar.
    <div
      data-budget-shell
      className="mx-auto flex min-h-svh max-w-full flex-col px-1 md:px-5"
    >
      {/* Pull-to-refresh pip lives outside the `data-modal-background`
          wrapper so an open modal's `inert` doesn't disable its
          fixed-position rendering. The hook itself gates on
          `[aria-modal="true"]` so the gesture is suppressed while a
          modal is up — this is purely so the pip can finish its
          slide-out animation if a modal opens mid-pull. */}
      <PullToRefreshIndicator
        state={ptr.state}
        pullDistance={ptr.pullDistance}
      />
      {/* `data-modal-background` is the toggle target for the modal
          lifecycle hook in src/utils/scroll-lock.ts — any open modal
          flips `inert` on every match, freezing focus and pointer
          events on the chrome behind the backdrop. `display: contents`
          keeps the flex column layout unchanged. */}
      <div className="contents" data-modal-background>
        {/* `pt` adds `env(safe-area-inset-top)` so the header content
            clears the iOS status bar / Dynamic Island when running as
            an installed PWA (where `apple-mobile-web-app-status-bar-style`
            is `black-translucent` and the page extends edge-to-edge under
            the system chrome). Without it, the title overlaps the clock
            and battery indicators. The `data-app-header` hook lets the
            standalone-mode block in `styles.css` shave the extra
            breathing room so the gap above the header matches the
            Dynamic Island's tiny margin to the top edge. */}
        <header
          data-app-header
          className="sticky top-0 z-30 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-page-bg px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 md:mb-6 md:gap-x-4 md:gap-y-3 md:px-0 md:pt-[calc(1rem+env(safe-area-inset-top))] md:pb-4"
        >
          <button
            type="button"
            onClick={onClickHeaderTitle}
            title={headerActionDescription(
              effectiveSettings.headerAction,
              data.sheets,
              t,
            )}
            className="inline-flex cursor-pointer items-center gap-2 rounded border border-transparent bg-transparent p-0 text-left hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
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
            <h1 className="m-0 text-base font-bold tracking-wide text-fg-bright">
              budget
            </h1>
          </button>
          <div
            role="toolbar"
            aria-label={t("app.headerToolbar")}
            className="ml-auto inline-flex items-center gap-2"
          >
            <HeaderStar
              unseenCount={data.settings.unseenAchievements.length}
              onOpenList={() => setAchievementsListOpen(true)}
              onOpenUnlockModal={() => setAchievementsModalOpen(true)}
            />
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
              onOpenChangelog={() => setChangelogManualOpen(true)}
              onSignOut={onSignOut}
              onSwitchUser={onSwitchUser}
              onCreateAccount={onCreateAccount}
            />
          </div>
        </header>
        {/* `<main>` stays as the page-level landmark; the inner wrapper
            carries `role="tabpanel"` so the tablist in `BottomBar`
            has a target to bind to via `aria-labelledby`. `tabIndex={-1}`
            on the inner wrapper lets `Skip to content`-style jumps move
            focus into the panel without it being part of the normal
            keyboard tour. */}
        <main data-budget-main className="flex-1 [overflow-x:clip]">
          <div
            ref={sheetPanelRef}
            role="tabpanel"
            id={`sheet-tabpanel-${activeSheet.id}`}
            aria-labelledby={`sheet-tab-${activeSheet.id}`}
            tabIndex={-1}
            className="h-full will-change-transform"
          >
            {status.kind === "loading" ? (
              <AppLoading />
            ) : activeSheet.type === "accounts" ? (
              <AccountsPage
                sheet={activeSheet}
                data={data}
                settings={effectiveSettings}
                onCreateAccount={onOpenCreateAccount}
                onEditAccount={onOpenEditAccount}
                onDeleteAccount={onRequestDeleteAccount}
                onUpdateBalance={onOpenUpdateBalance}
                onCreateTransfer={onOpenCreateTransfer}
                onEditTransfer={onOpenEditTransfer}
                onImportHistory={onOpenImportHistory}
                onViewHistory={onOpenViewHistory}
                onCutHistory={onOpenCutHistory}
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
                  settings={effectiveSettings}
                  onPromote={onPromoteRecurringCandidate}
                  onDismiss={onDismissRecurringCandidate}
                  onDismissAll={onDismissAllRecurringCandidates}
                />
                <BudgetPage
                  sheet={activeSheet}
                  item={activeItem}
                  data={data}
                  types={allTypesMerged}
                  categories={allCategoriesMerged}
                  companies={data.companies}
                  onCreateType={onCreateType}
                  onCreateCategory={onCreateCategory}
                  onCreateCompany={onCreateCompany}
                  accounts={data.accounts}
                  transfers={data.transfers}
                  history={
                    activeItem.accountId
                      ? (data.history[activeItem.accountId] ?? [])
                      : []
                  }
                  merchantHints={data.merchantHints}
                  matchRules={data.matchRules}
                  openingBalance={
                    activeItem.accountId
                      ? (data.accounts.find(
                          (a) => a.id === activeItem.accountId,
                        )?.openingBalance ?? 0)
                      : 0
                  }
                  settings={effectiveSettings}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  scrollToRowRequest={scrollToRowRequest}
                  onUpdateCell={onUpdateCell}
                  onCommitCell={onCommitCell}
                  onAddRow={onAddRow}
                  onAddComplex={onAddComplex}
                  onDeleteRequest={onDeleteRequest}
                  onEditRequest={onEditRequest}
                  onEditRowRequest={onEditRowRequest}
                  onSplitRequest={onSplitRequest}
                  onTransferRequest={onTransferRequest}
                  onToggleRowTransfer={onToggleRowTransfer}
                  onMatchRuleRequest={onMatchRuleRequest}
                  onEditHistoryRequest={onEditHistoryRequest}
                  onCopyRequest={onCopyRequest}
                  onSetFiscalMonthShift={onSetFiscalMonthShift}
                  onUpdateHistoryEntry={onUpdateHistoryEntry}
                  onCorrectionDeleteRequest={onCorrectionDeleteRequest}
                  onReorderColumns={onReorderColumns}
                  onToggleSelect={onToggleSelect}
                  onToggleSelectMonth={onToggleSelectMonth}
                  onEditSheet={onOpenEditSheet}
                  onDownloadSheet={onOpenDownloadSheet}
                  onMergeConflictIntoHistory={onMergeConflictIntoHistory}
                  onMergeConflictUserRows={onMergeConflictUserRows}
                  onTriageMonth={onTriageMonth}
                  onSetRowCompany={onSetRowCompany}
                />
              </>
            )}
          </div>
        </main>
        {status.kind === "loading" ? null : (
          <BottomBar
            sheets={data.sheets}
            activeSheetId={activeSheet.id}
            onSelectSheet={onSelectSheet}
            onEditSheet={onOpenEditSheet}
            onAddSheet={onOpenNewSheet}
            canUndo={canUndo}
            canRedo={canRedo}
            selectMode={selectMode}
            onUndo={() => {
              unlockAchievement("secondThoughts");
              handleUndo();
            }}
            onRedo={handleRedo}
            onOpenHistory={() => setActionHistoryOpen(true)}
            onOpenSearch={() => {
              unlockAchievement("detective");
              setSearchOpen(true);
            }}
            onToggleSelectMode={onToggleSelectMode}
            bulkSelectedCount={selectedIds.size}
            onBulkEdit={onBulkEdit}
            onBulkMove={onBulkMove}
            onBulkCopy={onBulkCopy}
            onBulkDelete={onBulkDelete}
            onBulkCancel={onCancelSelect}
          />
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
        settings={effectiveSettings}
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
        settings={effectiveSettings}
        onCancel={() => setImportHistoryForId(null)}
        onConfirm={onConfirmImportHistory}
      />
      <ReconciliationModal
        open={reconciliation !== null}
        onCancel={onCancelReconciliation}
        onApply={onApplyReconciliation}
        accountId={reconciliation?.accountId ?? ""}
        preImportData={reconciliation?.preImportData ?? data}
        newEntries={reconciliation?.newEntries ?? []}
        candidates={reconciliation?.candidates ?? []}
        orphans={reconciliation?.orphans ?? []}
        settings={effectiveSettings}
      />
      {/* Second mount, scoped to the retrospective orphan-triage CTA
          fired from the budget-page MonthTable footer. Same modal
          component as the import-time one — just fed an empty
          `newEntries` / `candidates` so only the orphan section
          renders, and committed via `onApplyManualTriage` which
          dispatches `applyReconciliation` standalone (no
          `importBankHistory` in flight). */}
      <ReconciliationModal
        open={manualTriage !== null}
        onCancel={() => setManualTriage(null)}
        onApply={onApplyManualTriage}
        accountId={manualTriage?.accountId ?? ""}
        preImportData={manualTriage?.preImportData ?? data}
        newEntries={[]}
        candidates={[]}
        orphans={manualTriage?.orphans ?? []}
        settings={effectiveSettings}
      />
      <RenamePredictorModal
        open={renamePredictor !== null}
        suggestions={renamePredictor?.suggestions ?? []}
        onCancel={onCancelRenamePredictor}
        onCommit={onCommitRenamePredictor}
      />
      <CutAccountHistoryModal
        open={cutHistoryAccount !== null}
        account={cutHistoryAccount}
        history={
          cutHistoryAccount ? (data.history[cutHistoryAccount.id] ?? []) : []
        }
        transfers={data.transfers}
        onCancel={() => setCutHistoryForId(null)}
        onConfirm={onConfirmCutHistory}
      />
      <HistoryModal
        open={viewHistoryAccount !== null}
        account={viewHistoryAccount}
        entries={
          viewHistoryAccount ? (data.history[viewHistoryAccount.id] ?? []) : []
        }
        types={allTypesMerged}
        companies={data.companies}
        merchantHints={data.merchantHints}
        matchRules={data.matchRules}
        settings={effectiveSettings}
        onCancel={() => setViewHistoryForId(null)}
      />
      <TransferCollapseModal
        open={transferModalOpen}
        history={data.history}
        accounts={data.accounts}
        dismissedPairKeys={data.transferCollapseDismissals}
        settings={effectiveSettings}
        onClose={() => setTransferModalOpen(false)}
        onCollapse={onCollapseTransferPair}
        onDismiss={onDismissTransferPair}
      />
      <TransferModal
        open={transferRequest !== null}
        request={transferRequest}
        accounts={data.accounts}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        settings={effectiveSettings}
        onClose={() => setTransferRequest(null)}
        onCreate={onCreateTransfer}
        onEdit={onEditTransferSave}
        onDelete={onDeleteTransferFromModal}
        onUncollapse={onUncollapseTransfer}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <ComplexEntryModal
        open={complexOpen}
        initialDate={complexSeedDate}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        settings={effectiveSettings}
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
        onCreateCategory={onCreateCategory}
      />
      <EditEntryModal
        open={editPrompt !== null}
        row={editPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        companies={data.companies}
        settings={effectiveSettings}
        lastSeriesDate={editLastSeriesDate}
        historyHintPrefill={editHistoryHintPrefill}
        historyMatches={editHistoryMatches ?? undefined}
        onClose={() => setEditPrompt(null)}
        onConvertToRecurring={onConvertToRecurring}
        onEditSeries={onEditSeries}
        onPromoteHistory={onPromoteHistory}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
      />
      <EditRowModal
        open={editRowPrompt !== null}
        row={editRowPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        settings={effectiveSettings}
        lastSeriesDate={editRowLastSeriesDate}
        seriesRows={editRowSeriesRows}
        seriesMetadata={
          editRowPrompt?.row.seriesId
            ? data.seriesMetadata[editRowPrompt.row.seriesId]
            : undefined
        }
        onClose={() => setEditRowPrompt(null)}
        onSave={onSaveEditRow}
        onSetSeriesPrimaryIncome={onSetSeriesPrimaryIncome}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <SplitEntryModal
        open={splitPrompt !== null}
        row={splitPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        settings={effectiveSettings}
        initialSplits={splitInitialSplits}
        authoritativeAmount={splitAuthoritativeAmount}
        authoritativeDescription={splitAuthoritativeDescription}
        onClose={() => setSplitPrompt(null)}
        onSplit={onSplitSubmit}
        onRevert={onSplitRevert}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <MatchRuleModal
        open={
          matchRulePrompt !== null &&
          (matchRulePrompt.kind === "edit"
            ? matchRuleExisting !== null
            : matchRuleSeed !== null)
        }
        seedEntry={matchRuleSeed}
        allEntries={matchRuleAllEntries}
        existing={matchRuleExisting}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        companies={data.companies}
        settings={effectiveSettings}
        onClose={() => setMatchRulePrompt(null)}
        onSubmit={onSubmitMatchRule}
        onDelete={
          matchRulePrompt?.kind === "edit" ? onDeleteMatchRule : undefined
        }
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
      />
      <HistoryEntryEditModal
        open={historyEditPrompt !== null && historyEditEntry !== null}
        entry={historyEditEntry}
        categories={allCategoriesMerged}
        types={allTypesMerged}
        companies={data.companies}
        settings={effectiveSettings}
        primaryIncomeMerchants={data.primaryIncomeMerchants}
        onClose={() => setHistoryEditPrompt(null)}
        onSubmit={onSubmitHistoryEdit}
        onSetPrimaryIncome={onSetHistoryEntryPrimaryIncome}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
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
        settings={effectiveSettings}
        onClose={() => setBulkEditOpen(false)}
        onApplyPatch={onApplyBulkPatch}
        onApplyRecurring={onApplyBulkRecurring}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
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
        open={
          deletePrompt !== null &&
          !(deletePrompt.row.seriesId && dateCol !== undefined)
        }
        title={t("confirm.deleteRow")}
        description={t("confirm.deleteRowHint")}
        actions={deleteActions}
        onCancel={() => setDeletePrompt(null)}
      />
      <DeleteRecurringDialog
        open={
          deletePrompt !== null &&
          !!deletePrompt.row.seriesId &&
          dateCol !== undefined
        }
        row={deletePrompt?.row ?? null}
        rows={activeItem.rows}
        dateColumnId={dateCol?.id ?? null}
        lastSeriesDate={deleteLastSeriesDate}
        settings={effectiveSettings}
        onCancel={() => setDeletePrompt(null)}
        onDelete={onDeleteRecurringRows}
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
        open={uncollapsePrompt !== null}
        title={t("transfer.uncollapseTitle")}
        description={t("transfer.uncollapseHint")}
        actions={uncollapseActions}
        onCancel={() => setUncollapsePrompt(null)}
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
      <AchievementUnlockModal
        open={achievementsModalOpen}
        unseenIds={data.settings.unseenAchievements}
        onClose={() => {
          setAchievementsModalOpen(false);
          dispatch({ type: "clearUnseenAchievements" });
        }}
      />
      <AchievementsModal
        open={achievementsListOpen}
        onClose={() => setAchievementsListOpen(false)}
        unlocked={data.settings.achievements}
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
        initialTab={settingsInitialTab}
        settings={effectiveSettings}
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
        onClose={() => {
          setSettingsOpen(false);
          setSettingsInitialTab(undefined);
        }}
        onSave={onSaveSettings}
        onPreviewAppearance={setPreviewSettings}
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
        onCreateCompany={onCreateCompany}
        onUpdateCompany={onUpdateCompany}
        onDeleteCompany={onDeleteCompany}
        onEditMatchRule={onEditMatchRule}
        onMoveMatchRule={onMoveMatchRule}
        onReapplyMatchRules={onReapplyMatchRules}
        onDeleteAccount={onDeleteAccount}
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={onCloseChangelog}
        since={changelogSince}
      />
      <ActionHistoryModal
        open={actionHistoryOpen}
        onClose={() => setActionHistoryOpen(false)}
        entries={historyEntries}
        currentIndex={historyIndex}
        onJump={(index) => {
          unlockAchievement("timeMachine");
          jumpToHistory(index);
          setActionHistoryOpen(false);
        }}
      />
      <TransferSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        index={searchIndex}
        settings={effectiveSettings}
        onPick={(entry) => {
          if (entry.sheetId !== data.activeSheetId) {
            dispatch({ type: "selectSheet", sheetId: entry.sheetId });
          }
          setScrollToRowRequest((prev) => ({
            sheetId: entry.sheetId,
            rowId: entry.rowId,
            iso: entry.iso,
            tick: (prev?.tick ?? 0) + 1,
          }));
          setSearchOpen(false);
        }}
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
