import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hash,
  HardDrive,
  Heart,
  Layers,
  type LucideIcon,
  Menu,
  Settings as SettingsIcon,
  Sliders,
  Tag,
} from "lucide-react";

import { DEFAULT_SETTINGS, NUMBER_FORMATS } from "../../data/constants";
import type {
  Category,
  DecimalSeparator,
  EntryType,
  Settings,
  UserData,
} from "../../data/types";
import { useEscapeKey, usePointerOutside } from "../../hooks";
import type { StorageAdapter } from "../../storage/adapter";
import type {
  BackendId,
  EncryptionMode,
} from "../../storage/backend-preference";
import { CloudBackupModal } from "../CloudBackupModal";
import { Modal } from "../Modal";
import {
  CategoriesTab,
  FormatTab,
  GeneralTab,
  MemoryTab,
  StorageTab,
  TypesTab,
} from "./tabs";

type Props = {
  open: boolean;
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
  // True when the active user is the no-password "guest" account.
  // Disables the encryption toggle (there's no key to derive without
  // a password) and tweaks the help text to point at "Create account".
  isGuest: boolean;
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
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => void;
  onDisconnectGdrive: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
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
};

type TabId =
  | "general"
  | "format"
  | "storage"
  | "categories"
  | "types"
  | "memory";

type TabDef = {
  id: TabId;
  label: string;
  // Lucide icon — rendered both as the sidebar marker on desktop and
  // inside the burger-menu items on mobile, so the same icon hints at
  // the section's contents regardless of layout.
  icon: LucideIcon;
};

const TAB_DEFS: TabDef[] = [
  { id: "general", label: "General", icon: Sliders },
  { id: "format", label: "Format", icon: Hash },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "categories", label: "Categories", icon: Tag },
  { id: "types", label: "Types", icon: Layers },
  { id: "memory", label: "Memory", icon: SettingsIcon },
];

