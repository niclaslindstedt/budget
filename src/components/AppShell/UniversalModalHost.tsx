import { useState } from "react";

import { itemSubtypes } from "../../data/items/subtypes";
import {
  allCategories,
  allCompanyCategories,
  allTypes,
} from "../../data/presets/merge";
import { AchievementUnlockModal } from "../AchievementUnlockModal";
import { AchievementsModal } from "../AchievementsModal";
import { ActionHistoryModal } from "../ActionHistoryModal";
import { BudgetTransferSearchModal } from "../budget/BudgetTransferSearchModal";
import { ChangelogModal } from "../ChangelogModal";
import { CompanyEditorModal } from "../CompanyEditorModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { ItemEditorModal } from "../ItemEditorModal";
import { ItemFinderModal } from "../items/ItemFinderModal";
import { UpdateItemValueModal } from "../items/UpdateItemValueModal";
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
import { newId } from "../../data/sheet";
import type { Action } from "../../data/reducer";
import type {
  AccountBudget,
  SalaryView,
  ScenariosView,
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
    onBulkCover: () => void;
    bulkHideMutations: boolean;
    bulkCoverAvailable: boolean;
  };
  taxonomyCrud: ReturnType<typeof useTaxonomyCrud>;
  matchRuleUi: Pick<
    ReturnType<typeof useMatchRuleUi>,
    "onEditMatchRule" | "onMoveMatchRule" | "onReapplyMatchRules"
  >;
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
  onClearDuplicateIgnores: () => void;
  onClearIgnoredItemEntries: () => void;
  onClearItemFindExclusions: () => void;
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
    onClearDuplicateIgnores,
    onClearIgnoredItemEntries,
    onClearItemFindExclusions,
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
  // Company editor opened from a budget row's company pill (long-press /
  // right-click). Holds the id of the company under edit; the modal
  // resolves it against the live `data.companies` so a concurrent rename
  // never edits a stale snapshot.
  const [editCompanyId, setEditCompanyId] = useState<string | null>(null);
  // Item editor opened from a budget row's line-item pill (single-item
  // long-press) or by clicking a line item in the description popover.
  // Holds the id of the item under edit; the modal resolves it against
  // the live `data.items` so a concurrent change never edits a stale
  // snapshot.
  const [editItemId, setEditItemId] = useState<string | null>(null);
  // Item editor opened in create mode from the Items sheet's "+ add
  // item" button. Distinct from `editItemId` so the two flows don't
  // alias each other — create has no id to resolve.
  const [creatingItem, setCreatingItem] = useState(false);
  // "Update value" modal opened from an item row's "…" menu. Holds the id
  // of the item whose value is being recorded; the modal resolves it
  // against live `data.items` so a concurrent change isn't recorded stale.
  const [updateValueItemId, setUpdateValueItemId] = useState<string | null>(
    null,
  );
  // "Find items" modal opened from the Items sheet title "…" menu. Scans
  // bank history for likely item purchases and walks the user through
  // cataloguing them.
  const [findItemsOpen, setFindItemsOpen] = useState(false);
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
    editCompany: (companyId: string) => setEditCompanyId(companyId),
    editItem: (itemId: string) => setEditItemId(itemId),
    createItem: () => setCreatingItem(true),
    updateItemValue: (itemId: string) => setUpdateValueItemId(itemId),
    findItems: () => setFindItemsOpen(true),
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
    onCreateCompanyCategory,
    onUpdateCompanyCategory,
    onDeleteCompanyCategory,
    onSetPresetCompanyCategoryHidden,
    onCreateTag,
    onUpdateTag,
    onDeleteTag,
    onCreateSubtype,
    onUpdateSubtype,
    onDeleteSubtype,
    onCreateFileCategory,
    onUpdateFileCategory,
    onDeleteFileCategory,
    onCreateItem,
  } = taxonomyCrud;
  const { onEditMatchRule, onMoveMatchRule, onReapplyMatchRules } = matchRuleUi;

  // Item resolved against live data so a concurrent change isn't edited
  // stale, plus the count of line-item links pointing at it (across budget
  // rows and bank history) shown as a hint in the editor — the price lives
  // on the item itself, so the useful context is how many transactions link
  // to it. The traversal mirrors the cascade in the `deleteItem` reducer.
  const editItem =
    editItemId !== null
      ? (data.items.find((it) => it.id === editItemId) ?? null)
      : null;
  let editItemLinkCount = 0;
  if (editItemId !== null) {
    for (const sheet of data.sheets) {
      for (const sheetItem of sheet.items) {
        if (sheetItem.type !== "accountBudget") continue;
        for (const row of sheetItem.rows) {
          for (const link of row.lineItems ?? []) {
            if (link.itemId === editItemId) editItemLinkCount += 1;
          }
        }
      }
    }
    for (const entries of Object.values(data.history)) {
      for (const entry of entries) {
        for (const link of entry.lineItems ?? []) {
          if (link.itemId === editItemId) editItemLinkCount += 1;
        }
      }
    }
  }

  return (
    <>
      <SheetModal
        open={sheetModal !== null}
        sheet={sheetModal?.sheet ?? null}
        currentAccountId={
          sheetModal?.sheet
            ? (sheetModal.sheet.items.find(
                (it): it is AccountBudget | SalaryView =>
                  it.type === "accountBudget" || it.type === "salaryView",
              )?.accountId ?? null)
            : null
        }
        currentTaxProfileId={
          sheetModal?.sheet
            ? (sheetModal.sheet.items.find(
                (it): it is SalaryView => it.type === "salaryView",
              )?.taxProfileId ?? null)
            : null
        }
        taxProfiles={data.taxProfiles}
        onCreateTaxProfile={(profile) =>
          dispatch({ type: "createTaxProfile", profile })
        }
        currentBaseSheetId={
          sheetModal?.sheet
            ? (sheetModal.sheet.items.find(
                (it): it is ScenariosView => it.type === "scenariosView",
              )?.baseSheetId ?? null)
            : null
        }
        budgetSheets={data.sheets
          .filter((s) => s.type === "budget")
          .map((s) => ({ id: s.id, name: s.name }))}
        baseChangeHasDeltas={
          sheetModal?.sheet?.items.some(
            (it) =>
              it.type === "scenariosView" &&
              it.scenarios.some(
                (s) => s.overrides.length > 0 || s.addedRows.length > 0,
              ),
          ) ?? false
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
        duplicateIgnoreCount={data.duplicateIgnores.length}
        ignoredItemEntryCount={data.ignoredItemEntryIds.length}
        itemFindExclusionCount={data.itemFindExclusionPatterns.length}
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
        onClearDuplicateIgnores={onClearDuplicateIgnores}
        onClearIgnoredItemEntries={onClearIgnoredItemEntries}
        onClearItemFindExclusions={onClearItemFindExclusions}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={onDeleteCategory}
        onSetPresetCategoryHidden={onSetPresetCategoryHidden}
        onCreateType={onCreateType}
        onUpdateType={onUpdateType}
        onDeleteType={onDeleteType}
        onSetPresetTypeHidden={onSetPresetTypeHidden}
        onSetPresetTypeKind={onSetPresetTypeKind}
        onUpdateSubtype={onUpdateSubtype}
        onDeleteSubtype={onDeleteSubtype}
        onCreateFileCategory={onCreateFileCategory}
        onUpdateFileCategory={onUpdateFileCategory}
        onDeleteFileCategory={onDeleteFileCategory}
        onCreateCompany={onCreateCompany}
        onUpdateCompany={onUpdateCompany}
        onDeleteCompany={onDeleteCompany}
        onCreateCompanyCategory={onCreateCompanyCategory}
        onUpdateCompanyCategory={onUpdateCompanyCategory}
        onDeleteCompanyCategory={onDeleteCompanyCategory}
        onSetPresetCompanyCategoryHidden={onSetPresetCompanyCategoryHidden}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
        onEditMatchRule={onEditMatchRule}
        onMoveMatchRule={onMoveMatchRule}
        onReapplyMatchRules={onReapplyMatchRules}
        onDeleteAccount={onDeleteAccount}
        onReorderSheets={(fromId, toId) =>
          dispatch({ type: "reorderSheets", fromId, toId })
        }
      />
      <CompanyEditorModal
        open={editCompanyId !== null}
        company={
          editCompanyId !== null
            ? (data.companies.find((c) => c.id === editCompanyId) ?? null)
            : null
        }
        companies={data.companies}
        types={allTypes(data)}
        categories={allCategories(data)}
        companyCategories={allCompanyCategories(data)}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompanyCategory={onCreateCompanyCategory}
        onSubmit={onUpdateCompany}
        onClose={() => setEditCompanyId(null)}
      />
      <ItemEditorModal
        open={editItemId !== null || creatingItem}
        item={editItem}
        creating={creatingItem}
        subtypes={itemSubtypes(data.subtypes)}
        types={allTypes(data)}
        categories={allCategories(data)}
        settings={effectiveSettings}
        linkedCount={editItemLinkCount}
        onCreateSubtype={onCreateSubtype}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onSubmit={(itemId, patch) => {
          dispatch({ type: "updateItem", itemId, patch });
          setEditItemId(null);
        }}
        onCreate={(draft) => {
          dispatch({ type: "addItem", item: { id: newId(), ...draft } });
          setCreatingItem(false);
        }}
        onClose={() => {
          setEditItemId(null);
          setCreatingItem(false);
        }}
      />
      <ItemFinderModal
        open={findItemsOpen}
        data={data}
        settings={effectiveSettings}
        onClose={() => setFindItemsOpen(false)}
        onIgnore={(entryId) => dispatch({ type: "ignoreItemEntry", entryId })}
        onExcludeSimilar={(description) =>
          dispatch({ type: "excludeSimilarItemEntries", description })
        }
        onLinkLineItems={(accountId, entryId, lineItems, itemPrices) => {
          // The typed amount is the item's purchase price — write it onto
          // the item (the link no longer carries a price).
          for (const { itemId: linkedItemId, purchasePrice } of itemPrices) {
            dispatch({
              type: "updateItem",
              itemId: linkedItemId,
              patch: { purchasePrice },
            });
          }
          dispatch({
            type: "linkLineItemsToHistoryEntry",
            accountId,
            entryId,
            lineItems,
          });
        }}
        onCreateItem={onCreateItem}
        onCreateSubtype={onCreateSubtype}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <UpdateItemValueModal
        open={updateValueItemId !== null}
        item={
          updateValueItemId !== null
            ? (data.items.find((it) => it.id === updateValueItemId) ?? null)
            : null
        }
        settings={effectiveSettings}
        onClose={() => setUpdateValueItemId(null)}
        onAddValue={(itemId, point) =>
          dispatch({ type: "addItemValue", itemId, point })
        }
        onImportValues={(itemId, points) =>
          dispatch({ type: "importItemValues", itemId, points })
        }
        onDeleteValue={(itemId, pointId) =>
          dispatch({ type: "deleteItemValue", itemId, pointId })
        }
      />
      <ChangelogModal
        open={changelogOpen}
        onClose={onCloseChangelog}
        since={changelogSince}
        onOpenFeatureDoc={() => unlockAchievement("bookworm")}
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
        onBulkCover={searchBulk.onBulkCover}
        bulkHideMutations={searchBulk.bulkHideMutations}
        bulkCoverAvailable={searchBulk.bulkCoverAvailable}
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
