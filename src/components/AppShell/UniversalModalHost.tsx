import { useState } from "react";

import { AchievementUnlockModal } from "../AchievementUnlockModal";
import { AchievementsModal } from "../AchievementsModal";
import { ActionHistoryModal } from "../ActionHistoryModal";
import { BudgetTransferSearchModal } from "../budget/BudgetTransferSearchModal";
import { ChangelogModal } from "../ChangelogModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { ConflictResolutionModal } from "../ConflictResolutionModal";
import { DownloadModal } from "../DownloadModal";
import { ReconnectCloudModal } from "../ReconnectCloudModal";
import { SettingsModal } from "../SettingsModal";
import { SheetModal } from "../SheetModal";
import { SyncDetailsModal } from "../SyncDetailsModal";
import { useRegisterModalHandlers } from "../modal-dispatch";
import { useAchievementsModal } from "./hooks/useAchievementsModal";
import { useAppearanceProjection } from "./hooks/useAppearanceProjection";
import { useChangelogState } from "./hooks/useChangelogState";
import { useSettingsModal } from "./hooks/useSettingsModal";
import { useSyncAutoOpens } from "./hooks/useSyncAutoOpens";
import { unlock as unlockAchievement } from "../../data/achievements";
import type { Action } from "../../data/reducer";
import type {
  AccountBudget,
  Settings,
  StoredUser,
  UserData,
} from "../../data/types";
import type {
  ActionHistoryEntry,
  SaveStatus,
} from "../../storage/useUserDataStorage";
import { useT } from "../../i18n";
import type { AppShellAuth, AppShellStorage } from "./types";
import type { useDownloadFlow } from "./hooks/useDownloadFlow";
import type { useMatchRuleUi } from "./hooks/useMatchRuleUi";
import type { useSearchModal } from "./hooks/useSearchModal";
import type { useSheetMetaDialog } from "./hooks/useSheetMetaDialog";
import type { useTaxonomyCrud } from "./hooks/useTaxonomyCrud";

type Props = {
  data: UserData;
  effectiveSettings: Settings;
  dispatch: (action: Action) => void;
  user: StoredUser;
  isGuest: boolean;
  // Storage state machine slice from useUserDataStorage — the subset
  // the modal host consumes (status, save handles, conflict
  // resolution, action history).
  storageState: {
    status: SaveStatus;
    dirty: boolean;
    saveNow: () => void;
    resolveKeepLocal: () => void;
    resolveKeepRemote: () => void;
    confirmShrinkSave: () => void;
    discardShrinkSave: () => void;
    historyEntries: readonly ActionHistoryEntry[];
    historyIndex: number;
    jumpToHistory: (index: number) => void;
  };
  // Backend / encryption / connection state — bundled in the same
  // shape AppShell already receives from App.tsx so it threads through
  // as one object.
  storage: AppShellStorage;
  // Auth-side callbacks SettingsModal forwards.
  auth: Pick<AppShellAuth, "getEncryptionPassword" | "onDeleteAccount">;
  // Idle sign-out warning dialog.
  warningSecondsLeft: number | null;
  onStaySignedIn: () => void;
  // Sub-hook returns.
  sheetMetaDialog: ReturnType<typeof useSheetMetaDialog>;
  downloadFlow: ReturnType<typeof useDownloadFlow>;
  searchModal: ReturnType<typeof useSearchModal>;
  // Select-many wiring for the search modal — the same bulk-selection
  // handlers the BottomBar uses, plus the active sheet id + a sheet
  // switcher so the first pick can lock selection to its sheet.
  searchBulk: {
    selectMode: boolean;
    selectedIds: ReadonlySet<string>;
    activeSheetId: string;
    onToggleSelectMode: () => void;
    onToggleSelect: (rowId: string) => void;
    onSelectMany: (rowIds: string[]) => void;
    onSelectSheet: (sheetId: string) => void;
    onBulkEdit: () => void;
    onBulkMove: () => void;
    onBulkCopy: () => void;
    onBulkDelete: () => void;
    onBulkCancel: () => void;
  };
  taxonomyCrud: ReturnType<typeof useTaxonomyCrud>;
  matchRuleUi: Pick<
    ReturnType<typeof useMatchRuleUi>,
    "onEditMatchRule" | "onMoveMatchRule" | "onReapplyMatchRules"
  >;
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
  onSaveSettings: (draft: Settings) => void;
  onImport: (next: UserData) => void;
};

