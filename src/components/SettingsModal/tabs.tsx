import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Database, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  BORDER_WIDTH_PRESETS,
  COLOR_GROUPS,
  COLOR_KEYS,
  CURRENCY_PRESETS,
  DARK_THEMES,
  DATE_FORMATS,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DENSITY_PRESETS,
  FAMILY_DEFAULT_THEME,
  FONT_FAMILIES,
  FONT_SCALE_PRESETS,
  LIGHT_THEMES,
  PRESET_PALETTES,
  RADIUS_PRESETS,
  SESSION_TIMEOUT_PRESETS,
  SHORT_DATE_FORMATS,
  themeFamily,
} from "../../data/constants";
import type {
  Category,
  CustomTheme,
  CustomThemeColors,
  DateFormat,
  DecimalSeparator,
  EntryType,
  FontFamilyId,
  HeaderAction,
  Settings,
  Sheet,
  ShortDateFormat,
  ThemeFamily,
  ThemePreset,
  ThousandsSeparator,
  UserData,
} from "../../data/types";
import { useDevMode } from "../../hooks";
import { type Lang, useT, type TFunction } from "../../i18n";
import type {
  BackendId,
  EncryptionMode,
} from "../../storage/backend-preference";
import { IS_PREVIEW } from "../../utils/build-env";
import { formatAmount } from "../../utils/format";
import {
  clearLogs,
  createLogger,
  getLogs,
  type LogEntry,
  type LogLevel,
  subscribeToLogs,
} from "../../utils/logger";
import { BackendPicker } from "../BackendPicker";
import { CategoryIconGlyph } from "../icons";

const storageTabLog = createLogger("settings-storage");
import {
  Button,
  Checkbox,
  ClearableTextInput,
  type SelectOption,
  SelectPicker,
} from "../form";
import { ImportExportControls } from "../ImportExportControls";
import { LanguagePicker } from "../LanguagePicker";
import { DeleteAccountForm } from "./DeleteAccountForm";
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

type Update = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export function GeneralTab({
  draft,
  onUpdate,
  detectedPayday,
  sheets,
}: {
  draft: Settings;
  onUpdate: Update;
  // Auto-detected payday day-of-month from the user's salary
  // series, or null if no confident pick is available. Shown as a
  // one-click "Use detected" suggestion under the picker — never
  // applied automatically so the user keeps control.
  detectedPayday: number | null;
  // The user's sheets, in order, used to populate the per-sheet
  // entries of the header-action picker. Each sheet renders with
  // its own glyph + colour so the dropdown reads like the bottom
  // tab bar.
  sheets: readonly Sheet[];
}) {
  const t = useT();
  const { devMode, setDevMode } = useDevMode();
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
        <ToggleRow
          label={t("settings.display.hideTransfers")}
          hint={t("settings.display.hideTransfersHint")}
          checked={draft.hideTransfers}
          onChange={(v) => onUpdate("hideTransfers", v)}
        />
      </Section>

      <Section title={t("settings.headerAction.title")}>
        <Field label={t("settings.headerAction.label")}>
          <HeaderActionPicker
            value={draft.headerAction}
            sheets={sheets}
            onChange={(v) => onUpdate("headerAction", v)}
          />
          <p className="text-xs text-muted">
            {t("settings.headerAction.hint")}
          </p>
        </Field>
      </Section>

      {IS_PREVIEW && (
        <Section title={t("settings.developer.section")}>
          <ToggleRow
            label={t("settings.developer.mode")}
            hint={t("settings.developer.modeHint")}
            checked={devMode}
            onChange={setDevMode}
          />
        </Section>
      )}
    </>
  );
}

// Sheets are encoded as `sheet:<id>` in the picker's flat string
// surface so SelectPicker's generic stays `string` (it doesn't
// support arbitrary keys). The encoding is local to this component:
// on commit we decode back into the discriminated `HeaderAction`
// union before persisting.
type BuiltinHeaderActionKind = Exclude<HeaderAction, { kind: "sheet" }>["kind"];
type HeaderActionKey = BuiltinHeaderActionKind | `sheet:${string}`;

