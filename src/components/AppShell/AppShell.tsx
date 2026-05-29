import { useCallback, useEffect, useMemo } from "react";

import {
  type AppShellAuth,
  type AppShellStorage,
  headerActionDescription,
} from "./types";
import { useAccountDialog } from "./hooks/useAccountDialog";
import { useAppearanceProjection } from "./hooks/useAppearanceProjection";
import { useBulkSelection } from "./hooks/useBulkSelection";
import { useComplexEntry } from "./hooks/useComplexEntry";
import { useDeletePrompts } from "./hooks/useDeletePrompts";
import { useEditPrompts } from "./hooks/useEditPrompts";
import { useRowMutations } from "./hooks/useRowMutations";
import { useSearchModal } from "./hooks/useSearchModal";
import { useSettingsModal } from "./hooks/useSettingsModal";
import { useSyncAutoOpens } from "./hooks/useSyncAutoOpens";
import { useDownloadFlow } from "./hooks/useDownloadFlow";
import { useImportFlow } from "./hooks/useImportFlow";
import { useMatchRuleUi } from "./hooks/useMatchRuleUi";
import { useTransferFlow } from "./hooks/useTransferFlow";
import { useSheetMetaDialog } from "./hooks/useSheetMetaDialog";
import { useSheetNav } from "./hooks/useSheetNav";
import { useTaxonomyCrud } from "./hooks/useTaxonomyCrud";
import { useToastEffects } from "./hooks/useToastEffects";
import { useUndoRedo } from "./hooks/useUndoRedo";

import { AccountsModalHost } from "./AccountsModalHost";
import { AccountsPage } from "../accounts/AccountsPage";
import { AppLoading } from "../AppLoading";
import { BottomBar } from "../BottomBar";
import { BudgetModalHost } from "./BudgetModalHost";
import { BudgetPage } from "../budget/BudgetPage";
import { BudgetRecurringCandidatesPanel } from "../budget/BudgetRecurringCandidatesPanel";
import { HeaderMenu } from "../HeaderMenu";
import { HeaderStar } from "../HeaderStar";
import { ModalDispatchProvider } from "../ModalDispatchProvider";
import { type ModalCommandHandlers } from "../modal-dispatch";
import { PullToRefreshIndicator } from "../PullToRefreshIndicator";
import { SaveStateButton } from "../SaveStateButton";
import { SyncStatus } from "../SyncStatus";
import { UniversalModalHost } from "./UniversalModalHost";
import { allCategories, allTypes } from "../../data/presets/merge";
import { computeCompanyTypeSuggestions } from "../../data/budget/company-type-suggestions";
import {
  isRowSavable,
  userDataHasUnsavableRows,
  userDataWithSavableRows,
} from "../../data/budget/rows";
import { findColumnByType } from "../../data/sheet";
import type { AccountBudget, Row, Settings, UserData } from "../../data/types";
import { reducer } from "../../data/reducer";
import {
  unlock as unlockAchievement,
  useAchievementWatcher,
} from "../../data/achievements";
import { useUserDataStorage } from "../../storage/useUserDataStorage";
import { useT } from "../../i18n";
import {
  useEffectiveSettings,
  useIdleSignOut,
  useIsMobile,
  usePullToRefresh,
  useToast,
} from "../../hooks";
type AppShellProps = {
  auth: AppShellAuth;
  storage: AppShellStorage;
  // App owns this ref and reads it from the cloud-link conflict path
  // when the user picks "replace with current budget"; AppShell's
  // job is to keep it pointed at whatever `useUserDataStorage` is
  // showing on screen so the upload reflects the latest in-memory edits.
  currentDataRef: React.MutableRefObject<UserData | null>;
};

