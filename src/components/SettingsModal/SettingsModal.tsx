import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LucideIcon,
  Menu,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

import { CURRENCY_PRESETS } from "../../data/constants/currency";
import { DEFAULT_SETTINGS } from "../../data/constants/defaults";
import { detectPaydayDayOfMonth } from "../../data/budget/payday";
import type {
  Category,
  Company,
  CompanyCategory,
  DecimalSeparator,
  EntryType,
  Settings,
  Tag,
  UserData,
} from "../../data/types";
import { useDevMode, type FloatingPlacement } from "../../hooks";
import { useT, type TFunction } from "../../i18n";
import type { StorageAdapter } from "../../storage/adapter";
import type {
  BackendId,
  EncryptionMode,
} from "../../storage/backend-preference";
import { CloudBackupModal } from "../CloudBackupModal";
import { FloatingPanel } from "../FloatingPanel";
import { Button } from "../form";
import { Modal } from "../Modal";
import {
  AppearanceTab,
  CategoriesTab,
  CompaniesTab,
  DeveloperTab,
  FormatTab,
  GeneralTab,
  LogsTab,
  MemoryTab,
  PatternsTab,
  SearchTab,
  TagsTab,
  type SettingsTabId,
  StorageTab,
  TAB_REGISTRY,
} from "./tabs";

export type { SettingsTabId };

// Derives the picker's initial selection from the persisted format
// settings. Currencies that render identically are collapsed into a
// single preset (e.g. the kronor preset covers SEK/NOK/DKK/ISK,
// the dollar preset covers USD/CAD), so the (symbol, position,
// space) triplet uniquely identifies a preset. The "Custom…" entry
// is the only fallback — anything that doesn't match a preset
// triplet reveals the free-form inputs.
function presetIdForCurrency(settings: Settings): string {
  const match = CURRENCY_PRESETS.find(
    (p) =>
      p.symbol === settings.currency &&
      p.position === settings.currencyPosition &&
      p.space === settings.currencySpace,
  );
  return match ? match.id : "custom";
}