function encodeHeaderAction(action: HeaderAction): HeaderActionKey {
  return action.kind === "sheet" ? `sheet:${action.sheetId}` : action.kind;
}

function decodeHeaderAction(key: HeaderActionKey): HeaderAction {
  if (key.startsWith("sheet:")) {
    return { kind: "sheet", sheetId: key.slice("sheet:".length) };
  }
  return { kind: key as BuiltinHeaderActionKind };
}

function HeaderActionPicker({
  value,
  sheets,
  onChange,
}: {
  value: HeaderAction;
  sheets: readonly Sheet[];
  onChange: (next: HeaderAction) => void;
}) {
  const t = useT();
  // Stable order: built-ins first, then one entry per sheet.
  // Sheet-target whose sheet no longer exists falls back to the
  // "Scroll to top" entry in the picker so the dropdown never shows
  // a blank selection — the BudgetView click handler applies the
  // same fallback at runtime.
  const sheetExists = sheets.some(
    (s) => value.kind === "sheet" && s.id === value.sheetId,
  );
  const selectedKey: HeaderActionKey =
    value.kind === "sheet" && !sheetExists ? "top" : encodeHeaderAction(value);
  const options: SelectOption<HeaderActionKey>[] = [
    { value: "top", label: t("settings.headerAction.top") },
    { value: "currentMonth", label: t("settings.headerAction.currentMonth") },
    { value: "refresh", label: t("settings.headerAction.refresh") },
    ...sheets.map((s) => ({
      value: `sheet:${s.id}` as const,
      label: (
        <span className="inline-flex items-center gap-1.5">
          <CategoryIconGlyph
            name={s.glyph}
            size={14}
            style={{ color: s.color }}
          />
          <span>{t("settings.headerAction.sheet", { name: s.name })}</span>
        </span>
      ),
    })),
  ];
  return (
    <SelectPicker<HeaderActionKey>
      value={selectedKey}
      options={options}
      onChange={(v) => onChange(decodeHeaderAction(v))}
      ariaLabel={t("settings.headerAction.label")}
      triggerClassName="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      panelClassName="max-h-64 overflow-y-auto"
    />
  );
}

