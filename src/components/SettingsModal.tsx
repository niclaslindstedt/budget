import { useEffect, useState } from "react";
import {
  Check,
  Database,
  Eye,
  EyeOff,
  Heart,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import {
  CATEGORY_COLORS,
  CATEGORY_GLYPH_NAMES,
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  FONT_SCALE_PRESETS,
  NUMBER_FORMATS,
  PRESET_CATEGORIES,
  PRESET_ENTRY_TYPES,
  SHORT_DATE_FORMATS,
  TYPE_GLYPH_NAMES,
  type NumberFormatPreset,
  SESSION_TIMEOUT_PRESETS,
} from "../data/constants";
import type {
  Category,
  CategoryIcon,
  DateFormat,
  DecimalSeparator,
  EntryType,
  Settings,
  ShortDateFormat,
  ThousandsSeparator,
  UserData,
} from "../data/types";
import type { StorageAdapter } from "../storage/adapter";
import type { BackendId, EncryptionMode } from "../storage/backend-preference";
import { withCurrency } from "../utils/format";
import { BackendPicker } from "./BackendPicker";
import { CategoryChip } from "./CategoryPicker";
import { CloudBackupModal } from "./CloudBackupModal";
import { ColorPalette } from "./ColorPalette";
import { ConfirmDialog } from "./ConfirmDialog";
import { Checkbox, SelectPicker } from "./form";
import { GlyphGrid } from "./GlyphGrid";
import { ImportExportControls } from "./ImportExportControls";
import { Modal } from "./Modal";
import { TypeChip } from "./TypePicker";

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
  // allowlists. Surfaced in the "Memory" section so the user can see
  // what's accumulated and clear it. Zero counts collapse the
  // sections to a single hint line.
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

type CloudId = "dropbox" | "gdrive";

type CloudCopy = {
  name: string;
  connectedHint: string;
  unconnectedHint: string;
};

function cloudCopy(id: CloudId): CloudCopy {
  if (id === "dropbox") {
    return {
      name: "Dropbox",
      connectedHint:
        "Synced to your Dropbox app folder on every change, or when you press Save.",
      unconnectedHint:
        "Authorize to keep your budget in your Dropbox app folder.",
    };
  }
  return {
    name: "Google Drive",
    connectedHint:
      "Synced to your Google Drive on every change, or when you press Save.",
    unconnectedHint: "Authorize to keep your budget in your Google Drive.",
  };
}

function presetIdFor(settings: Settings): string {
  const match = NUMBER_FORMATS.find(
    (f) =>
      f.thousands === settings.thousandsSeparator &&
      f.decimal === settings.decimalSeparator,
  );
  return match ? match.id : "custom";
}

function presetById(id: string): NumberFormatPreset | undefined {
  return NUMBER_FORMATS.find((f) => f.id === id);
}

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

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
  }, [open, settings]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyNumberFormat(id: string) {
    const preset = presetById(id);
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
    <Modal open={open} onClose={onClose} labelledBy="settings-title">
      <Modal.Header title="Settings" onClose={onClose} />
      <Modal.Body>
        <MainView
          draft={draft}
          backend={backend}
          dropboxConnected={dropboxConnected}
          gdriveConnected={gdriveConnected}
          folderConnected={folderConnected}
          folderAvailable={folderAvailable}
          folderReconnectNeeded={folderReconnectNeeded}
          encryption={encryption}
          isGuest={isGuest}
          merchantHintCount={merchantHintCount}
          recurringDismissalCount={recurringDismissalCount}
          transferDismissalCount={transferDismissalCount}
          data={data}
          onImport={onImport}
          backupsSupported={Boolean(adapter?.backups)}
          onOpenBackups={() => setBackupsOpen(true)}
          getEncryptionPassword={getEncryptionPassword}
          onUpdate={update}
          onApplyNumberFormat={applyNumberFormat}
          onApplyDecimal={applyDecimal}
          onConnectDropbox={onConnectDropbox}
          onDisconnectDropbox={onDisconnectDropbox}
          onConnectGdrive={onConnectGdrive}
          onDisconnectGdrive={onDisconnectGdrive}
          onConnectFolder={onConnectFolder}
          onReconnectFolder={onReconnectFolder}
          onDisconnectFolder={onDisconnectFolder}
          onSelectBrowser={onSelectBrowser}
          onSetEncryption={onSetEncryption}
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
        />
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
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <button
          type="button"
          onClick={handleReset}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
          >
            Save
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

function MainView({
  draft,
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
  backupsSupported,
  onOpenBackups,
  getEncryptionPassword,
  onUpdate,
  onApplyNumberFormat,
  onApplyDecimal,
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
}: {
  draft: Settings;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  folderAvailable: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  isGuest: boolean;
  merchantHintCount: number;
  recurringDismissalCount: number;
  transferDismissalCount: number;
  data: UserData;
  onImport: (data: UserData) => void;
  backupsSupported: boolean;
  onOpenBackups: () => void;
  getEncryptionPassword: () => string | null;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onApplyNumberFormat: (id: string) => void;
  onApplyDecimal: (d: DecimalSeparator) => void;
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
}) {
  const numberPreviewSample = 1234567.89;
  const datePreviewIso = "2026-05-16";

  return (
    <div className="flex flex-col">
      <Section title="Month">
        <Field label="Start of month">
          <div className="w-24">
            <SelectPicker
              value={draft.startOfMonth}
              options={Array.from({ length: 28 }, (_, i) => ({
                value: i + 1,
                label: i + 1,
              }))}
              onChange={(v) => onUpdate("startOfMonth", v)}
              ariaLabel="Start of month"
              triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
              panelClassName="font-mono tabular-nums"
            />
          </div>
          <p className="text-xs text-muted">
            Day each month is considered to begin. Default 25 matches a Swedish
            payday.
          </p>
        </Field>
      </Section>

      <Section title="Date">
        <Field label="Date format">
          <SelectPicker
            value={draft.dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => onUpdate("dateFormat", v as DateFormat)}
            ariaLabel="Date format"
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <Preview>
            {formatDatePreview(datePreviewIso, draft.dateFormat)}
          </Preview>
        </Field>

        <Field label="Short date format">
          <SelectPicker
            value={draft.shortDateFormat}
            options={SHORT_DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => onUpdate("shortDateFormat", v as ShortDateFormat)}
            ariaLabel="Short date format"
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <Preview>
            {formatShortDatePreview(datePreviewIso, draft.shortDateFormat)}
          </Preview>
          <p className="text-xs text-muted">
            Shown in the date column of each month table. Leading zeros are
            stripped, so 1 May renders as &quot;1/5&quot;.
          </p>
        </Field>
      </Section>

      <Section title="Currency">
        <Field label="Symbol">
          <input
            type="text"
            value={draft.currency}
            onChange={(e) => onUpdate("currency", e.target.value)}
            maxLength={6}
            className="field-input w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
          <p className="text-xs text-muted">
            Free-form. &quot;kr&quot; for SEK, &quot;$&quot;, &quot;€&quot;,
            &quot;£&quot;, or any short label.
          </p>
        </Field>

        <Field label="Position">
          <div className="inline-flex overflow-hidden rounded border border-line">
            {(["before", "after"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate("currencyPosition", p)}
                aria-pressed={draft.currencyPosition === p}
                className={`cursor-pointer border-0 px-3 py-1.5 font-mono text-sm ${
                  draft.currencyPosition === p
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {p === "before" ? "Before" : "After"}
              </button>
            ))}
          </div>
          <Preview>{withCurrency("1 234", draft)}</Preview>
        </Field>

        <ToggleRow
          label="Space between symbol and amount"
          hint='Off renders "$10" / "10kr"; on renders "$ 10" / "10 kr".'
          checked={draft.currencySpace}
          onChange={(v) => onUpdate("currencySpace", v)}
        />
      </Section>

      <Section title="Numbers">
        <Field label="Number format">
          <SelectPicker
            value={presetIdFor(draft)}
            options={NUMBER_FORMATS.map((f) => ({
              value: f.id,
              label: f.label,
            }))}
            onChange={onApplyNumberFormat}
            ariaLabel="Number format"
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <Preview>
            {previewNumber(
              numberPreviewSample,
              draft.thousandsSeparator,
              draft.decimalSeparator,
            )}
          </Preview>
        </Field>

        <Field label="Decimal character">
          <div className="inline-flex overflow-hidden rounded border border-line">
            {([".", ","] as DecimalSeparator[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onApplyDecimal(d)}
                aria-pressed={draft.decimalSeparator === d}
                className={`cursor-pointer border-0 px-3 py-1.5 font-mono text-sm ${
                  draft.decimalSeparator === d
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {d === "." ? "Dot (.)" : "Comma (,)"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Whichever character you type, it&apos;s snapped to this one — so
            &quot;100,99&quot; becomes &quot;100.99&quot; when dot is the
            decimal.
          </p>
        </Field>
      </Section>

      <Section title="Display">
        <Field label="Text size">
          <SelectPicker
            value={draft.fontScale}
            options={FONT_SCALE_PRESETS.map((p) => ({
              value: p.scale,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("fontScale", v)}
            ariaLabel="Text size"
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <p className="text-xs text-muted">
            Scales the whole UI — sheet cells, modals, headers. Use larger sizes
            for readability on high-DPI displays, smaller to fit more on screen.
          </p>
        </Field>
        <ToggleRow
          label="Format numbers"
          hint="Group thousands when displaying amounts and balances."
          checked={draft.formatNumbers}
          onChange={(v) => onUpdate("formatNumbers", v)}
        />
        <ToggleRow
          label="Show currency"
          hint="Append the currency symbol next to amounts and balances."
          checked={draft.showCurrency}
          onChange={(v) => onUpdate("showCurrency", v)}
        />
        <ToggleRow
          label="Show decimals"
          hint="Render the fractional part of amounts and balances. Off rounds to whole units."
          checked={draft.showDecimals}
          onChange={(v) => onUpdate("showDecimals", v)}
        />
        <ToggleRow
          label="Abbreviate large numbers"
          hint={
            'Collapse displayed amounts ≥ 10 000 to "12K" / "1.2M" so cramped mobile rows fit. Editable inputs always show the full value.'
          }
          checked={draft.abbreviateNumbers}
          onChange={(v) => onUpdate("abbreviateNumbers", v)}
        />
      </Section>

      <Section title="Storage">
        <Field label="Backend">
          <BackendPicker
            value={backend}
            onSelect={(next) => {
              if (next === "browser") onSelectBrowser();
              else if (next === "folder") onConnectFolder();
              else if (next === "dropbox") onConnectDropbox();
              else onConnectGdrive();
            }}
          />
          <p className="text-xs text-muted">
            {backend === "browser"
              ? "Stored locally in this browser. Export to JSON to move it elsewhere."
              : backend === "folder"
                ? folderConnected
                  ? "Saved as budget.json inside the folder you picked. Bytes never leave this device."
                  : folderReconnectNeeded
                    ? "Folder access was revoked. Reconnect to restore writes — your budget stays in this browser until then."
                    : folderAvailable
                      ? "Pick a folder on this device — the app writes budget.json into it. Single-device only; no automatic cross-device sync."
                      : "The Local-folder backend needs Chrome, Edge, or another Chromium browser."
                : (() => {
                    const copy = cloudCopy(backend);
                    const connected =
                      backend === "dropbox"
                        ? dropboxConnected
                        : gdriveConnected;
                    return connected
                      ? copy.connectedHint
                      : copy.unconnectedHint;
                  })()}
          </p>
          <p className="text-xs text-muted">
            Switching backends doesn&apos;t delete the budget at the other
            location — it stays in place, so you can switch back to it from here
            later.
          </p>
        </Field>
        {backend === "folder" && (
          <div className="flex items-center gap-2">
            {folderConnected ? (
              <button
                type="button"
                onClick={onDisconnectFolder}
                className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Disconnect folder
              </button>
            ) : folderReconnectNeeded ? (
              <button
                type="button"
                onClick={onReconnectFolder}
                className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
              >
                Reconnect folder
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectFolder}
                disabled={!folderAvailable}
                className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pick folder
              </button>
            )}
            {folderConnected && (
              <span className="text-xs text-success">Connected</span>
            )}
          </div>
        )}
        {(backend === "dropbox" || backend === "gdrive") &&
          (() => {
            const cloudBackend: CloudId = backend;
            const copy = cloudCopy(cloudBackend);
            const connected =
              cloudBackend === "dropbox" ? dropboxConnected : gdriveConnected;
            const onConnect =
              cloudBackend === "dropbox" ? onConnectDropbox : onConnectGdrive;
            const onDisconnect =
              cloudBackend === "dropbox"
                ? onDisconnectDropbox
                : onDisconnectGdrive;
            return (
              <div className="flex items-center gap-2">
                {connected ? (
                  <button
                    type="button"
                    onClick={onDisconnect}
                    className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
                  >
                    Disconnect {copy.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onConnect}
                    className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
                  >
                    Connect {copy.name}
                  </button>
                )}
                {connected && (
                  <span className="text-xs text-success">Connected</span>
                )}
              </div>
            );
          })()}
        <Field label="Backup">
          <ImportExportControls
            data={data}
            onImport={onImport}
            encryption={encryption}
            getEncryptionPassword={getEncryptionPassword}
          />
          <p className="text-xs text-muted">
            Export downloads the current budget as JSON (encrypted when Security
            is on). Import replaces it with a file you pick.
          </p>
        </Field>
        {backupsSupported && (
          <Field label="Snapshots">
            <button
              type="button"
              onClick={onOpenBackups}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
            >
              <Database size={14} aria-hidden focusable={false} />
              Manage backups…
            </button>
            <p className="text-xs text-muted">
              Saves a timestamped copy into a sibling{" "}
              <span className="font-mono text-path">backups/</span> folder on
              the active backend. Restoring auto-snapshots your current file
              first.
            </p>
          </Field>
        )}
      </Section>

      <Section title="Security">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 ${
              encryption === "encrypted" ? "text-success" : "text-danger"
            }`}
          >
            {encryption === "encrypted" ? (
              <ShieldCheck size={20} aria-hidden focusable={false} />
            ) : (
              <ShieldAlert size={20} aria-hidden focusable={false} />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-fg-bright">
              {encryption === "encrypted"
                ? "Encrypted storage"
                : "Unencrypted storage"}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {encryption === "encrypted"
                ? "Your budget is wrapped in AES-GCM with a PBKDF2-derived key from your account password before being written — whether the bytes land in this browser or in your connected cloud folder."
                : "Your budget is written as plain JSON — to this browser, or to your connected cloud folder. Anyone with access to those bytes can read it without your password."}
            </p>
          </div>
        </div>
        <Field label="Encrypt stored bytes">
          <div className="inline-flex overflow-hidden rounded border border-line">
            {(["encrypted", "plaintext"] as EncryptionMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onSetEncryption(m)}
                aria-pressed={encryption === m}
                disabled={isGuest}
                className={`border-0 px-3 py-1.5 font-mono text-sm ${
                  isGuest ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                } ${
                  encryption === m
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {m === "encrypted" ? "On" : "Off"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            {isGuest
              ? "Guest mode has no password to derive a key from. Create an account from the account menu to encrypt your budget."
              : "Applies to the active backend and any cloud sync. Switching re-wraps the bytes already in storage. Exports follow this setting too."}
          </p>
        </Field>
        <Field label="Session timeout">
          <SelectPicker
            value={draft.sessionTimeoutMinutes}
            options={SESSION_TIMEOUT_PRESETS.map((p) => ({
              value: p.minutes,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("sessionTimeoutMinutes", v)}
            ariaLabel="Session timeout"
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <p className="text-xs text-muted">
            Sign you out after this long without input. The clock resets on
            every click or keystroke, and you&apos;ll see a warning a minute
            before the deadline.
          </p>
        </Field>
      </Section>

      <Section title="Categories">
        <CategoriesAdmin
          userCategories={data.categories}
          hiddenPresetIds={data.hiddenPresetCategoryIds}
          onCreate={onCreateCategory}
          onUpdate={onUpdateCategory}
          onDelete={onDeleteCategory}
          onSetPresetHidden={onSetPresetCategoryHidden}
        />
      </Section>

      <Section title="Types">
        <TypesAdmin
          userTypes={data.types}
          hiddenPresetIds={data.hiddenPresetTypeIds}
          onCreate={onCreateType}
          onUpdate={onUpdateType}
          onDelete={onDeleteType}
          onSetPresetHidden={onSetPresetTypeHidden}
        />
      </Section>

      <Section title="Memory">
        <ClearRow
          label="Merchant memory"
          count={merchantHintCount}
          singleHint="One merchant remembered. Cleared on demand below."
          pluralHint={`${merchantHintCount} merchants remembered. The recurring-candidate panel uses these to suggest categories on future imports.`}
          emptyHint="No merchants remembered yet. Assigning a category to a row teaches one entry."
          buttonLabel="Clear merchant memory"
          onClear={onClearMerchantHints}
        />
        <ClearRow
          label="Recurring dismissals"
          count={recurringDismissalCount}
          singleHint="One recurring suggestion dismissed."
          pluralHint={`${recurringDismissalCount} recurring suggestions dismissed. Clear to let them resurface on the budget view.`}
          emptyHint="No dismissals. Pressing × on a recurring candidate adds one here."
          buttonLabel="Clear dismissals"
          onClear={onClearRecurringDismissals}
        />
        <ClearRow
          label="Transfer dismissals"
          count={transferDismissalCount}
          singleHint="One transfer pair dismissed."
          pluralHint={`${transferDismissalCount} transfer pairs dismissed. Clear to let them resurface on the Accounts page.`}
          emptyHint='No dismissals. Pressing "Never" on a transfer pair adds one here.'
          buttonLabel="Clear dismissals"
          onClear={onClearTransferDismissals}
        />
      </Section>

      {/* Opens in a new tab so an in-flight settings edit isn't lost
          when the user navigates away to read these. The schema page
          exposes the JSON Schema for the exported data so an LLM (or
          any other tool) handed a `budget-*.json` file can be pointed
          at a stable URL describing its shape. The changelog page is
          a chronological list of release notes — newest first — that
          mirrors the "What's new" popup that auto-opens after an
          upgrade. */}
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
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
      </p>

      <DonateLink />
    </div>
  );
}

// URL is injected at build time from the `VITE_DONATE_URL` GitHub
// Actions secret (see `.github/workflows/pages.yml`). When the secret
// isn't set — e.g. on a fork that hasn't configured its own donate
// page — the button hides entirely so the modal doesn't trail a
// dead link. The heart is rendered in PayPal-agnostic "danger red"
// so the button reads as warm regardless of which donate target the
// maintainer points it at.
function DonateLink() {
  const url = import.meta.env.VITE_DONATE_URL?.trim();
  if (!url) return null;
  return (
    <div className="mt-3 flex justify-center">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
      >
        <Heart
          size={14}
          className="text-danger"
          fill="currentColor"
          aria-hidden
          focusable={false}
        />
        Donate
      </a>
    </div>
  );
}

// Shared list/edit shell for categories and types. The two admin
// surfaces are structurally identical — list presets with a hide
// toggle, list user-added entries with edit + delete, plus an "Add"
// button at the bottom that swaps the row into an inline editor — so
// the loop, the editor, and the confirm-delete plumbing all live in
// these two components instead of being duplicated per shape.
//
// We deliberately don't try to abstract into a single generic admin
// for both shapes: `Category.icon` vs `EntryType.glyph` field name,
// the chip components, and the glyph allowlists differ enough that
// the extra plumbing reads worse than two parallel components.

function CategoriesAdmin({
  userCategories,
  hiddenPresetIds,
  onCreate,
  onUpdate,
  onDelete,
  onSetPresetHidden,
}: {
  userCategories: Category[];
  hiddenPresetIds: string[];
  onCreate: (draft: Omit<Category, "id">) => Category;
  onUpdate: (id: string, patch: Partial<Omit<Category, "id">>) => void;
  onDelete: (id: string) => void;
  onSetPresetHidden: (presetId: string, hidden: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const hidden = new Set(hiddenPresetIds);
  const pendingDelete =
    pendingDeleteId !== null
      ? (userCategories.find((c) => c.id === pendingDeleteId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Built-in categories can be hidden to declutter the picker; your own
        categories can be edited or removed. Removing one clears the tag on any
        rows or transactions it labelled.
      </p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded border border-line bg-surface-2">
        {PRESET_CATEGORIES.map((cat) => {
          const isHidden = hidden.has(cat.id);
          return (
            <li
              key={cat.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <CategoryChip category={cat} compact />
              <span className="text-xs text-muted">Built-in</span>
              <button
                type="button"
                onClick={() => onSetPresetHidden(cat.id, !isHidden)}
                aria-pressed={!isHidden}
                aria-label={isHidden ? "Show category" : "Hide category"}
                title={isHidden ? "Show in picker" : "Hide from picker"}
                className={`ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line ${
                  isHidden
                    ? "bg-surface text-muted hover:text-fg"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {isHidden ? (
                  <EyeOff size={14} aria-hidden focusable={false} />
                ) : (
                  <Eye size={14} aria-hidden focusable={false} />
                )}
              </button>
            </li>
          );
        })}
        {userCategories.map((cat) => {
          if (editingId === cat.id) {
            return (
              <li key={cat.id} className="px-2 py-2">
                <CategoryEditor
                  initial={cat}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdate(cat.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={cat.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <CategoryChip category={cat} compact />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId(cat.id)}
                  aria-label="Edit category"
                  title="Edit"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <Pencil size={13} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(cat.id)}
                  aria-label="Delete category"
                  title="Delete"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden focusable={false} />
                </button>
              </div>
            </li>
          );
        })}
        {userCategories.length === 0 && hiddenPresetIds.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-muted">
            Add your own categories below for buckets the built-in list doesn't
            cover.
          </li>
        )}
      </ul>
      {creating ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <CategoryEditor
            initial={null}
            submitLabel="Add"
            onCancel={() => setCreating(false)}
            onSubmit={(draft) => {
              onCreate(draft);
              setCreating(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden focusable={false} />
          Add category
        </button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete category"
        description={
          pendingDelete
            ? `Remove "${pendingDelete.name}"? Any rows or transactions tagged with it will lose their category.`
            : null
        }
        actions={[
          {
            label: "Delete",
            tone: "danger",
            onSelect: () => {
              if (pendingDeleteId) onDelete(pendingDeleteId);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

function TypesAdmin({
  userTypes,
  hiddenPresetIds,
  onCreate,
  onUpdate,
  onDelete,
  onSetPresetHidden,
}: {
  userTypes: EntryType[];
  hiddenPresetIds: string[];
  onCreate: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdate: (id: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDelete: (id: string) => void;
  onSetPresetHidden: (presetId: string, hidden: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const hidden = new Set(hiddenPresetIds);
  const pendingDelete =
    pendingDeleteId !== null
      ? (userTypes.find((t) => t.id === pendingDeleteId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">
        Built-in types cover typical Swedish household lines — rent, mortgage,
        electricity, A-kassa, SL/public transport. Hide the ones you don't need;
        add your own for anything else.
      </p>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded border border-line bg-surface-2">
        {PRESET_ENTRY_TYPES.map((t) => {
          const isHidden = hidden.has(t.id);
          return (
            <li
              key={t.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <TypeChip type={t} compact />
              <span className="text-xs text-muted">Built-in</span>
              <button
                type="button"
                onClick={() => onSetPresetHidden(t.id, !isHidden)}
                aria-pressed={!isHidden}
                aria-label={isHidden ? "Show type" : "Hide type"}
                title={isHidden ? "Show in picker" : "Hide from picker"}
                className={`ml-auto inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line ${
                  isHidden
                    ? "bg-surface text-muted hover:text-fg"
                    : "bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                {isHidden ? (
                  <EyeOff size={14} aria-hidden focusable={false} />
                ) : (
                  <Eye size={14} aria-hidden focusable={false} />
                )}
              </button>
            </li>
          );
        })}
        {userTypes.map((t) => {
          if (editingId === t.id) {
            return (
              <li key={t.id} className="px-2 py-2">
                <TypeEditor
                  initial={t}
                  submitLabel="Save"
                  onCancel={() => setEditingId(null)}
                  onSubmit={(draft) => {
                    onUpdate(t.id, draft);
                    setEditingId(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li
              key={t.id}
              className="flex items-center gap-2 px-2 py-1.5 text-sm"
            >
              <TypeChip type={t} compact />
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId(t.id)}
                  aria-label="Edit type"
                  title="Edit"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                >
                  <Pencil size={13} aria-hidden focusable={false} />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(t.id)}
                  aria-label="Delete type"
                  title="Delete"
                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                >
                  <Trash2 size={13} aria-hidden focusable={false} />
                </button>
              </div>
            </li>
          );
        })}
        {userTypes.length === 0 && hiddenPresetIds.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-muted">
            Add your own types below for entries the built-in list doesn't
            cover.
          </li>
        )}
      </ul>
      {creating ? (
        <div className="rounded border border-line bg-surface-2 p-2">
          <TypeEditor
            initial={null}
            submitLabel="Add"
            onCancel={() => setCreating(false)}
            onSubmit={(draft) => {
              onCreate(draft);
              setCreating(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
        >
          <Plus size={14} aria-hidden focusable={false} />
          Add type
        </button>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete type"
        description={
          pendingDelete
            ? `Remove "${pendingDelete.name}"? Any rows labelled with it lose the chip; their description and category stay intact.`
            : null
        }
        actions={[
          {
            label: "Delete",
            tone: "danger",
            onSelect: () => {
              if (pendingDeleteId) onDelete(pendingDeleteId);
              setPendingDeleteId(null);
            },
          },
        ]}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

function CategoryEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: Category | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<Category, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(
    initial?.color ?? CATEGORY_COLORS[0],
  );
  const [icon, setIcon] = useState<CategoryIcon>(initial?.icon ?? "tag");

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, icon });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          className="field-input rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Bills"
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Color</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Icon</span>
        <GlyphGrid
          icons={CATEGORY_GLYPH_NAMES}
          value={icon}
          onChange={setIcon}
          tintColor={color}
        />
      </div>
      <EditorButtons
        submitLabel={submitLabel}
        disabled={!name.trim()}
        onCancel={onCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function TypeEditor({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: EntryType | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (draft: Omit<EntryType, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<string>(
    initial?.color ?? CATEGORY_COLORS[0],
  );
  const [glyph, setGlyph] = useState<CategoryIcon>(initial?.glyph ?? "tag");

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, color, glyph });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>Name</span>
        <input
          type="text"
          autoFocus
          className="field-input rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Padel"
        />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Color</span>
        <ColorPalette
          colors={CATEGORY_COLORS}
          value={color}
          onChange={setColor}
          size={5}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <span>Glyph</span>
        <GlyphGrid
          icons={TYPE_GLYPH_NAMES}
          value={glyph}
          onChange={setGlyph}
          tintColor={color}
        />
      </div>
      <EditorButtons
        submitLabel={submitLabel}
        disabled={!name.trim()}
        onCancel={onCancel}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function EditorButtons({
  submitLabel,
  disabled,
  onCancel,
  onSubmit,
}: {
  submitLabel: string;
  disabled: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="mt-1 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
      >
        <X size={12} aria-hidden focusable={false} />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="inline-flex cursor-pointer items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check size={12} aria-hidden focusable={false} />
        {submitLabel}
      </button>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-3 rounded border border-line bg-surface-3 p-3 first:mt-0">
      <legend className="px-1 text-xs font-bold tracking-wide text-muted uppercase">
        {title}
      </legend>
      <div className="flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </label>
  );
}

function Preview({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-surface px-2 py-1 font-mono text-xs text-path">
      {children}
    </span>
  );
}

function ClearRow({
  label,
  count,
  singleHint,
  pluralHint,
  emptyHint,
  buttonLabel,
  onClear,
}: {
  label: string;
  count: number;
  singleHint: string;
  pluralHint: string;
  emptyHint: string;
  buttonLabel: string;
  onClear: () => void;
}) {
  const hint = count === 0 ? emptyHint : count === 1 ? singleHint : pluralHint;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-fg">{label}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={count === 0}
          className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Checkbox
      checked={checked}
      onChange={onChange}
      label={label}
      description={hint}
    />
  );
}

function previewNumber(
  n: number,
  thousands: ThousandsSeparator,
  decimal: DecimalSeparator,
): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, fracPart] = fixed.split(".");
  let grouped = intPart;
  if (thousands !== "" && intPart.length > 3) {
    const out: string[] = [];
    for (let i = intPart.length; i > 0; i -= 3) {
      out.unshift(intPart.slice(Math.max(0, i - 3), i));
    }
    grouped = out.join(thousands);
  }
  return `${sign}${grouped}${decimal}${fracPart}`;
}

function formatDatePreview(iso: string, format: DateFormat): string {
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  switch (format) {
    case "YYYY-MM-DD":
      return `${y}-${m}-${d}`;
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "MM/DD/YYYY":
      return `${m}/${d}/${y}`;
    case "DD.MM.YYYY":
      return `${d}.${m}.${y}`;
    case "D MMM YYYY":
      return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
  }
}

function formatShortDatePreview(iso: string, format: ShortDateFormat): string {
  const monthNum = Number(iso.slice(5, 7));
  const dayNum = Number(iso.slice(8, 10));
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  switch (format) {
    case "DD/MM":
      return `${dayNum}/${monthNum}`;
    case "MM/DD":
      return `${monthNum}/${dayNum}`;
    case "DD.MM":
      return `${dayNum}.${monthNum}`;
    case "MM-DD":
      return `${monthNum}-${dayNum}`;
    case "D MMM":
      return `${dayNum} ${months[monthNum - 1]}`;
  }
}