type Props = {
  open: boolean;
  // Tab to land on when the modal opens. Defaults to "general". Set
  // when the modal is launched from a context that maps to a specific
  // section (e.g. the storage-size warning routes to "storage").
  initialTab?: SettingsTabId;
  settings: Settings;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  // Whether the per-user folder handle is live in IndexedDB and the
  // OS-level permission is still granted. False either when the user
  // has never connected a folder, or when permission needs re-granting
  // — `folderReconnectNeeded` distinguishes those.
  folderConnected: boolean;
  // Feature-detection result from `isFolderBackendAvailable()`. False
  // on Firefox / Safari etc.; the picker shows the option as disabled
  // with an explainer.
  folderAvailable: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  // Per-user opt-in: when true, cloud backends keep a copy of the
  // latest cloud bytes in this browser's storage so the session can
  // boot and accept edits even when the cloud is unreachable.
  // Surfaced as a checkbox next to the cloud connection because it
  // only matters once a cloud backend is selected.
  cloudOfflineMode: boolean;
  // True when the active user is the no-password "guest" account.
  // Disables the encryption toggle (there's no key to derive without
  // a password) and tweaks the help text to point at "Create account".
  isGuest: boolean;
  // Username of the active account. Surfaced in the danger-zone
  // confirmation text on the Storage tab so the user can see which
  // account they're about to delete.
  username: string;
  // Sizes of the merchant-hint memory and the two dismissal
  // allowlists. Surfaced in the "Memory" tab so the user can see what's
  // accumulated and clear it. Zero counts collapse the sections to a
  // single hint line.
  merchantHintCount: number;
  recurringDismissalCount: number;
  transferDismissalCount: number;
  // Pass-through for the embedded Import / Export controls — they
  // used to live next to the Save button in the header, now they sit
  // inside Storage so the connection and the data-movement actions
  // are colocated.
  data: UserData;
  onImport: (data: UserData) => void;
  // Active storage adapter. The Backups sub-modal reads its
  // `backups` ops directly so the bytes-on-disk go through the same
  // encryption envelope the live file uses.
  adapter: StorageAdapter | null;
  getEncryptionPassword: () => string | null;
  onClose: () => void;
  onSave: (next: Settings) => void;
  // Live preview of the Appearance draft while the modal is open: the
  // parent uses the most-recent value to project theme / font / shape
  // / motion onto `<html>` so the user can see their pick applied
  // before saving. `null` signals "no preview active — fall back to
  // persisted settings", which restores the original look on cancel.
  onPreviewAppearance: (preview: Settings | null) => void;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => Promise<void>;
  onDisconnectGdrive: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
  onSetCloudOfflineMode: (on: boolean) => void;
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
  // Category / type admin. The list of presets lives in code
  // (`PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES`); the per-user
  // hide-toggles travel through `data.hiddenPresetCategoryIds` and
  // `data.hiddenPresetTypeIds`. User-added entries on `data.categories`
  // and `data.types` accept full edit/delete; presets are hide-only.
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdateCategory: (
    categoryId: string,
    patch: Partial<Omit<Category, "id">>,
  ) => void;
  onDeleteCategory: (categoryId: string) => void;
  onSetPresetCategoryHidden: (presetId: string, hidden: boolean) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdateType: (typeId: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDeleteType: (typeId: string) => void;
  onSetPresetTypeHidden: (presetId: string, hidden: boolean) => void;
  onSetPresetTypeKind: (
    presetId: string,
    kind: "income" | "expense" | "any",
  ) => void;
  // Company admin — full edit/delete on user-curated entries; no
  // presets ship so there's no hide-toggle.
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onUpdateCompany: (
    companyId: string,
    patch: Partial<Omit<Company, "id">>,
  ) => void;
  onDeleteCompany: (companyId: string) => void;
  // Company-category admin — preset + user-curated; presets are
  // hide-only, user entries get full edit/delete.
  onCreateCompanyCategory: (
    draft: Omit<CompanyCategory, "id">,
  ) => CompanyCategory;
  onUpdateCompanyCategory: (
    id: string,
    patch: Partial<Omit<CompanyCategory, "id">>,
  ) => void;
  onDeleteCompanyCategory: (id: string) => void;
  onSetPresetCompanyCategoryHidden: (presetId: string, hidden: boolean) => void;
  // Tag admin — full edit/delete on user-curated tags; no presets
  // ship so there's no hide-toggle.
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onUpdateTag: (tagId: string, patch: Partial<Omit<Tag, "id">>) => void;
  onDeleteTag: (tagId: string) => void;
  // Pattern management for the Patterns tab. Opens the existing
  // BudgetMatchRuleModal in edit mode. The modal's own danger button handles
  // deletion, so no separate delete callback is needed here.
  onEditMatchRule: (ruleId: string) => void;
  // Reorder a rule in `data.matchRules`. Earlier in the array = higher
  // priority, so the up button lifts a rule above the catch-alls that
  // currently shadow it; down demotes. Reducer no-ops at the ends.
  onMoveMatchRule: (ruleId: string, direction: "up" | "down") => void;
  // "Reapply all" button in the Patterns tab. Walks every budget row
  // against the current ruleset and shows a toast with the count of
  // rows that moved. Useful when the user wants to sweep without
  // editing a rule.
  onReapplyMatchRules: () => void;
  // Danger-zone callback for the Storage tab: deletes the active
  // account (or clears guest data when no password is set).
  onDeleteAccount: (password: string) => Promise<void>;
};

type TabId = SettingsTabId;

type TabDef = {
  id: TabId;
  label: string;
  // Lucide icon — rendered both as the sidebar marker on desktop and
  // inside the burger-menu items on mobile, so the same icon hints at
  // the section's contents regardless of layout.
  icon: LucideIcon;
};

const TAB_ICON_BY_ID = new Map(TAB_REGISTRY.map((e) => [e.id, e.icon]));

function useTabDefs(t: TFunction, tabIds: readonly TabId[]): TabDef[] {
  return tabIds.map((id) => ({
    id,
    label: t(`settings.tabs.${id}` as const),
    icon: TAB_ICON_BY_ID.get(id) as LucideIcon,
  }));
}

export function SettingsModal({
  open,
  initialTab,
  settings,
  backend,
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  folderAvailable,
  folderReconnectNeeded,
  encryption,
  cloudOfflineMode,
  isGuest,
  username,
  merchantHintCount,
  recurringDismissalCount,
  transferDismissalCount,
  data,
  onImport,
  adapter,
  getEncryptionPassword,
  onClose,
  onSave,
  onPreviewAppearance,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onSelectBrowser,
  onSetEncryption,
  onSetCloudOfflineMode,
  onClearMerchantHints,
  onClearRecurringDismissals,
  onClearTransferDismissals,
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
  onEditMatchRule,
  onMoveMatchRule,
  onReapplyMatchRules,
  onDeleteAccount,
}: Props) {
  // Local draft so cancelling discards localization changes. Re-syncs
  // each time the modal opens with whatever the store holds.
  const [draft, setDraft] = useState<Settings>(settings);
  // The user's currency-preset choice for this editing session. The
  // persisted shape only stores the resulting (symbol, position,
  // space) triplet, so tracking the id locally lets "Custom…" stay
  // selected after the user edits the free-form inputs (otherwise
  // hitting a triplet that matches a preset would snap the picker
  // back to that preset).
  const [currencyPresetId, setCurrencyPresetId] = useState<string>(() =>
    presetIdForCurrency(settings),
  );
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  // Device-local developer flags drive whether the Developer and Logs
  // tabs appear at all. Read directly here so the modal re-renders
  // when the user toggles either flag inside its own UI.
  const { devMode, captureLogs } = useDevMode();
  const tabIds = useMemo<readonly TabId[]>(
    () =>
      TAB_REGISTRY.filter(
        (entry) => !entry.visible || entry.visible({ devMode, captureLogs }),
      ).map((entry) => entry.id),
    [devMode, captureLogs],
  );
  // Fall back to General if the active tab disappears under us — e.g.
  // the user turns off Capture logs while sitting on the Logs tab.
  useEffect(() => {
    if (!tabIds.includes(activeTab)) setActiveTab("general");
  }, [tabIds, activeTab]);
  // Auto-detected payday day-of-month from the user's salary
  // postings. Null when no confident pick is available (no series,
  // no positive recurring rows, no history). Only used as a hint —
  // never auto-applied.
  const detectedPayday = useMemo<number | null>(() => {
    const detected = detectPaydayDayOfMonth(data, settings.startOfMonth);
    return detected === settings.startOfMonth ? null : detected;
  }, [data, settings.startOfMonth]);

  useEffect(() => {
    if (open) return;
    setDraft(settings);
    setCurrencyPresetId(presetIdForCurrency(settings));
    // Re-sync the draft while the modal is closed so the next open
    // starts from the latest persisted settings — including after a
    // cancel, where the in-state draft still carries the cancelled
    // edits and would otherwise flash through the Appearance preview
    // for one frame on reopen.
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab ?? "general");
    // Reset to the requested initial tab (or General) only when the
    // modal transitions from closed to open. Depending on `initialTab`
    // would override the user's tab switch mid-session if the prop
    // happened to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Push the live Appearance draft up to the parent while the modal is
  // open so the running app reflects the user's pick before they save.
  // Clears back to null whenever the modal is closed — that's also how
  // Cancel reverts: the parent stops overriding, the persisted
  // settings reassert, and the DOM snaps back to the original look
  // without the modal having to remember it.
  useEffect(() => {
    onPreviewAppearance(open ? draft : null);
  }, [open, draft, onPreviewAppearance]);
  // Belt-and-braces clear on unmount — covers the auth-screen flip
  // and any other path that tears the modal down without first
  // closing it.
  useEffect(() => {
    return () => {
      onPreviewAppearance(null);
    };
  }, [onPreviewAppearance]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyCurrencyPreset(id: string) {
    // Record the user's pick so the trigger reflects what they
    // tapped — in particular, "Custom…" stays selected after the
    // user edits the free-form inputs to a value that happens to
    // match a preset's display triplet.
    setCurrencyPresetId(id);
    // "custom" reveals the free-form inputs without touching the
    // existing values — the user keeps whatever symbol / position /
    // space they had so the picker switch isn't destructive.
    if (id === "custom") return;
    const preset = CURRENCY_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      currency: preset.symbol,
      currencyPosition: preset.position,
      currencySpace: preset.space,
    }));
  }

  function applyDecimal(d: DecimalSeparator) {
    setDraft((prev) => ({
      ...prev,
      decimalSeparator: d,
      // Keep the thousands separator out of conflict with the decimal.
      thousandsSeparator:
        prev.thousandsSeparator === d ? "" : prev.thousandsSeparator,
    }));
  }

  function handleSave() {
    onSave(draft);
    onClose();
  }

  function handleReset() {
    setDraft({ ...DEFAULT_SETTINGS });
    setCurrencyPresetId(presetIdForCurrency(DEFAULT_SETTINGS));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="settings-title"
      // Wider than the default `max-w-lg` so the desktop sidebar +
      // content split has room to breathe without forcing tab content
      // into a narrow column.
      size="max-w-3xl"
      // Fill the full viewport height on every viewport size so all
      // tabs get the same generous content area — the tallest tabs
      // (Storage, Categories) otherwise pushed their footer off the
      // visible card at 95svh. Also pins the height so swapping tabs
      // doesn't make the modal jump around as content shrinks/grows.
      fixedHeight
    >
      <SettingsHeader
        activeTab={activeTab}
        tabIds={tabIds}
        onSelectTab={setActiveTab}
        onClose={onClose}
      />
      {/* Custom body: skip Modal.Body so we can host a row-flex
          sidebar+content split that owns its own per-column overflow,
          instead of inheriting the body's single vertical scroll. */}
      <div className="flex flex-1 overflow-hidden">
        <TabSidebar
          activeTab={activeTab}
          tabIds={tabIds}
          onSelect={setActiveTab}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div
            role="tabpanel"
            id={`settings-tabpanel-${activeTab}`}
            aria-labelledby={`settings-tab-${activeTab}`}
            tabIndex={0}
            className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 sm:px-4 sm:py-4"
          >
            {activeTab === "general" && (
              <GeneralTab
                draft={draft}
                onUpdate={update}
                detectedPayday={detectedPayday}
                sheets={data.sheets}
              />
            )}
            {activeTab === "search" && (
              <SearchTab draft={draft} onUpdate={update} />
            )}
            {activeTab === "appearance" && (
              <AppearanceTab draft={draft} onUpdate={update} />
            )}
            {activeTab === "format" && (
              <FormatTab
                draft={draft}
                currencyPresetId={currencyPresetId}
                onUpdate={update}
                onApplyCurrencyPreset={applyCurrencyPreset}
                onApplyDecimal={applyDecimal}
              />
            )}
            {activeTab === "storage" && (
              <StorageTab
                draft={draft}
                backend={backend}
                dropboxConnected={dropboxConnected}
                gdriveConnected={gdriveConnected}
                folderConnected={folderConnected}
                folderAvailable={folderAvailable}
                folderReconnectNeeded={folderReconnectNeeded}
                encryption={encryption}
                isGuest={isGuest}
                username={username}
                data={data}
                onImport={onImport}
                backupsSupported={adapter?.capabilities.has("backups") ?? false}
                onOpenBackups={() => setBackupsOpen(true)}
                getEncryptionPassword={getEncryptionPassword}
                onUpdate={update}
                onConnectDropbox={onConnectDropbox}
                onDisconnectDropbox={onDisconnectDropbox}
                onConnectGdrive={onConnectGdrive}
                onDisconnectGdrive={onDisconnectGdrive}
                onConnectFolder={onConnectFolder}
                onReconnectFolder={onReconnectFolder}
                onDisconnectFolder={onDisconnectFolder}
                onSelectBrowser={onSelectBrowser}
                onSetEncryption={onSetEncryption}
                cloudOfflineMode={cloudOfflineMode}
                onSetCloudOfflineMode={onSetCloudOfflineMode}
                onDeleteAccount={onDeleteAccount}
              />
            )}
            {activeTab === "categories" && (
              <CategoriesTab
                data={data}
                onCreateCategory={onCreateCategory}
                onUpdateCategory={onUpdateCategory}
                onDeleteCategory={onDeleteCategory}
                onSetPresetCategoryHidden={onSetPresetCategoryHidden}
                onCreateType={onCreateType}
                onUpdateType={onUpdateType}
                onDeleteType={onDeleteType}
                onSetPresetTypeHidden={onSetPresetTypeHidden}
                onSetPresetTypeKind={onSetPresetTypeKind}
              />
            )}
            {activeTab === "companies" && (
              <CompaniesTab
                data={data}
                onCreateCompany={onCreateCompany}
                onUpdateCompany={onUpdateCompany}
                onDeleteCompany={onDeleteCompany}
                onCreateType={onCreateType}
                onCreateCategory={onCreateCategory}
                onCreateCompanyCategory={onCreateCompanyCategory}
                onUpdateCompanyCategory={onUpdateCompanyCategory}
                onDeleteCompanyCategory={onDeleteCompanyCategory}
                onSetPresetCompanyCategoryHidden={
                  onSetPresetCompanyCategoryHidden
                }
              />
            )}
            {activeTab === "tags" && (
              <TagsTab
                data={data}
                onCreateTag={onCreateTag}
                onUpdateTag={onUpdateTag}
                onDeleteTag={onDeleteTag}
              />
            )}
            {activeTab === "patterns" && (
              <PatternsTab
                data={data}
                settings={draft}
                onEditRule={onEditMatchRule}
                onMoveRule={onMoveMatchRule}
                onReapplyAll={onReapplyMatchRules}
              />
            )}
            {activeTab === "memory" && (
              <MemoryTab
                merchantHintCount={merchantHintCount}
                recurringDismissalCount={recurringDismissalCount}
                transferDismissalCount={transferDismissalCount}
                onClearMerchantHints={onClearMerchantHints}
                onClearRecurringDismissals={onClearRecurringDismissals}
                onClearTransferDismissals={onClearTransferDismissals}
              />
            )}
            {activeTab === "developer" && <DeveloperTab />}
            {activeTab === "logs" && <LogsTab />}
          </div>
        </div>
      </div>
      {adapter?.capabilities.has("backups") && (
        <CloudBackupModal
          open={backupsOpen}
          adapter={adapter}
          data={data}
          onRestore={(next) => {
            onImport(next);
            setBackupsOpen(false);
          }}
          onClose={() => setBackupsOpen(false)}
        />
      )}
      <SettingsFooter
        onReset={handleReset}
        onCancel={onClose}
        onSave={handleSave}
      />
    </Modal>
  );
}

