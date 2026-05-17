import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, X } from "lucide-react";

import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  NUMBER_FORMATS,
  SHORT_DATE_FORMATS,
  type NumberFormatPreset,
  SESSION_TIMEOUT_PRESETS,
} from "../data/constants";
import type {
  DateFormat,
  DecimalSeparator,
  Settings,
  ShortDateFormat,
  ThousandsSeparator,
} from "../data/types";
import type { BackendId, EncryptionMode } from "../storage/backend-preference";
import { withCurrency } from "../utils/format";
import { useBodyScrollLock } from "../utils/scroll-lock";
import { BackendPicker } from "./BackendPicker";

type Props = {
  open: boolean;
  settings: Settings;
  backend: BackendId;
  dropboxConnected: boolean;
  encryption: EncryptionMode;
  // True when the active user is the no-password "guest" account.
  // Disables the encryption toggle (there's no key to derive without
  // a password) and tweaks the help text to point at "Create account".
  isGuest: boolean;
  onClose: () => void;
  onSave: (next: Settings) => void;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onSelectLocal: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
};

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
  encryption,
  isGuest,
  onClose,
  onSave,
  onConnectDropbox,
  onDisconnectDropbox,
  onSelectLocal,
  onSetEncryption,
}: Props) {
  // Local draft so cancelling discards localization changes. Re-syncs
  // each time the modal opens with whatever the store holds.
  const [draft, setDraft] = useState<Settings>(settings);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="settings-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <MainView
            draft={draft}
            backend={backend}
            dropboxConnected={dropboxConnected}
            encryption={encryption}
            isGuest={isGuest}
            onUpdate={update}
            onApplyNumberFormat={applyNumberFormat}
            onApplyDecimal={applyDecimal}
            onConnectDropbox={onConnectDropbox}
            onDisconnectDropbox={onDisconnectDropbox}
            onSelectLocal={onSelectLocal}
            onSetEncryption={onSetEncryption}
          />
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
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
        </footer>
      </div>
    </div>
  );
}

function MainView({
  draft,
  backend,
  dropboxConnected,
  encryption,
  isGuest,
  onUpdate,
  onApplyNumberFormat,
  onApplyDecimal,
  onConnectDropbox,
  onDisconnectDropbox,
  onSelectLocal,
  onSetEncryption,
}: {
  draft: Settings;
  backend: BackendId;
  dropboxConnected: boolean;
  encryption: EncryptionMode;
  isGuest: boolean;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onApplyNumberFormat: (id: string) => void;
  onApplyDecimal: (d: DecimalSeparator) => void;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onSelectLocal: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
}) {
  const numberPreviewSample = 1234567.89;
  const datePreviewIso = "2026-05-16";

  return (
    <div className="flex flex-col">
      <Section title="Month">
        <Field label="Start of month">
          <select
            value={draft.startOfMonth}
            onChange={(e) => onUpdate("startOfMonth", Number(e.target.value))}
            className="field-input w-24 cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm tabular-nums text-fg-bright"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Day each month is considered to begin. Default 25 matches a Swedish
            payday.
          </p>
        </Field>
      </Section>

      <Section title="Date">
        <Field label="Date format">
          <select
            value={draft.dateFormat}
            onChange={(e) =>
              onUpdate("dateFormat", e.target.value as DateFormat)
            }
            className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm tabular-nums text-fg-bright"
          >
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <Preview>
            {formatDatePreview(datePreviewIso, draft.dateFormat)}
          </Preview>
        </Field>

        <Field label="Short date format">
          <select
            value={draft.shortDateFormat}
            onChange={(e) =>
              onUpdate("shortDateFormat", e.target.value as ShortDateFormat)
            }
            className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm tabular-nums text-fg-bright"
          >
            {SHORT_DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
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
          <select
            value={presetIdFor(draft)}
            onChange={(e) => onApplyNumberFormat(e.target.value)}
            className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm tabular-nums text-fg-bright"
          >
            {NUMBER_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
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
      </Section>

      <Section title="Storage">
        <Field label="Backend">
          <BackendPicker
            value={backend}
            onSelect={(next) => {
              if (next === "local") onSelectLocal();
              else onConnectDropbox();
            }}
          />
          <p className="text-xs text-muted">
            {backend === "dropbox"
              ? dropboxConnected
                ? "Synced to your Dropbox app folder every few minutes, or when you press Save."
                : "Authorize to keep your budget in your Dropbox app folder."
              : "Stored locally in this browser. Export to JSON to move it elsewhere."}
          </p>
        </Field>
        {backend === "dropbox" && (
          <div className="flex items-center gap-2">
            {dropboxConnected ? (
              <button
                type="button"
                onClick={onDisconnectDropbox}
                className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
              >
                Disconnect Dropbox
              </button>
            ) : (
              <button
                type="button"
                onClick={onConnectDropbox}
                className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
              >
                Connect Dropbox
              </button>
            )}
            {dropboxConnected && (
              <span className="text-xs text-success">Connected</span>
            )}
          </div>
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
                ? "Your budget is wrapped in AES-GCM with a PBKDF2-derived key from your account password before being written — whether the bytes land in this browser or in your Dropbox app folder."
                : "Your budget is written as plain JSON — to this browser, or to your Dropbox app folder if connected. Anyone with access to those bytes can read it without your password."}
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
          <select
            value={draft.sessionTimeoutMinutes}
            onChange={(e) =>
              onUpdate("sessionTimeoutMinutes", Number(e.target.value))
            }
            className="field-input cursor-pointer rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm tabular-nums text-fg-bright"
          >
            {SESSION_TIMEOUT_PRESETS.map((p) => (
              <option key={p.minutes} value={p.minutes}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Sign you out after this long without input. The clock resets on
            every click or keystroke, and you&apos;ll see a warning a minute
            before the deadline.
          </p>
        </Field>
      </Section>

      {/* Opens in a new tab so an in-flight settings edit isn't lost
          when the user navigates away to read these. The schema page
          exposes the JSON Schema for the exported data so an LLM (or
          any other tool) handed a `budget-*.json` file can be pointed
          at a stable URL describing its shape. */}
      <p className="mt-4 flex items-center justify-center gap-3 text-center text-xs text-muted">
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
      </p>
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
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span className="flex flex-col">
        <span className="text-sm text-fg">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
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