export function AppShell({ auth, storage, currentDataRef }: AppShellProps) {
  const {
    user,
    password,
    hasOtherUsers,
    getEncryptionPassword,
    onSignOut,
    onSwitchUser,
    onCreateAccount,
    onDeleteAccount,
  } = auth;
  const {
    adapter,
    backend,
    dropboxConnected,
    gdriveConnected,
    folderConnected,
  } = storage;
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
    hasUnsavableContent: userDataHasUnsavableRows,
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
  // Mirror in-memory data into the App-owned ref so the cloud-link
  // conflict path can upload the latest budget. Updated on every render
  // because both data changes and ref-identity changes (after a sign-
  // out / sign-in round trip) need to land here.
  useEffect(() => {
    currentDataRef.current = data;
  }, [currentDataRef, data]);
  const settingsModal = useSettingsModal();
  const { setSettingsOpen, previewSettings } = settingsModal;
  const searchModal = useSearchModal({ data });
  const { setSearchOpen, scrollToRowRequest } = searchModal;
  const syncAutoOpens = useSyncAutoOpens({
    status,
    cloudReauthAutoOpen: data.settings.cloudReauthAutoOpen,
  });
  const { setSyncDetailsOpen } = syncAutoOpens;

  useToastEffects({
    dropboxConnected,
    gdriveConnected,
    folderConnected,
    status,
    toast,
  });
  // Account ids for the import-history and view-history modals.
  const deletePrompts = useDeletePrompts();
  const { setDeletePrompt, setCorrectionDeletePrompt, setHistoryEditPrompt } =
    deletePrompts;
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

  const editPrompts = useEditPrompts({
    activeRows: activeItem.rows,
    activeAccountId: activeItem.accountId,
    history: data.history,
  });
  const {
    setEditPrompt,
    setEditRowPrompt,
    setSplitPrompt,
    setPendingSeriesEdit,
  } = editPrompts;

  // Merged category / type lists exposed to every picker, renderer,
  // and resolver. Built-in `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES`
  // come first (minus the ones the user has hidden via Settings),
  // followed by the user-added entries on `data.categories` /
  // `data.types`. Computing them once here keeps the merge rules in
  // one place — pickers downstream stay unaware of the preset / user
  // split.
  //
  // The dependency list is narrowed to the sub-fields `allTypes` /
  // `allCategories` actually consume so a cell-edit (which only flips
  // `data.sheets`) doesn't mint fresh arrays here. Without that, the
  // new references propagate to `BudgetPage`'s `types` / `categories`
  // props and silently invalidate every downstream memo — including
  // `buildSynthesizedRows`, which is meant to skip across keystrokes
  // (see the comment in BudgetPage near that useMemo). The result was
  // every history entry re-synthesized + every match rule re-tested
  // on every keystroke; for a budget with a few thousand history
  // entries and a handful of rules that was the dominant cost of
  // typing in a cell.
  const allCategoriesMerged = useMemo(
    () => allCategories(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.hiddenPresetCategoryIds, data.categories],
  );
  const allTypesMerged = useMemo(
    () => allTypes(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.hiddenPresetTypeIds, data.presetTypeKindOverrides, data.types],
  );

  // (company, type) tallies for the auto-fill: when the user picks a
  // company on a row whose type isn't set, and the company has been
  // paired with one single type more times than the user-configured
  // threshold, we auto-fill the type. Walks every budget row and
  // history-entry override on every relevant data change — small
  // surface, cheap enough not to bother caching across renders.
  const companyTypeSuggestions = useMemo(
    () =>
      computeCompanyTypeSuggestions(
        data,
        data.settings.companyTypeAutoFillMinOccurrences,
      ),
    [data],
  );

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

  const rowMutations = useRowMutations({
    sheetId,
    itemId,
    activeRows: activeItem.rows,
    activeColumns: activeItem.columns,
    activeAccountId: activeItem.accountId,
    history: data.history,
    companyTypeSuggestions,
    effectiveSettings,
    setPendingSeriesEdit,
    setHistoryEditPrompt,
    setCorrectionDeletePrompt,
    dispatch,
  });
  const {
    onUpdateCell,
    onCommitCell,
    onSetFiscalMonthShift,
    onSetSeriesPrimaryIncome,
    onClearMerchantHints,
    onClearRecurringDismissals,
    onClearTransferDismissals,
    onToggleRowTransfer,
    onEditHistoryRequest,
    onUpdateHistoryEntry,
    onApplyMetadataToMatchingHistory,
    onSetRowCompany,
    onSetRowNoCompany,
    onCorrectionDeleteRequest,
  } = rowMutations;
  const onAddRow = useCallback(
    (date: string) => dispatch({ type: "addRow", sheetId, itemId, date }),
    [dispatch, sheetId, itemId],
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
      if (row.kind !== "user") return;
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
      if (row.kind === "transfer" || row.kind === "correction") return;
      setSplitPrompt({ kind: "split", row });
    },
    [setSplitPrompt],
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
  const taxonomyCrud = useTaxonomyCrud({ dispatch });
  const { onCreateCategory, onCreateType, onCreateCompany, onCreateTag } =
    taxonomyCrud;
  const onSaveSettings = useCallback(
    (draft: Settings) =>
      dispatch({
        type: "updateSettings",
        draft,
        scope: isMobile ? "mobile" : "desktop",
      }),
    [dispatch, isMobile],
  );
  const { sheetPanelRef, onSelectSheet, onClickHeaderTitle } = useSheetNav({
    sheets: data.sheets,
    activeSheetId: data.activeSheetId,
    effectiveSettings,
    dispatch,
  });
  const sheetMetaDialog = useSheetMetaDialog({
    sheets: data.sheets,
    dispatch,
    toast,
  });
  const { onOpenNewSheet, onOpenEditSheet } = sheetMetaDialog;
  const downloadFlow = useDownloadFlow({
    data,
    effectiveSettings,
    dispatch,
    isMobile,
    language,
    allTypesMerged,
    allCategoriesMerged,
  });
  const { onOpenDownloadSheet } = downloadFlow;

  // Account / transfer modal handlers. Kept on the AppShell so
  // they share the same dispatch and Account state as the rest of the
  // workspace — the modals themselves stay pure presentational shells.
  const accountDialog = useAccountDialog({ data, dispatch, toast });
  const {
    onOpenCreateAccount,
    onOpenEditAccount,
    onRequestDeleteAccount,
    onOpenUpdateBalance,
  } = accountDialog;

  // Bank-history import / viewer flows. The Accounts page surfaces a
  // per-row Upload button (always enabled) and a History viewer
  // button (enabled when entries exist). Both are scoped to the
  // clicked account so the import flow never has to ask "which
  // account is this for?".
  const importFlow = useImportFlow({
    data,
    activeItem,
    sheetId,
    itemId,
    dispatch,
  });
  const {
    onOpenImportHistory,
    onOpenViewHistory,
    onOpenCutHistory,
    onTriageMonth,
    onMergeConflictIntoHistory,
    onMergeConflictUserRows,
  } = importFlow;

  const transferFlow = useTransferFlow({ data, activeBudget, dispatch });
  const { onTransferRequest, onOpenCreateTransfer, onOpenEditTransfer } =
    transferFlow;

  const complexEntry = useComplexEntry({
    activeBudget,
    sheetId,
    itemId,
    dispatch,
    closeEditPrompt: useCallback(() => setEditPrompt(null), [setEditPrompt]),
  });
  const {
    onAddComplex,
    onPromoteRecurringCandidate,
    onDismissRecurringCandidate,
    onDismissAllRecurringCandidates,
  } = complexEntry;

  const dateCol = useMemo(
    () => findColumnByType(activeItem.columns, "date"),
    [activeItem.columns],
  );

  const bulkSelection = useBulkSelection({
    sheetId,
    itemId,
    activeItem,
    startOfMonth: data.settings.startOfMonth,
    dispatch,
    toast,
    dateCol,
  });
  const {
    selectMode,
    selectedIds,
    onToggleSelect,
    onToggleSelectMonth,
    onToggleSelectMode,
    onCancelSelect,
    onBulkEdit,
    onBulkDelete,
    onBulkMove,
    onBulkCopy,
    onCopyRequest,
  } = bulkSelection;

  const matchRuleUi = useMatchRuleUi({ data, activeItem, dispatch, toast });
  const { onMatchRuleRequest } = matchRuleUi;

  // Base modal-handler slice for ModalDispatchProvider — the page chrome
  // (header menu, bottom bar, header star, sync status), the page title
  // menus (budget / accounts), and the budget table's per-row affordances
  // name the modal they want instead of each carrying an opener callback
  // prop. These are the handlers whose state AppShell still owns; modal
  // hosts that own a hook's state register their own slice (see
  // `useRegisterModalHandlers`), and the provider merges them at dispatch
  // time. Defined below the transfer / bulk / match-rule hooks so their
  // `on*Request` openers are in scope. Open-side achievement unlocks (the
  // search "detective") ride along here so the chrome stays unaware of
  // them; the budget-row handlers keep their own guards (e.g. `deleteRow`
  // discards an unsaved placeholder row).
  const modalHandlers = useMemo<Partial<ModalCommandHandlers>>(
    () => ({
      openSettings: () => setSettingsOpen(true),
      openSearch: () => {
        unlockAchievement("detective");
        setSearchOpen(true);
      },
      openSyncDetails: () => setSyncDetailsOpen(true),
      openNewSheet: onOpenNewSheet,
      openEditSheet: onOpenEditSheet,
      openDownloadSheet: onOpenDownloadSheet,
      editEntry: onEditRequest,
      editRow: onEditRowRequest,
      deleteRow: onDeleteRequest,
      splitRow: onSplitRequest,
      transferRow: onTransferRequest,
      matchRule: onMatchRuleRequest,
      editHistory: onEditHistoryRequest,
      copyRow: onCopyRequest,
      correctionDelete: onCorrectionDeleteRequest,
    }),
    [
      setSettingsOpen,
      setSearchOpen,
      setSyncDetailsOpen,
      onOpenNewSheet,
      onOpenEditSheet,
      onOpenDownloadSheet,
      onEditRequest,
      onEditRowRequest,
      onDeleteRequest,
      onSplitRequest,
      onTransferRequest,
      onMatchRuleRequest,
      onEditHistoryRequest,
      onCopyRequest,
      onCorrectionDeleteRequest,
    ],
  );

  return (
    <ModalDispatchProvider handlers={modalHandlers}>
      {/* The BottomBar is `position: sticky; bottom: 0` in browser
          mode (so the AddRow at the foot of the last month ends its
          scroll just above the bar) and `position: fixed; inset: auto
          0 0 0` in installed-PWA mode (see `src/styles.css`). The
          `data-budget-shell` and `data-budget-main` attributes are the
          hooks the standalone-mode rules target — wrapper pinned to
          `min-height: 100dvh`, main given a `padding-bottom` reserve
          so the AddRow clears the now-out-of-flow bar. */}
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
              />
              {backend === "dropbox" || backend === "gdrive" ? (
                <SyncStatus
                  providerName={
                    backend === "dropbox" ? "Dropbox" : "Google Drive"
                  }
                  status={status}
                  dirty={dirty}
                  onSave={saveNow}
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
                />
              ) : (
                <>
                  <BudgetRecurringCandidatesPanel
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
                    companyTypeSuggestions={companyTypeSuggestions}
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
                    onToggleRowTransfer={onToggleRowTransfer}
                    onSetFiscalMonthShift={onSetFiscalMonthShift}
                    onUpdateHistoryEntry={onUpdateHistoryEntry}
                    onApplyMetadataToMatchingHistory={
                      onApplyMetadataToMatchingHistory
                    }
                    tags={data.tags}
                    onCreateTag={onCreateTag}
                    onReorderColumns={onReorderColumns}
                    onToggleSelect={onToggleSelect}
                    onToggleSelectMonth={onToggleSelectMonth}
                    onMergeConflictIntoHistory={onMergeConflictIntoHistory}
                    onMergeConflictUserRows={onMergeConflictUserRows}
                    onTriageMonth={onTriageMonth}
                    onSetRowCompany={onSetRowCompany}
                    onSetRowNoCompany={onSetRowNoCompany}
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
              canUndo={canUndo}
              canRedo={canRedo}
              selectMode={selectMode}
              onUndo={() => {
                unlockAchievement("secondThoughts");
                handleUndo();
              }}
              onRedo={handleRedo}
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
        <UniversalModalHost
          data={data}
          effectiveSettings={effectiveSettings}
          dispatch={dispatch}
          user={user}
          isGuest={isGuest}
          storageState={{
            status,
            dirty,
            saveNow,
            resolveKeepLocal,
            resolveKeepRemote,
            confirmShrinkSave,
            discardShrinkSave,
            historyEntries,
            historyIndex,
            jumpToHistory,
          }}
          storage={storage}
          auth={{ getEncryptionPassword, onDeleteAccount }}
          warningSecondsLeft={warningSecondsLeft}
          onStaySignedIn={onStaySignedIn}
          sheetMetaDialog={sheetMetaDialog}
          downloadFlow={downloadFlow}
          settingsModal={settingsModal}
          syncAutoOpens={syncAutoOpens}
          searchModal={searchModal}
          searchBulk={{
            selectMode,
            selectedIds,
            activeSheetId: activeSheet.id,
            onToggleSelectMode,
            onToggleSelect,
            onSelectMany: (rowIds) => onToggleSelectMonth(rowIds, true),
            onSelectSheet,
            onBulkEdit,
            onBulkMove,
            onBulkCopy,
            onBulkDelete,
            onBulkCancel: onCancelSelect,
          }}
          taxonomyCrud={taxonomyCrud}
          matchRuleUi={matchRuleUi}
          onClearMerchantHints={onClearMerchantHints}
          onClearRecurringDismissals={onClearRecurringDismissals}
          onClearTransferDismissals={onClearTransferDismissals}
          onSaveSettings={onSaveSettings}
          onImport={onImport}
        />
        <AccountsModalHost
          data={data}
          effectiveSettings={effectiveSettings}
          categories={allCategoriesMerged}
          types={allTypesMerged}
          accountDialog={accountDialog}
          importFlow={importFlow}
          transferFlow={transferFlow}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
        />
        <BudgetModalHost
          data={data}
          effectiveSettings={effectiveSettings}
          categories={allCategoriesMerged}
          types={allTypesMerged}
          companyTypeSuggestions={companyTypeSuggestions}
          sheetId={sheetId}
          itemId={itemId}
          activeItem={activeItem}
          dateCol={dateCol}
          dispatch={dispatch}
          editPrompts={editPrompts}
          deletePrompts={deletePrompts}
          complexEntry={complexEntry}
          matchRuleUi={matchRuleUi}
          bulkSelection={bulkSelection}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCreateCompany={onCreateCompany}
          onCreateTag={onCreateTag}
          onSetSeriesPrimaryIncome={onSetSeriesPrimaryIncome}
        />
      </div>
    </ModalDispatchProvider>
  );
}