// Desktop-only vertical tab strip on the left of the modal body. The
// burger menu picks up the same job on mobile (the sidebar is hidden
// below `sm`). Implemented as a WAI-ARIA tablist with roving tabindex
// and arrow-key navigation; activation follows focus (automatic mode)
// to match the mouse / touch behaviour.
function TabSidebar({
  activeTab,
  tabIds,
  onSelect,
}: {
  activeTab: TabId;
  tabIds: readonly TabId[];
  onSelect: (id: TabId) => void;
}) {
  const t = useT();
  const tabs = useTabDefs(t, tabIds);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowUp") next = idx - 1;
    else if (e.key === "ArrowDown") next = idx + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    const wrapped = (next + tabs.length) % tabs.length;
    const nextId = tabs[wrapped].id;
    onSelect(nextId);
    buttonRefs.current[nextId]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={t("settings.chooseSection")}
      className="hidden w-40 shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-contain border-r border-line bg-surface-3 p-2 sm:flex"
    >
      {tabs.map((tab, idx) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-controls={`settings-tabpanel-${tab.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2"
          >
            <Icon size={14} aria-hidden />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Left-anchored 12rem-wide tab list that opens just below the burger.
// Routed through `FloatingPanel` (instead of an inline `absolute` div)
// because this header lives inside the Modal's z-50 stacking context,
// which would otherwise cap the menu's z-index against the dismiss
// backdrop. The panel's portal lifts it back to document.body level.
const SETTINGS_TAB_MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 192 },
  anchor: "left",
  coordinateSpace: "viewport",
};

// Custom header so the mobile burger trigger can sit to the left of
// the "Settings" title instead of taking its own row below the
// header. The burger is hidden on `sm:` and up — the desktop sidebar
// already owns section selection there.
function SettingsHeader({
  activeTab,
  tabIds,
  onSelectTab,
  onClose,
}: {
  activeTab: TabId;
  tabIds: readonly TabId[];
  onSelectTab: (id: TabId) => void;
  onClose: () => void;
}) {
  const t = useT();
  const tabs = useTabDefs(t, tabIds);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMenuOpen(false), []);
  const activeTabDef = tabs.find((tab) => tab.id === activeTab);
  const ActiveTabIcon = activeTabDef?.icon ?? SettingsIcon;
  const activeTabLabel = activeTabDef?.label ?? t("settings.title");

  return (
    <header
      className="relative flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3"
      style={{
        paddingTop: `calc(0.75rem + env(safe-area-inset-top))`,
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* Mobile: the burger icon and the active tab label share a
            single click target that toggles the section menu. The h2
            below stays mounted (sr-only on mobile) so the dialog's
            aria-labelledby still resolves to a heading. */}
        <div ref={triggerRef} className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("settings.chooseSection")}
            className={`-ml-1 inline-flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm font-bold tracking-wide text-fg-bright ${
              menuOpen
                ? "border-accent bg-accent/15"
                : "border-transparent hover:border-line hover:bg-surface-2"
            }`}
          >
            <Menu
              size={18}
              aria-hidden
              focusable={false}
              className="text-muted"
            />
            <span className="inline-flex shrink-0 text-flag">
              <ActiveTabIcon size={14} aria-hidden focusable={false} />
            </span>
            <span className="min-w-0">{activeTabLabel}</span>
          </button>
          <FloatingPanel
            open={menuOpen}
            onClose={close}
            triggerRef={triggerRef}
            placement={SETTINGS_TAB_MENU_PLACEMENT}
          >
            <div role="menu" className="flex w-full flex-col gap-0.5 p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelectTab(tab.id);
                      setMenuOpen(false);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm text-fg hover:bg-surface"
                  >
                    <Icon size={14} aria-hidden />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </FloatingPanel>
        </div>
        <h2
          id="settings-title"
          className="text-sm font-bold tracking-wide text-fg-bright sr-only sm:not-sr-only"
        >
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex shrink-0 text-flag">
              <SettingsIcon size={14} aria-hidden focusable={false} />
            </span>
            <span className="min-w-0">{t("settings.title")}</span>
          </span>
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="-mr-1 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg sm:h-8 sm:w-8"
      >
        <X size={20} aria-hidden focusable={false} />
      </button>
    </header>
  );
}

// Footer is custom (not Modal.Footer) so the action buttons sit
// pinned below the tab content on every tab — instead of trailing the
// scroll inside one section the user might never visit. Privacy /
// changelog / donate links live in the top-right header menu now.
function SettingsFooter({
  onReset,
  onCancel,
  onSave,
}: {
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <footer
      className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 pt-3"
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <Button variant="secondary" onClick={onReset}>
        {t("common.resetToDefaults")}
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={onSave}>
          {t("common.save")}
        </Button>
      </div>
    </footer>
  );
}
