import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, ShieldCheck, X } from "lucide-react";

type Props = {
  open: boolean;
  encryptionEnabled: boolean;
  onClose: () => void;
  onEnableEncryption: (password: string) => Promise<void>;
  onDisableEncryption: (password: string) => Promise<void>;
};

type View = "main" | "enable" | "disable";

const MIN_PASSWORD_LENGTH = 8;

export function SettingsModal({
  open,
  encryptionEnabled,
  onClose,
  onEnableEncryption,
  onDisableEncryption,
}: Props) {
  const [view, setView] = useState<View>("main");

  useEffect(() => {
    if (!open) return;
    setView("main");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

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
              encryptionEnabled={encryptionEnabled}
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
      </div>
    </div>
  );
}

function MainView({
  encryptionEnabled,
  onEnable,
  onDisable,
}: {
  encryptionEnabled: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded border border-line bg-surface-2 p-3">
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
      </section>
    </div>
  );
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
