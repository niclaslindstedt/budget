import { useCallback, useMemo, useState } from "react";
import { CircleUser, Eye, EyeOff, Lock, UserPlus } from "lucide-react";

import type { StoredUser } from "../data/types";
import { findUserByUsername } from "../storage/users";

const MIN_PASSWORD_LENGTH = 8;

type Mode = "sign-in" | "sign-up";

type Props = {
  users: readonly StoredUser[];
  // Username to pre-fill on the sign-in form, e.g. the last active
  // user pulled from the registry. Null means "let the user type it".
  initialUsername: string | null;
  // True when the legacy `budget.v1` bucket still has data the first
  // account can absorb. The sign-up view shows a checkbox in that case.
  legacyBudgetAvailable: boolean;
  // Resolves on success, rejects with a user-visible Error message.
  onSignIn: (user: StoredUser, password: string) => Promise<void>;
  // `importLegacy` is honoured only when this is the first account
  // being created — the parent ignores it otherwise.
  onCreateAccount: (
    username: string,
    password: string,
    importLegacy: boolean,
  ) => Promise<void>;
};

export function AuthScreen({
  users,
  initialUsername,
  legacyBudgetAvailable,
  onSignIn,
  onCreateAccount,
}: Props) {
  // No accounts yet: the first thing the user has to do is set one
  // up. Subsequent visits default to the sign-in view.
  const [mode, setMode] = useState<Mode>(() =>
    users.length === 0 ? "sign-up" : "sign-in",
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {mode === "sign-in" ? (
          <SignInForm
            users={users}
            initialUsername={initialUsername}
            onSignIn={onSignIn}
            onSwitchToSignUp={() => setMode("sign-up")}
          />
        ) : (
          <SignUpForm
            usernameAlreadyTaken={(name) =>
              findUserByUsername(users, name) !== undefined
            }
            legacyBudgetAvailable={legacyBudgetAvailable && users.length === 0}
            firstAccount={users.length === 0}
            onCreate={onCreateAccount}
            onSwitchToSignIn={
              users.length === 0 ? null : () => setMode("sign-in")
            }
          />
        )}
      </div>
    </div>
  );
}

function SignInForm({
  users,
  initialUsername,
  onSignIn,
  onSwitchToSignUp,
}: {
  users: readonly StoredUser[];
  initialUsername: string | null;
  onSignIn: (user: StoredUser, password: string) => Promise<void>;
  onSwitchToSignUp: () => void;
}) {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy || password.length === 0 || username.length === 0) return;
      setBusy(true);
      setError(null);
      const user = findUserByUsername(users, username);
      if (!user) {
        setError("No account with that name on this device.");
        setBusy(false);
        return;
      }
      try {
        await onSignIn(user, password);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [busy, username, password, users, onSignIn],
  );

  return (
    <form
      id="budget-sign-in"
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-xl"
    >
      <div className="flex items-center gap-2 text-pipe">
        <Lock size={18} aria-hidden focusable={false} />
        <h1 className="text-sm font-bold tracking-wide text-fg-bright">
          Sign in
        </h1>
      </div>
      <p className="text-xs text-muted">
        Your budget is private to your account and encrypted on this device.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Username</span>
        <input
          id="budget-username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus={initialUsername === null}
          className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Password</span>
        <PasswordInput
          name="current-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggleShow={() => setShow((v) => !v)}
          autoFocus={initialUsername !== null}
        />
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy || password.length === 0 || username.length === 0}
        className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={onSwitchToSignUp}
        className="-mt-1 cursor-pointer text-center text-xs text-link hover:underline"
      >
        Create a new account
      </button>
    </form>
  );
}

function SignUpForm({
  usernameAlreadyTaken,
  legacyBudgetAvailable,
  firstAccount,
  onCreate,
  onSwitchToSignIn,
}: {
  usernameAlreadyTaken: (name: string) => boolean;
  legacyBudgetAvailable: boolean;
  firstAccount: boolean;
  onCreate: (
    username: string,
    password: string,
    importLegacy: boolean,
  ) => Promise<void>;
  onSwitchToSignIn: (() => void) | null;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [importLegacy, setImportLegacy] = useState(legacyBudgetAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = username.trim();
  const taken = trimmed.length > 0 && usernameAlreadyTaken(trimmed);
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch =
    confirm.length > 0 && password.length > 0 && password !== confirm;
  const canSubmit =
    !busy &&
    trimmed.length > 0 &&
    !taken &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setBusy(true);
      setError(null);
      try {
        await onCreate(trimmed, password, importLegacy);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [canSubmit, trimmed, password, importLegacy, onCreate],
  );

  return (
    <form
      id="budget-sign-up"
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-xl"
    >
      <div className="flex items-center gap-2 text-accent">
        <UserPlus size={18} aria-hidden focusable={false} />
        <h1 className="text-sm font-bold tracking-wide text-fg-bright">
          {firstAccount ? "Welcome — create your account" : "Create account"}
        </h1>
      </div>
      <p className="text-xs text-muted">
        Pick a username and a strong password — at least {MIN_PASSWORD_LENGTH}{" "}
        characters. Your budget is encrypted with this password; if you forget
        it the data on this device cannot be recovered.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Username</span>
        <input
          id="budget-new-username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Password</span>
        <PasswordInput
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggleShow={() => setShow((v) => !v)}
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

      {legacyBudgetAvailable && (
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={importLegacy}
            onChange={(e) => setImportLegacy(e.target.checked)}
            className="mt-1"
          />
          <span className="flex flex-col">
            <span className="text-sm text-fg">
              Import existing budget on this device
            </span>
            <span className="text-xs text-muted">
              A budget from before accounts were introduced was found. Bring it
              into this new account.
            </span>
          </span>
        </label>
      )}

      {taken && (
        <p className="text-xs text-danger">That username is already in use.</p>
      )}
      {tooShort && (
        <p className="text-xs text-danger">
          Use at least {MIN_PASSWORD_LENGTH} characters.
        </p>
      )}
      {mismatch && (
        <p className="text-xs text-danger">Passwords do not match.</p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create account"}
      </button>

      {onSwitchToSignIn && (
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="-mt-1 cursor-pointer text-center text-xs text-link hover:underline"
        >
          I already have an account
        </button>
      )}
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

// Re-exported icon name for the header button so callers don't have
// to know which lucide glyph stands in for the account widget.
export { CircleUser as UserIcon };