export function FormatTab({
  draft,
  currencyPresetId,
  onUpdate,
  onApplyCurrencyPreset,
  onApplyDecimal,
}: {
  draft: Settings;
  // Authoritative selection for the currency preset picker. Owned by
  // SettingsModal so a click on NOK/DKK/ISK/CAD doesn't snap back to
  // SEK/USD (they share the same display triplet).
  currencyPresetId: string;
  onUpdate: Update;
  onApplyCurrencyPreset: (id: string) => void;
  onApplyDecimal: (d: DecimalSeparator) => void;
}) {
  const t = useT();
  // Three samples so each Numbers setting stays previewable regardless of
  // the others: 12.34 always shows decimal/decimal-separator behaviour
  // (below the abbreviate threshold), 1234.56 adds thousands grouping,
  // and 1234567.89 exercises the abbreviator when that toggle is on.
  const numberPreviewSamples = [12.34, 1234.56, 1234567.89];
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

      <Section title={t("settings.format.numberTitle")}>
        <Field label={t("settings.format.numberPreview")}>
          {numberPreviewSamples.map((sample) => (
            <Preview key={sample}>{formatAmount(sample, draft)}</Preview>
          ))}
        </Field>

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
        </Field>

        {showCustomCurrency && (
          <>
            <Field label={t("settings.format.currencyToken")}>
              <ClearableTextInput
                value={draft.currency}
                onValueChange={(v) => onUpdate("currency", v)}
                maxLength={6}
                wrapperClassName="w-24"
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

        <Field label={t("settings.format.thousandsSeparator")}>
          <div className="inline-flex overflow-hidden rounded border border-line">
            {(
              [
                { value: " " as ThousandsSeparator, label: " " },
                { value: "." as ThousandsSeparator, label: "." },
                { value: "," as ThousandsSeparator, label: "," },
              ] as const
            ).map((opt) => {
              const selected =
                draft.thousandsSeparator === opt.value ||
                (draft.thousandsSeparator === "" && opt.value === " ");
              const disabled = !draft.formatNumbers;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate("thousandsSeparator", opt.value)}
                  aria-pressed={selected}
                  disabled={disabled}
                  className={`border-0 px-3 py-1.5 font-mono text-sm ${
                    disabled
                      ? "cursor-not-allowed bg-surface-2 text-muted opacity-50"
                      : selected
                        ? "cursor-pointer bg-accent/15 text-accent"
                        : "cursor-pointer bg-surface-2 text-fg hover:bg-surface-3"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
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
  username,
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
  cloudReauthAutoOpen,
  onSetCloudReauthAutoOpen,
  cloudOfflineMode,
  onSetCloudOfflineMode,
  onDeleteAccount,
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
  username: string;
  data: UserData;
  onImport: (data: UserData) => void;
  backupsSupported: boolean;
  onOpenBackups: () => void;
  getEncryptionPassword: () => string | null;
  onUpdate: Update;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => Promise<void>;
  onDisconnectGdrive: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
  cloudReauthAutoOpen: boolean;
  onSetCloudReauthAutoOpen: (on: boolean) => void;
  cloudOfflineMode: boolean;
  onSetCloudOfflineMode: (on: boolean) => void;
  onDeleteAccount: (password: string) => Promise<void>;
}) {
  const t = useT();
  // OAuth errors from the Google Drive popup land here. The GIS
  // script is served from accounts.google.com, so a content blocker
  // or restrictive network can reject it — silently swallowing that
  // upstream meant picking "Google Drive" looked like a no-op.
  const [gdriveConnectError, setGdriveConnectError] = useState<string | null>(
    null,
  );
  const connectGdriveWithErrorCapture = async (): Promise<void> => {
    setGdriveConnectError(null);
    try {
      await onConnectGdrive();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      storageTabLog.warn(`gdrive connect failed: ${message}`);
      setGdriveConnectError(message);
    }
  };
  return (
    <>
      <Section title={t("settings.tabs.storage")}>
        <Field label={t("settings.tabs.storage")}>
          <BackendPicker
            value={backend}
            onSelect={(next) => {
              if (next !== "gdrive") setGdriveConnectError(null);
              if (next === "browser") onSelectBrowser();
              else if (next === "folder") onConnectFolder();
              else if (next === "dropbox") onConnectDropbox();
              else void connectGdriveWithErrorCapture();
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
          {gdriveConnectError && (
            <p
              role="alert"
              className="rounded border border-danger/50 px-2 py-1.5 text-xs break-words text-danger"
            >
              {gdriveConnectError}
            </p>
          )}
        </Field>
        {backend === "folder" && (
          <div className="flex items-center gap-2">
            {folderConnected ? (
              <Button variant="secondary" onClick={onDisconnectFolder}>
                {t("settings.storage.disconnectFolder")}
              </Button>
            ) : folderReconnectNeeded ? (
              <Button variant="primary" onClick={onReconnectFolder}>
                {t("settings.storage.cloudReconnect")}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={onConnectFolder}
                disabled={!folderAvailable}
              >
                {t("settings.storage.pickFolder")}
              </Button>
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
              cloudBackend === "dropbox"
                ? onConnectDropbox
                : () => void connectGdriveWithErrorCapture();
            const onDisconnect =
              cloudBackend === "dropbox"
                ? onDisconnectDropbox
                : onDisconnectGdrive;
            return (
              <div className="flex items-center gap-2">
                {connected ? (
                  <Button variant="secondary" onClick={onDisconnect}>
                    {t("settings.storage.cloudDisconnect")} {copy.name}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={onConnect}>
                    {t("settings.storage.cloudConnect")} {copy.name}
                  </Button>
                )}
                {connected && (
                  <span className="text-xs text-success">
                    {t("common.connected")}
                  </span>
                )}
              </div>
            );
          })()}
        {(backend === "dropbox" || backend === "gdrive") && (
          <>
            <ToggleRow
              label={t("settings.storage.offlineModeTitle")}
              hint={t("settings.storage.offlineModeHint")}
              checked={cloudOfflineMode}
              onChange={onSetCloudOfflineMode}
            />
            <ToggleRow
              label={t("settings.storage.reauthAutoOpenTitle")}
              hint={t("settings.storage.reauthAutoOpenHint")}
              checked={cloudReauthAutoOpen}
              onChange={onSetCloudReauthAutoOpen}
            />
          </>
        )}
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

      <Section title={t("settings.storage.dangerZoneTitle")}>
        <DeleteAccountForm
          username={username}
          isGuest={isGuest}
          onConfirm={onDeleteAccount}
        />
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
  onSetPresetTypeKind,
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
  onSetPresetTypeKind: (
    presetId: string,
    kind: "income" | "expense" | "any",
  ) => void;
}) {
  const t = useT();
  return (
    <Section title={t("settings.categoriesTab.title")}>
      <CategoriesAndTypesAdmin
        userCategories={data.categories}
        userTypes={data.types}
        hiddenPresetCategoryIds={data.hiddenPresetCategoryIds}
        hiddenPresetTypeIds={data.hiddenPresetTypeIds}
        presetTypeKindOverrides={data.presetTypeKindOverrides}
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

export function AppearanceTab({
  draft,
  onUpdate,
}: {
  draft: Settings;
  onUpdate: Update;
}) {
  const t = useT();
  const isCustom = draft.theme === "custom";

  function handleThemeChange(next: ThemePreset) {
    if (next === "custom") {
      // First switch into Custom: pre-fill the colours from whichever
      // preset is currently effective so the first edit feels like a
      // tweak. Only fires when the colours are still pristine (match
      // one of the bundled preset palettes exactly) so repeated flips
      // don't trample user tweaks.
      const cur = draft.customTheme.colors;
      const isPristine = Object.values(PRESET_PALETTES).some((palette) =>
        COLOR_KEYS.every((k) => cur[k] === palette[k]),
      );
      if (isPristine) {
        const source =
          draft.theme !== "custom" && draft.theme !== "system"
            ? PRESET_PALETTES[draft.theme]
            : DEFAULT_CUSTOM_THEME_COLORS_DARK;
        onUpdate("customTheme", { ...draft.customTheme, colors: source });
      }
    }
    onUpdate("theme", next);
  }

  function updateCustom<K extends keyof CustomTheme>(
    key: K,
    value: CustomTheme[K],
  ): void {
    onUpdate("customTheme", { ...draft.customTheme, [key]: value });
  }

  function updateColor(key: keyof CustomThemeColors, value: string): void {
    onUpdate("customTheme", {
      ...draft.customTheme,
      colors: { ...draft.customTheme.colors, [key]: value },
    });
  }

  return (
    <>
      <Section title={t("settings.appearance.themeSection")}>
        <Field label={t("settings.appearance.modeLabel")}>
          <ThemeModeRow
            value={draft.theme}
            onChange={handleThemeChange}
            customColors={draft.customTheme.colors}
          />
          {draft.theme === "system" && (
            <p className="text-xs text-muted">
              {t("settings.appearance.themeSystemHint")}
            </p>
          )}
        </Field>
        {(themeFamily(draft.theme) === "dark" ||
          themeFamily(draft.theme) === "light") && (
          <Field label={t("settings.appearance.variantLabel")}>
            <ThemeVariantRow value={draft.theme} onChange={handleThemeChange} />
          </Field>
        )}
      </Section>

      <Section title={t("settings.appearance.fontSection")}>
        <Field label={t("settings.appearance.fontFamily")}>
          <SelectPicker
            value={draft.fontFamily}
            options={FONT_FAMILIES.map((f) => ({
              value: f.id,
              label: (
                <span style={{ fontFamily: f.stack }}>
                  {t(f.label as Parameters<typeof t>[0])}
                </span>
              ),
            }))}
            onChange={(v) => onUpdate("fontFamily", v as FontFamilyId)}
            ariaLabel={t("settings.appearance.fontFamily")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <p className="text-xs text-muted">
            {t("settings.appearance.fontHint")}
          </p>
        </Field>
        <Field label={t("settings.appearance.textSize")}>
          <SelectPicker
            value={draft.fontScale}
            options={FONT_SCALE_PRESETS.map((p) => ({
              value: p.scale,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("fontScale", v)}
            ariaLabel={t("settings.appearance.textSize")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
            panelClassName="font-mono tabular-nums"
          />
          <p className="text-xs text-muted">
            {t("settings.appearance.textSizeHint")}
          </p>
        </Field>
      </Section>

      {isCustom && (
        <>
          <Section title={t("settings.appearance.colorsSection")}>
            {COLOR_GROUPS.map((group) => (
              <Field
                key={group.id}
                label={t(
                  `settings.appearance.colorGroup.${group.id}` as Parameters<
                    typeof t
                  >[0],
                )}
              >
                <div className="flex flex-wrap gap-3">
                  {group.keys.map((k) => (
                    <ColorSwatchInput
                      key={k}
                      label={t(
                        `settings.appearance.color.${k}` as Parameters<
                          typeof t
                        >[0],
                      )}
                      value={draft.customTheme.colors[k]}
                      onChange={(c) => updateColor(k, c)}
                    />
                  ))}
                </div>
              </Field>
            ))}
          </Section>

          <Section title={t("settings.appearance.shapeSection")}>
            <Field label={t("settings.appearance.radius")}>
              <SegmentedRow
                value={draft.customTheme.radius}
                options={RADIUS_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.radius${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("radius", v)}
              />
            </Field>
            <Field label={t("settings.appearance.density")}>
              <SegmentedRow
                value={draft.customTheme.density}
                options={DENSITY_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.density${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("density", v)}
              />
            </Field>
            <Field label={t("settings.appearance.borderWidth")}>
              <SegmentedRow
                value={draft.customTheme.borderWidth}
                options={BORDER_WIDTH_PRESETS.map((p) => ({
                  value: p,
                  label: t(
                    `settings.appearance.borderWidth${capitalise(p)}` as Parameters<
                      typeof t
                    >[0],
                  ),
                }))}
                onChange={(v) => updateCustom("borderWidth", v)}
              />
            </Field>
            <ToggleRow
              label={t("settings.appearance.reduceMotion")}
              hint={t("settings.appearance.reduceMotionHint")}
              checked={draft.customTheme.reduceMotion}
              onChange={(v) => updateCustom("reduceMotion", v)}
            />
          </Section>
        </>
      )}
    </>
  );
}

function capitalise<S extends string>(s: S): Capitalize<S> {
  return (s.charAt(0).toUpperCase() + s.slice(1)) as Capitalize<S>;
}

// Per-preset display swatches for the theme picker buttons. Drawn
// from the same hex values the styles.css palette uses so a glance
// at the swatch row tells the user what they're picking. `system`
// renders the dark+light combo as a diagonal split so it reads as
// "either" without copying one of the preset's swatches verbatim;
// `custom` reads the user's palette so the swatch tracks edits live.
function ThemeSwatches({
  theme,
  customColors,
}: {
  theme: ThemePreset;
  customColors?: CustomThemeColors;
}) {
  if (theme === "system") {
    return (
      <span
        aria-hidden
        className="inline-block h-4 w-4 shrink-0 rounded-sm border border-line"
        style={{
          background:
            "linear-gradient(135deg, #1d2027 0 50%, #eef0f2 50% 100%)",
        }}
      />
    );
  }
  const palette =
    theme === "custom"
      ? (customColors ?? DEFAULT_CUSTOM_THEME_COLORS_DARK)
      : PRESET_PALETTES[theme];
  const tones =
    theme === "custom"
      ? [palette.pageBg, palette.surface, palette.accent, palette.flag]
      : [palette.pageBg, palette.surface, palette.fg, palette.accent];
  return (
    <span
      aria-hidden
      className="inline-flex h-4 gap-px overflow-hidden rounded-sm border border-line"
    >
      {tones.map((c, i) => (
        <span
          key={i}
          className="block h-full w-1.5"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

// Family-level swatch used by the mode row. Dark / Light show the
// family's default palette (One Dark / One Light); System keeps its
// diagonal split; Custom samples the user's current palette.
function ModeSwatches({
  family,
  customColors,
}: {
  family: ThemeFamily;
  customColors?: CustomThemeColors;
}) {
  return (
    <ThemeSwatches
      theme={FAMILY_DEFAULT_THEME[family]}
      customColors={customColors}
    />
  );
}

// Mode row — the broad family pick. Selecting a family the user is
// already in is a no-op (keeps the active variant); selecting a new
// family jumps to that family's default preset, which the variant
// row then lets the user fine-tune.
const MODE_ORDER: readonly ThemeFamily[] = [
  "dark",
  "light",
  "system",
  "custom",
];

function ThemeModeRow({
  value,
  onChange,
  customColors,
}: {
  value: ThemePreset;
  onChange: (next: ThemePreset) => void;
  customColors: CustomThemeColors;
}) {
  const t = useT();
  const activeFamily = themeFamily(value);
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {MODE_ORDER.map((family) => {
        const active = activeFamily === family;
        const base =
          "flex items-center gap-2 rounded border px-2 py-1.5 text-sm transition-opacity focus-visible:outline-none";
        const activeCls = "border-accent bg-surface-2 text-fg-bright";
        const inactiveCls =
          "border-line bg-transparent text-muted opacity-60 hover:opacity-100 hover:border-accent";
        const label = t(
          `settings.appearance.mode${capitalise(family)}` as Parameters<
            typeof t
          >[0],
        );
        return (
          <button
            key={family}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => {
              if (active) return;
              onChange(FAMILY_DEFAULT_THEME[family]);
            }}
            className={`${base} ${active ? activeCls : inactiveCls}`}
          >
            <ModeSwatches family={family} customColors={customColors} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Variant row — appears only when the active family has more than one
// theme to choose from (Dark or Light). Lists every preset in that
// family using the same swatch + label pattern as the mode row.
function ThemeVariantRow({
  value,
  onChange,
}: {
  value: ThemePreset;
  onChange: (next: ThemePreset) => void;
}) {
  const t = useT();
  const family = themeFamily(value);
  const variants =
    family === "dark" ? DARK_THEMES : family === "light" ? LIGHT_THEMES : null;
  if (!variants) return null;
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {variants.map((theme) => {
        const active = value === theme;
        const base =
          "flex items-center gap-2 rounded border px-2 py-1.5 text-sm transition-opacity focus-visible:outline-none";
        const activeCls = "border-accent bg-surface-2 text-fg-bright";
        const inactiveCls =
          "border-line bg-transparent text-muted opacity-60 hover:opacity-100 hover:border-accent";
        const label = t(
          `settings.appearance.theme${capitalise(theme)}` as Parameters<
            typeof t
          >[0],
        );
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(theme)}
            className={`${base} ${active ? activeCls : inactiveCls}`}
          >
            <ThemeSwatches theme={theme} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Generic three / four-button segmented control used by radius,
// density, and border-width pickers. Pattern mirrors the
// currency-position / decimal-separator rows in `FormatTab`.
function SegmentedRow<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex overflow-hidden rounded border border-line"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`cursor-pointer border-0 px-3 py-1.5 text-sm ${
              active
                ? "bg-accent/15 text-accent"
                : "bg-surface-2 text-fg hover:bg-surface-3"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Native `<input type="color">` wrapped in a labelled flex column.
// Native is the right call here: 18 colour controls × an 8-swatch
// palette grid would be overwhelming, and a user customising "exactly
// my shade of green" wants hex entry the OS already provides. The
// swatch itself doubles as the trigger — clicking opens the system
// colour picker.
function ColorSwatchInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <label className="flex flex-col items-start gap-1 text-xs text-muted">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-7 w-12 cursor-pointer rounded border border-line bg-transparent p-0"
      />
    </label>
  );
}

export function DeveloperTab() {
  const t = useT();
  const { captureLogs, setCaptureLogs } = useDevMode();
  return (
    <Section title={t("settings.developer.title")}>
      <p className="text-xs text-muted">{t("settings.developer.intro")}</p>
      <ToggleRow
        label={t("settings.developer.captureLogs")}
        hint={t("settings.developer.captureLogsHint")}
        checked={captureLogs}
        onChange={setCaptureLogs}
      />
    </Section>
  );
}

type LogFilter = "all" | LogLevel;

export function LogsTab() {
  const t = useT();
  // `version` is a tick that increments whenever the logger pushes or
  // clears — used to force this component to re-read `getLogs()`. A
  // ref-style subscription is simpler than mirroring the full buffer
  // into local state and lets the logger own the storage.
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [copyStatus, setCopyStatus] = useState<null | "copied" | "failed">(
    null,
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  // Track whether the user is currently scrolled to the bottom — only
  // auto-scroll new entries into view if they were already pinned
  // there, so reading earlier entries while logs stream in stays sane.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    return subscribeToLogs(() => setVersion((v) => v + 1));
  }, []);

  // `version` is the force-re-read signal — it bumps on every logger
  // push/clear so the memo recomputes against the latest buffer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allEntries = useMemo(() => getLogs(), [version]);
  const entries = useMemo(() => {
    if (filter === "all") return allEntries;
    return allEntries.filter((e) => e.level === filter);
  }, [allEntries, filter]);

  // Auto-scroll behaviour: after every render where new entries came
  // in, snap to the bottom if the user was already there.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    stickToBottomRef.current = atBottom;
  }

  async function handleCopy() {
    const text = entries.map(formatLogLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }

  return (
    <Section title={t("settings.logs.title")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Field label={t("settings.logs.filterLabel")}>
          <SelectPicker<LogFilter>
            value={filter}
            options={[
              { value: "all", label: t("settings.logs.filterAll") },
              { value: "info", label: t("settings.logs.filterInfo") },
              { value: "warn", label: t("settings.logs.filterWarn") },
              { value: "error", label: t("settings.logs.filterError") },
            ]}
            onChange={setFilter}
            ariaLabel={t("settings.logs.filterLabel")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
        </Field>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={entries.length === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("settings.logs.copy")}
          </button>
          <button
            type="button"
            onClick={clearLogs}
            disabled={allEntries.length === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("settings.logs.clear")}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {entries.length === 0
          ? t("settings.logs.empty")
          : t("settings.logs.entryCount", { count: entries.length })}
        {copyStatus === "copied" && (
          <>
            {" — "}
            <span className="text-success">{t("settings.logs.copied")}</span>
          </>
        )}
        {copyStatus === "failed" && (
          <>
            {" — "}
            <span className="text-danger">{t("settings.logs.copyFailed")}</span>
          </>
        )}
      </p>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="max-h-[334px] overflow-y-auto rounded border border-line bg-surface font-mono text-xs"
      >
        {entries.length === 0 ? (
          <p className="px-2 py-3 text-muted">{t("settings.logs.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => (
              <li
                key={`${entry.ts}-${idx}`}
                className="flex flex-wrap items-baseline gap-2 border-b border-line px-2 py-1 last:border-b-0"
              >
                <span className="text-muted tabular-nums">
                  {formatLogTime(entry.ts)}
                </span>
                <span className={levelClass(entry.level)}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="text-path">[{entry.scope}]</span>
                <span className="break-words whitespace-pre-wrap text-fg">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatLogLine(entry: LogEntry): string {
  return `${formatLogTime(entry.ts)} [${entry.scope}] ${entry.level.toUpperCase()} ${entry.message}`;
}

function levelClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-danger";
    case "warn":
      return "text-flag";
    case "info":
      return "text-meta";
  }
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