export function UniversalModalHost(props: Props) {
  const {
    data,
    effectiveSettings,
    dispatch,
    user,
    isGuest,
    storageState,
    storage,
    auth,
    warningSecondsLeft,
    onStaySignedIn,
    sheetMetaDialog,
    downloadFlow,
    searchModal,
    searchBulk,
    taxonomyCrud,
    matchRuleUi,
    onClearMerchantHints,
    onClearRecurringDismissals,
    onClearTransferDismissals,
    onSaveSettings,
    onImport,
  } = props;
  const t = useT();
  // The action-history, achievements, changelog, sync-details, and settings
  // modals render only here and open only from chrome (via the dispatch
  // context), so the host owns their open state outright and registers the
  // open handlers rather than threading a boolean + setter down from AppShell.
  // The changelog hook also drives the per-version auto-open on upgrade, and
  // `useSyncAutoOpens` auto-surfaces sync-details on a paused / parse-error
  // status and the reconnect modal on a cloud auth-error — their inputs
  // (`data`, `dispatch`, `storageState.status`) are already host props, so
  // they live here cleanly.
  const [actionHistoryOpen, setActionHistoryOpen] = useState(false);
  const {
    achievementsModalOpen,
    setAchievementsModalOpen,
    achievementsListOpen,
    setAchievementsListOpen,
  } = useAchievementsModal();
  const {
    changelogOpen,
    changelogSince,
    setChangelogManualOpen,
    onCloseChangelog,
  } = useChangelogState({
    lastSeenChangelogVersion: data.settings.lastSeenChangelogVersion,
    dispatch,
  });
  const {
    syncDetailsOpen,
    setSyncDetailsOpen,
    reconnectCloudOpen,
    setReconnectCloudOpen,
  } = useSyncAutoOpens({
    status: storageState.status,
    cloudReauthAutoOpen: data.settings.cloudReauthAutoOpen,
  });
  // SettingsModal lives here, so its live Appearance preview draft does too:
  // the modal pushes its edits up via `onPreviewAppearance={setPreviewSettings}`
  // and `useAppearanceProjection` projects `previewSettings ?? effectiveSettings`
  // onto the document root, letting the user see a theme / font / shape pick
  // before committing. The projection is always-on (it also projects the
  // persisted settings while the modal is closed); it lives with the preview
  // state rather than on AppShell. Its inputs (`effectiveSettings`, the
  // bucket-canonical `data.settings.language`) are already host props.
  const {
    settingsOpen,
    setSettingsOpen,
    settingsInitialTab,
    setSettingsInitialTab,
    previewSettings,
    setPreviewSettings,
  } = useSettingsModal();
  useAppearanceProjection({
    appearanceSettings: previewSettings ?? effectiveSettings,
    language: data.settings.language,
  });
  useRegisterModalHandlers({
    openActionHistory: () => setActionHistoryOpen(true),
    openAchievementsList: () => setAchievementsListOpen(true),
    openAchievementsUnlock: () => setAchievementsModalOpen(true),
    openChangelog: () => setChangelogManualOpen(true),
    openSyncDetails: () => setSyncDetailsOpen(true),
    openSettings: () => setSettingsOpen(true),
  });
  const {
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
  } = storageState;
  const {
    backend,
    adapter,
    encryption,
    cloudOfflineMode,
    dropboxConnected,
    gdriveConnected,
    folderConnected,
    folderAvailable,
    folderReconnectNeeded,
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
  } = storage;
  const { getEncryptionPassword, onDeleteAccount } = auth;
  const {
    sheetModal,
    setSheetModal,
    deleteSheetPrompt,
    setDeleteSheetPrompt,
    deleteSheetActions,
    onSaveSheet,
    onDeleteSheet,
  } = sheetMetaDialog;
  const { downloadPrompt, onCloseDownload, onConfirmDownload } = downloadFlow;
  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    searchSort,
    setSearchSort,
    searchFilter,
    setSearchFilter,
    searchIndex,
    setScrollToRowRequest,
  } = searchModal;
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
    onCreateTag,
    onUpdateTag,
    onDeleteTag,
  } = taxonomyCrud;
  const { onEditMatchRule, onMoveMatchRule, onReapplyMatchRules } = matchRuleUi;

  return (
    <>
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
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
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
      <BudgetTransferSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        sort={searchSort}
        onSortChange={setSearchSort}
        filter={searchFilter}
        onFilterChange={setSearchFilter}
        index={searchIndex}
        settings={effectiveSettings}
        selectMode={searchBulk.selectMode}
        selectedIds={searchBulk.selectedIds}
        activeSheetId={searchBulk.activeSheetId}
        onToggleSelectMode={searchBulk.onToggleSelectMode}
        onToggleSelect={searchBulk.onToggleSelect}
        onSelectMany={searchBulk.onSelectMany}
        onSelectSheet={searchBulk.onSelectSheet}
        onBulkEdit={searchBulk.onBulkEdit}
        onBulkMove={searchBulk.onBulkMove}
        onBulkCopy={searchBulk.onBulkCopy}
        onBulkDelete={searchBulk.onBulkDelete}
        onBulkCancel={searchBulk.onBulkCancel}
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
    </>
  );
}
