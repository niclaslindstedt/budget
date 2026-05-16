import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, ShieldCheck, X } from "lucide-react";

import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  NUMBER_FORMATS,
  type NumberFormatPreset,
} from "../data/constants";
import type {
  DateFormat,
  DecimalSeparator,
  Settings,
  ThousandsSeparator,
} from "../data/types";

type Props = {
  open: boolean;
  settings: Settings;
  encryptionEnabled: boolean;
  onClose: () => void;
  onSave: (next: Settings) => void;
  onEnableEncryption: (password: string) => Promise<void>;
  onDisableEncryption: (password: string) => Promise<void>;
};

type View = "main" | "enable" | "disable";

const MIN_PASSWORD_LENGTH = 8;

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
  encryptionEnabled,
  onClose,
  onSave,
  onEnableEncryption,
  onDisableEncryption,
}: Props) {
  const [view, setView] = useState<View>("main");
  // Local draft so cancelling discards localization changes. Re-syncs
  // each time the modal opens with whatever the store holds.
  const [draft, setDraft] = useState<Settings>(settings);

  useEffect(() => {
    if (!open) return;
    setView("main");
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
            {view === "main"
              ? "Settings"
              : view === "enable"
                ? "Enable encryption"
                : "Disable encryption"}
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
          {view === "main" && (
            <MainView
              draft={draft}
              encryptionEnabled={encryptionEnabled}
              onUpdate={update}
              onApplyNumberFormat={applyNumberFormat}
              onApplyDecimal={applyDecimal}
              onEnable={() => setView("enable")}
              onDisable={() => setView("disable")}
            />
          )}
          {view === "enable" && (
            <EnableView
              onCancel={() => setView("main")}
              onSubmit={async (password) => {
                await onEnableEncryption(password);
                onClose();
              }}
            />
          )}
          {view === "disable" && (
            <DisableView
              onCancel={() => setView("main")}
              onSubmit={async (password) => {
                await onDisableEncryption(password);
                onClose();
              }}
            />
          )}
        </div>

        {view === "main" && (
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
        )}
      </div>
    </div>
  );
}

function MainView({
  draft,
  encryptionEnabled,
  onUpdate,
  onApplyNumberFormat,
  onApplyDecimal,
  onEnable,
  onDisable,
}: {
  draft: Settings;
  encryptionEnabled: boolean;
  onUpdate: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onApplyNumberFormat: (id: string) => void;
  onApplyDecimal: (d: DecimalSeparator) => void;
  onEnable: () => void;
  onDisable: () => void;
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
      </Section>

      <Section title="Security">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-pipe">
            {encryptionEnabled ? (
              <ShieldCheck size={20} aria-hidden focusable={false} />
            ) : (
              <Lock size={20} aria-hidden focusable={false} />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-fg-bright">
              Encrypted local storage
            </h3>
            <p className="mt-1 text-xs text-muted">
              Protect your budget on this device with a password. Data is
              encrypted with AES-GCM and a PBKDF2-derived key before being
              written to the browser&apos;s storage.
            </p>
            <p className="mt-2 text-xs text-muted">
              Status:{" "}
              <span
                className={encryptionEnabled ? "text-success" : "text-muted"}
              >
                {encryptionEnabled ? "On" : "Off"}
              </span>
            </p>
            <div className="mt-3">
              {encryptionEnabled ? (
                <button
                  type="button"
                  onClick={onDisable}
                  className="cursor-pointer rounded border border-line bg-surface-3 px-3 py-1.5 text-sm text-fg hover:border-danger hover:text-danger"
                >
                  Disable encryption
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onEnable}
                  className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
                >
                  Enable encryption
                </button>
              )}
            </div>
          </div>
        </div>
      </Section>
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

function EnableView({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch =
    confirm.length > 0 && password.length > 0 && password !== confirm;
  const canSubmit =
    !busy && password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setBusy(true);
      setError(null);
      try {
        await onSubmit(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [canSubmit, onSubmit, password],
  );

  return (
    <form
      id="budget-encryption-setup"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      <p className="text-xs text-muted">
        Pick a strong password — at least {MIN_PASSWORD_LENGTH} characters. If
        you forget it your budget cannot be recovered, so save it in a password
        manager.
      </p>

      {/* Stable identifier so the password manager can attach a
          credential to this form and surface the same entry on the
          unlock screen. Visually hidden via `sr-only` rather than the
          HTML `hidden` attribute — most password managers skip
          `display:none` fields because they look like CSRF tokens. */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value="budget"
        readOnly
        tabIndex={-1}
        className="sr-only"
      />

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">New password</span>
        <PasswordInput
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggleShow={() => setShow((v) => !v)}
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Confirm password</span>
        <PasswordInput
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
          show={show}
          onToggleShow={() => setShow((v) => !v)}
        />
      </label>

      {tooShort && (
        <p className="text-xs text-danger">
          Use at least {MIN_PASSWORD_LENGTH} characters.
        </p>
      )}
      {mismatch && (
        <p className="text-xs text-danger">Passwords do not match.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Encrypting…" : "Encrypt"}
        </button>
      </div>
    </form>
  );
}

function DisableView({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !busy && password.length > 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setBusy(true);
      setError(null);
      try {
        await onSubmit(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [canSubmit, onSubmit, password],
  );

  return (
    <form
      id="budget-encryption-disable"
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
    >
      <p className="text-xs text-muted">
        Enter your current password to remove encryption. After this, your
        budget will be stored in plain text in this browser&apos;s storage.
      </p>

      <input
        type="text"
        name="username"
        autoComplete="username"
        value="budget"
        readOnly
        tabIndex={-1}
        className="sr-only"
      />

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Current password</span>
        <PasswordInput
          name="current-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggleShow={() => setShow((v) => !v)}
          autoFocus
        />
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="cursor-pointer rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-sm font-bold text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Decrypting…" : "Disable"}
        </button>
      </div>
    </form>
  );
}

function PasswordInput({
  name,
  autoComplete,
  value,
  onChange,
  show,
  onToggleShow,
  autoFocus,
}: {
  name: string;
  autoComplete: "new-password" | "current-password";
  value: string;
  onChange: (next: string) => void;
  show: boolean;
  onToggleShow: () => void;
  autoFocus?: boolean;
}) {
  const inputId = useMemo(
    () => `pwd-${name}-${Math.random().toString(36).slice(2, 8)}`,
    [name],
  );
  return (
    <div className="relative flex items-center">
      <input
        id={inputId}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 pr-9 text-sm text-fg"
      />
      <button
        type="button"
        onClick={onToggleShow}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
      >
        {show ? (
          <EyeOff size={16} aria-hidden focusable={false} />
        ) : (
          <Eye size={16} aria-hidden focusable={false} />
        )}
      </button>
    </div>
  );
}
