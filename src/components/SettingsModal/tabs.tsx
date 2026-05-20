import { useId } from "react";
import { Database, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  CURRENCY_PRESETS,
  DATE_FORMATS,
  FONT_SCALE_PRESETS,
  NUMBER_FORMATS,
  SESSION_TIMEOUT_PRESETS,
  SHORT_DATE_FORMATS,
} from "../../data/constants";
import type {
  Category,
  DateFormat,
  DecimalSeparator,
  EntryType,
  Settings,
  ShortDateFormat,
  ThousandsSeparator,
  UserData,
} from "../../data/types";
import { type Lang, useT, type TFunction } from "../../i18n";
import type {
  BackendId,
  EncryptionMode,
} from "../../storage/backend-preference";
import { withCurrency } from "../../utils/format";
import { BackendPicker } from "../BackendPicker";
import { Checkbox, SelectPicker } from "../form";
import { ImportExportControls } from "../ImportExportControls";
import { LanguagePicker } from "../LanguagePicker";
import { CategoriesAndTypesAdmin } from "./admin";

type CloudId = "dropbox" | "gdrive";

type CloudCopy = {
  name: string;
  connectedHint: string;
  unconnectedHint: string;
};

function cloudCopy(id: CloudId, t: TFunction): CloudCopy {
  if (id === "dropbox") {
    return {
      name: t("settings.storage.backendDropbox"),
      connectedHint: t("settings.storage.backendDropboxConnected"),
      unconnectedHint: t("settings.storage.backendDropboxUnconnected"),
    };
  }
  return {
    name: t("settings.storage.backendGoogleDrive"),
    connectedHint: t("settings.storage.backendGdriveConnected"),
    unconnectedHint: t("settings.storage.backendGdriveUnconnected"),
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

type Update = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export function GeneralTab({
  draft,
  onUpdate,
  detectedPayday,
}: {
  draft: Settings;
  onUpdate: Update;
  // Auto-detected payday day-of-month from the user's salary
  // series, or null if no confident pick is available. Shown as a
  // one-click "Use detected" suggestion under the picker — never
  // applied automatically so the user keeps control.
  detectedPayday: number | null;
}) {
  const t = useT();
  return (
    <>
      <Section title={t("settings.languageSection.title")}>
        <Field label={t("language.pick")}>
          <LanguagePicker
            value={draft.language}
            onChange={(v) => onUpdate("language", v as Lang)}
          />
          <p className="text-xs text-muted">
            {t("settings.languageSection.hint")}
          </p>
        </Field>
      </Section>

      <Section title={t("settings.month.title")}>
        <Field label={t("settings.month.startOfMonth")}>
          <div className="w-24">
            <SelectPicker
              value={draft.startOfMonth}
              options={Array.from({ length: 28 }, (_, i) => ({
                value: i + 1,
                label: i + 1,
              }))}
              onChange={(v) => onUpdate("startOfMonth", v)}
              ariaLabel={t("settings.month.startOfMonth")}
              triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
              panelClassName="font-mono tabular-nums"
            />
          </div>
          <p className="text-xs text-muted">
            {t("settings.month.startOfMonthHint")}
          </p>
          {detectedPayday !== null && detectedPayday !== draft.startOfMonth && (
            <p className="text-xs text-muted">
              {t("settings.month.detectedFromSalary")}{" "}
              <button
                type="button"
                onClick={() => onUpdate("startOfMonth", detectedPayday)}
                className="text-accent underline-offset-2 hover:underline"
              >
                {t("settings.month.useDetected", { day: detectedPayday })}
              </button>
              .
            </p>
          )}
        </Field>
      </Section>

      <Section title={t("settings.display.title")}>
        <Field label={t("settings.display.textSize")}>
          <SelectPicker
            value={draft.fontScale}
            options={FONT_SCALE_PRESETS.map((p) => ({
              value: p.scale,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("fontScale", v)}
            ariaLabel={t("settings.display.textSize")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <p className="text-xs text-muted">
            {t("settings.display.textSizeHint")}
          </p>
        </Field>
        <ToggleRow
          label={t("settings.format.formatNumbers")}
          checked={draft.formatNumbers}
          onChange={(v) => onUpdate("formatNumbers", v)}
        />
        <ToggleRow
          label={t("settings.format.showCurrency")}
          checked={draft.showCurrency}
          onChange={(v) => onUpdate("showCurrency", v)}
        />
        <ToggleRow
          label={t("settings.format.showDecimals")}
          checked={draft.showDecimals}
          onChange={(v) => onUpdate("showDecimals", v)}
        />
        <ToggleRow
          label={t("settings.format.abbreviate")}
          checked={draft.abbreviateNumbers}
          onChange={(v) => onUpdate("abbreviateNumbers", v)}
        />
        {draft.abbreviateNumbers && (
          <ToggleRow
            label={t("settings.format.alwaysAbbreviateBalance")}
            checked={draft.alwaysAbbreviateBalance}
            onChange={(v) => onUpdate("alwaysAbbreviateBalance", v)}
          />
        )}
      </Section>
    </>
  );
}

export function FormatTab({
  draft,
  currencyPresetId,
  onUpdate,
  onApplyNumberFormat,
  onApplyCurrencyPreset,
  onApplyDecimal,
}: {
  draft: Settings;
  // Authoritative selection for the currency preset picker. Owned by
  // SettingsModal so a click on NOK/DKK/ISK/CAD doesn't snap back to
  // SEK/USD (they share the same display triplet).
  currencyPresetId: string;
  onUpdate: Update;
  onApplyNumberFormat: (id: string) => void;
  onApplyCurrencyPreset: (id: string) => void;
  onApplyDecimal: (d: DecimalSeparator) => void;
}) {
  const t = useT();
  const numberPreviewSample = 1234567.89;
  const datePreviewIso = "2026-05-16";
  const showCustomCurrency = currencyPresetId === "custom";

  return (
    <>
      <Section title={t("settings.format.dateTitle")}>
        <Field label={t("settings.format.dateFormat")}>
          <SelectPicker
            value={draft.dateFormat}
            options={DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => onUpdate("dateFormat", v as DateFormat)}
            ariaLabel={t("settings.format.dateFormat")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <Preview>
            {formatDatePreview(
              datePreviewIso,
              draft.dateFormat,
              draft.language,
            )}
          </Preview>
        </Field>

        <Field label={t("settings.format.shortDateFormat")}>
          <SelectPicker
            value={draft.shortDateFormat}
            options={SHORT_DATE_FORMATS.map((f) => ({ value: f, label: f }))}
            onChange={(v) => onUpdate("shortDateFormat", v as ShortDateFormat)}
            ariaLabel={t("settings.format.shortDateFormat")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <Preview>
            {formatShortDatePreview(
              datePreviewIso,
              draft.shortDateFormat,
              draft.language,
            )}
          </Preview>
          <p className="text-xs text-muted">
            {t("settings.format.shortDateFormatHint")}
          </p>
        </Field>
      </Section>

      <Section title={t("settings.format.currencyTitle")}>
        <Field label={t("settings.format.currencyPreset")}>
          <SelectPicker
            value={currencyPresetId}
            options={[
              ...CURRENCY_PRESETS.map((p) => ({
                value: p.id,
                label: p.codes.join("/"),
                hint: t(p.nameKey as Parameters<typeof t>[0]),
              })),
              {
                value: "custom",
                label: t("settings.format.currencyCustom"),
              },
            ]}
            onChange={onApplyCurrencyPreset}
            ariaLabel={t("settings.format.currencyPreset")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <Preview>
            {withCurrency("1 234", { ...draft, showCurrency: true })}
          </Preview>
        </Field>

        {showCustomCurrency && (
          <>
            <Field label={t("settings.format.currencyToken")}>
              <input
                type="text"
                value={draft.currency}
                onChange={(e) => onUpdate("currency", e.target.value)}
                maxLength={6}
                className="field-input w-24 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              />
            </Field>

            <Field label={t("settings.format.currencyPosition")}>
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
                    {p === "before"
                      ? t("settings.format.currencyBefore")
                      : t("settings.format.currencyAfter")}
                  </button>
                ))}
              </div>
            </Field>

            <ToggleRow
              label={t("settings.format.currencySpace")}
              checked={draft.currencySpace}
              onChange={(v) => onUpdate("currencySpace", v)}
            />
          </>
        )}
      </Section>

      <Section title={t("settings.format.numberTitle")}>
        <Field label={t("settings.format.numberFormat")}>
          <SelectPicker
            value={presetIdFor(draft)}
            options={NUMBER_FORMATS.map((f) => ({
              value: f.id,
              label: f.label,
            }))}
            onChange={onApplyNumberFormat}
            ariaLabel={t("settings.format.numberFormat")}
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

        <Field label={t("settings.format.decimalSeparator")}>
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
                {d === "." ? "." : ","}
              </button>
            ))}
          </div>
        </Field>
      </Section>
    </>
  );
}

export function StorageTab({
  draft,
  backend,
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  folderAvailable,
  folderReconnectNeeded,
  encryption,
  isGuest,
  data,
  onImport,
  backupsSupported,
  onOpenBackups,
  getEncryptionPassword,
  onUpdate,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onSelectBrowser,
  onSetEncryption,
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
  data: UserData;
  onImport: (data: UserData) => void;
  backupsSupported: boolean;
  onOpenBackups: () => void;
  getEncryptionPassword: () => string | null;
  onUpdate: Update;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => void;
  onDisconnectGdrive: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
}) {
  const t = useT();
  return (
    <>
      <Section title={t("settings.tabs.storage")}>
        <Field label={t("settings.tabs.storage")}>
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
              ? t("settings.storage.browserHint")
              : backend === "folder"
                ? folderConnected
                  ? t("settings.storage.folderConnected", {
                      name: t("settings.storage.folderTitle"),
                    })
                  : folderReconnectNeeded
                    ? t("settings.storage.folderNotConnected")
                    : folderAvailable
                      ? t("settings.storage.folderNotConnected")
                      : t("settings.storage.folderUnsupported")
                : (() => {
                    const copy = cloudCopy(backend, t);
                    const connected =
                      backend === "dropbox"
                        ? dropboxConnected
                        : gdriveConnected;
                    return connected
                      ? copy.connectedHint
                      : copy.unconnectedHint;
                  })()}
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
                {t("settings.storage.disconnectFolder")}
              </button>
            ) : folderReconnectNeeded ? (
              <button
                type="button"
                onClick={onReconnectFolder}
                className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
              >
                {t("settings.storage.cloudReconnect")}
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectFolder}
                disabled={!folderAvailable}
                className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("settings.storage.pickFolder")}
              </button>
            )}
            {folderConnected && (
              <span className="text-xs text-success">
                {t("common.connected")}
              </span>
            )}
          </div>
        )}
        {(backend === "dropbox" || backend === "gdrive") &&
          (() => {
            const cloudBackend: CloudId = backend;
            const copy = cloudCopy(cloudBackend, t);
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
                    {t("settings.storage.cloudDisconnect")} {copy.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onConnect}
                    className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
                  >
                    {t("settings.storage.cloudConnect")} {copy.name}
                  </button>
                )}
                {connected && (
                  <span className="text-xs text-success">
                    {t("common.connected")}
                  </span>
                )}
              </div>
            );
          })()}
        <Field label={t("settings.storage.importExport")}>
          <ImportExportControls
            data={data}
            onImport={onImport}
            encryption={encryption}
            getEncryptionPassword={getEncryptionPassword}
          />
        </Field>
        {backupsSupported && (
          <Field label={t("settings.storage.backupsTitle")}>
            <button
              type="button"
              onClick={onOpenBackups}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
            >
              <Database size={14} aria-hidden focusable={false} />
              {t("settings.storage.browseBackups")}
            </button>
            <p className="text-xs text-muted">
              {t("settings.storage.backupsHint")}
            </p>
          </Field>
        )}
      </Section>

      <Section title={t("settings.storage.encryptionTitle")}>
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
                ? t("auth.encryptionOn")
                : t("auth.encryptionOff")}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {t("settings.storage.encryptionHint")}
            </p>
          </div>
        </div>
        <Field label={t("settings.storage.encryptionTitle")}>
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
                {m === "encrypted" ? t("common.on") : t("common.off")}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("settings.session.timeout")}>
          <SelectPicker
            value={draft.sessionTimeoutMinutes}
            options={SESSION_TIMEOUT_PRESETS.map((p) => ({
              value: p.minutes,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("sessionTimeoutMinutes", v)}
            ariaLabel={t("settings.session.timeout")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <p className="text-xs text-muted">
            {t("settings.session.timeoutHint")}
          </p>
        </Field>
      </Section>
    </>
  );
}

export function CategoriesTab({
  data,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onSetPresetCategoryHidden,
  onCreateType,
  onUpdateType,
  onDeleteType,
  onSetPresetTypeHidden,
}: {
  data: UserData;
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
  const t = useT();
  return (
    <Section title={t("settings.categoriesTab.title")}>
      <CategoriesAndTypesAdmin
        userCategories={data.categories}
        userTypes={data.types}
        hiddenPresetCategoryIds={data.hiddenPresetCategoryIds}
        hiddenPresetTypeIds={data.hiddenPresetTypeIds}
        onCreateCategory={onCreateCategory}
        onUpdateCategory={onUpdateCategory}
        onDeleteCategory={onDeleteCategory}
        onSetPresetCategoryHidden={onSetPresetCategoryHidden}
        onCreateType={onCreateType}
        onUpdateType={onUpdateType}
        onDeleteType={onDeleteType}
        onSetPresetTypeHidden={onSetPresetTypeHidden}
      />
    </Section>
  );
}

export function MemoryTab({
  merchantHintCount,
  recurringDismissalCount,
  transferDismissalCount,
  onClearMerchantHints,
  onClearRecurringDismissals,
  onClearTransferDismissals,
}: {
  merchantHintCount: number;
  recurringDismissalCount: number;
  transferDismissalCount: number;
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
}) {
  const t = useT();
  return (
    <Section title={t("settings.tabs.memory")}>
      <ClearRow
        label={t("settings.memory.merchantTitle")}
        count={merchantHintCount}
        hint={
          merchantHintCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.merchantHint")
        }
        buttonLabel={t("settings.memory.clearMerchants")}
        onClear={onClearMerchantHints}
      />
      <ClearRow
        label={t("settings.memory.dismissedRecurringTitle")}
        count={recurringDismissalCount}
        hint={
          recurringDismissalCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.dismissedRecurringHint")
        }
        buttonLabel={t("settings.memory.clearDismissed")}
        onClear={onClearRecurringDismissals}
      />
      <ClearRow
        label={t("settings.memory.dismissedTransferTitle")}
        count={transferDismissalCount}
        hint={
          transferDismissalCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.dismissedTransferHint")
        }
        buttonLabel={t("settings.memory.clearDismissed")}
        onClear={onClearTransferDismissals}
      />
    </Section>
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

// Grouping wrapper for a labelled row of custom controls. Renders as a
// `<div role="group">` rather than a `<label>` because the children are
// custom pickers (button + portalled listbox), not native form
// controls. A real `<label>` forwards clicks on any of its descendants
// to the first labelable element inside — for these rows, that meant
// clicking the hint text, the preview chip, or the empty space beside
// the picker would silently open the dropdown.
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className="flex flex-col gap-1.5"
    >
      <span id={labelId} className="text-xs text-muted">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
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
  hint,
  buttonLabel,
  onClear,
}: {
  label: string;
  count: number;
  hint: string;
  buttonLabel: string;
  onClear: () => void;
}) {
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

const MONTH_PREVIEW: Record<Lang, readonly string[]> = {
  en: [
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
  ],
  sv: [
    "jan",
    "feb",
    "mar",
    "apr",
    "maj",
    "jun",
    "jul",
    "aug",
    "sep",
    "okt",
    "nov",
    "dec",
  ],
};

function formatDatePreview(
  iso: string,
  format: DateFormat,
  lang: Lang,
): string {
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  const d = iso.slice(8, 10);
  const months = MONTH_PREVIEW[lang];
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

function formatShortDatePreview(
  iso: string,
  format: ShortDateFormat,
  lang: Lang,
): string {
  const monthNum = Number(iso.slice(5, 7));
  const dayNum = Number(iso.slice(8, 10));
  const months = MONTH_PREVIEW[lang];
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