export function SettingsModal({
  open,
  settings,
  backend,
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  folderAvailable,
  folderReconnectNeeded,
  encryption,
  isGuest,
  merchantHintCount,
  recurringDismissalCount,
  transferDismissalCount,
  data,
  onImport,
  adapter,
  getEncryptionPassword,
  onClose,
  onSave,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onSelectBrowser,
  onSetEncryption,
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
}: Props) {
  // Local draft so cancelling discards localization changes. Re-syncs
  // each time the modal opens with whatever the store holds.
  const [draft, setDraft] = useState<Settings>(settings);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("general");

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setActiveTab("general");
  }, [open, settings]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyNumberFormat(id: string) {
    const preset = NUMBER_FORMATS.find((f) => f.id === id);
    if (!preset) return;
    setDraft((prev) => ({
      ...prev,
      thousandsSeparator: preset.thousands,
      decimalSeparator: preset.decimal,
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
    >
      <Modal.Header title="Settings" onClose={onClose} />
      {/* Custom body: skip Modal.Body so we can host a row-flex
          sidebar+content split that owns its own per-column overflow,
          instead of inheriting the body's single vertical scroll. */}
      <div className="flex flex-1 overflow-hidden">
        <TabSidebar activeTab={activeTab} onSelect={setActiveTab} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TabBurger activeTab={activeTab} onSelect={setActiveTab} />
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4">
            {activeTab === "general" && (
              <GeneralTab draft={draft} onUpdate={update} />
            )}
            {activeTab === "format" && (
              <FormatTab
                draft={draft}
                onUpdate={update}
                onApplyNumberFormat={applyNumberFormat}
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
                data={data}
                onImport={onImport}
                backupsSupported={Boolean(adapter?.backups)}
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
              />
            )}
            {activeTab === "categories" && (
              <CategoriesTab
                data={data}
                onCreateCategory={onCreateCategory}
                onUpdateCategory={onUpdateCategory}
                onDeleteCategory={onDeleteCategory}
                onSetPresetCategoryHidden={onSetPresetCategoryHidden}
              />
            )}
            {activeTab === "types" && (
              <TypesTab
                data={data}
                onCreateType={onCreateType}
                onUpdateType={onUpdateType}
                onDeleteType={onDeleteType}
                onSetPresetTypeHidden={onSetPresetTypeHidden}
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
          </div>
        </div>
      </div>
      {adapter?.backups && (
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
// below `sm`).
function TabSidebar({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="hidden w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-surface-3 p-2 sm:flex"
    >
      {TAB_DEFS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-left text-sm ${
              isActive
                ? "border-accent bg-accent/10 text-accent"
                : "border-transparent text-fg hover:border-line hover:bg-surface-2"
            }`}
          >
            <Icon size={14} aria-hidden />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Mobile-only burger trigger that opens a popover listing the same
// tabs. Lives directly above the scrolling tab content so the active
// section name is always visible at the top of the panel.
function TabBurger({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (id: TabId) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEscapeKey(open, close);
  usePointerOutside(open, [rootRef], close);

  const current = TAB_DEFS.find((t) => t.id === activeTab) ?? TAB_DEFS[0];
  const CurrentIcon = current.icon;

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 border-b border-line bg-surface-3 sm:hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choose settings section"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm text-fg hover:bg-surface-2"
      >
        <Menu size={16} aria-hidden className="text-muted" />
        <CurrentIcon size={14} aria-hidden />
        <span className="font-bold text-fg-bright">{current.label}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute inset-x-0 top-full z-30 flex flex-col gap-0.5 border-b border-line bg-surface-3 p-2 shadow-lg"
        >
          {TAB_DEFS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSelect(tab.id);
                  setOpen(false);
                }}
                aria-current={isActive ? "page" : undefined}
                className={`flex w-full cursor-pointer items-center gap-2 rounded border px-2 py-2 text-left text-sm ${
                  isActive
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-transparent text-fg hover:border-line hover:bg-surface-2"
                }`}
              >
                <Icon size={14} aria-hidden />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Footer is custom (not Modal.Footer) so links + donate sit pinned
// below the tab content on every tab — instead of trailing the
// scroll inside one section the user might never visit.
function SettingsFooter({
  onReset,
  onCancel,
  onSave,
}: {
  onReset: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <footer
      className="flex shrink-0 flex-col gap-3 border-t border-line bg-surface-3 px-4 pt-3"
      style={{
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
          >
            Save
          </button>
        </div>
      </div>
      {/* Opens in a new tab so an in-flight settings edit isn't lost
          when the user navigates away to read these. The schema page
          exposes the JSON Schema for the exported data so an LLM (or
          any other tool) handed a `budget-*.json` file can be pointed
          at a stable URL describing its shape. The changelog page is
          a chronological list of release notes — newest first — that
          mirrors the "What's new" popup that auto-opens after an
          upgrade. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-xs text-muted">
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-link hover:underline"
        >
          Privacy policy
        </a>
        <span aria-hidden>·</span>
        <a
          href="/schema"
          target="_blank"
          rel="noreferrer"
          className="text-link hover:underline"
        >
          Data schema
        </a>
        <span aria-hidden>·</span>
        <a
          href="/changelog"
          target="_blank"
          rel="noreferrer"
          className="text-link hover:underline"
        >
          Changelog
        </a>
        <DonateLink />
      </div>
    </footer>
  );
}

// URL is injected at build time from the `VITE_DONATE_URL` GitHub
// Actions secret (see `.github/workflows/pages.yml`). When the secret
// isn't set — e.g. on a fork that hasn't configured its own donate
// page — the button hides entirely so the footer doesn't trail a
// dead link. The heart is rendered in PayPal-agnostic "danger red"
// so the button reads as warm regardless of which donate target the
// maintainer points it at.
function DonateLink() {
  const url = import.meta.env.VITE_DONATE_URL?.trim();
  if (!url) return null;
  return (
    <>
      <span aria-hidden>·</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-link hover:underline"
      >
        <Heart
          size={12}
          className="text-danger"
          fill="currentColor"
          aria-hidden
        />
        Donate
      </a>
    </>
  );
}
