import { useCallback, useMemo, useState } from "react";
import { CircleUser, Eye, EyeOff, Lock, UserPlus } from "lucide-react";

import type { StoredUser } from "../data/types";
import { useT } from "../i18n";
import { findUserByUsername } from "../storage/users";
import { Checkbox, ClearableTextInput } from "./form";

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
  // True when a no-password "guest" account already exists. Used to
  // re-label the sign-up form ("your guest data will move into this
  // account") and to keep the "Continue without account" button live
  // post-sign-out.
  guestAvailable: boolean;
  // Resolves on success, rejects with a user-visible Error message.
  onSignIn: (user: StoredUser, password: string) => Promise<void>;
  // `importLegacy` is honoured only when this is the first real
  // account being created — the parent ignores it otherwise.
  onCreateAccount: (
    username: string,
    password: string,
    importLegacy: boolean,
  ) => Promise<void>;
  // Sign in to the no-password "guest" account, creating it if it
  // doesn't exist yet. Rejects with a user-visible Error message.
  onContinueWithoutAccount: () => Promise<void>;
};

export function AuthScreen({
  users,
  initialUsername,
  legacyBudgetAvailable,
  guestAvailable,
  onSignIn,
  onCreateAccount,
  onContinueWithoutAccount,
}: Props) {
  // Guest accounts don't count toward "there's someone to sign in
  // as" — they have no password, so the sign-in form has nothing to
  // pair with their username. Use real-user count to pick the
  // default form, suppress the "I already have an account" link, and
  // gate the username-taken check.
  const realUsers = useMemo(() => users.filter((u) => !u.isDefault), [users]);
  const noRealUsers = realUsers.length === 0;

  // No real accounts yet: the first thing the user has to do is set
  // one up (or continue as guest). Subsequent visits default to the
  // sign-in view.
  const [mode, setMode] = useState<Mode>(() =>
    noRealUsers ? "sign-up" : "sign-in",
  );

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        {mode === "sign-in" ? (
          <SignInForm
            users={realUsers}
            initialUsername={initialUsername}
            onSignIn={onSignIn}
            onSwitchToSignUp={() => setMode("sign-up")}
          />
        ) : (
          <SignUpForm
            usernameAlreadyTaken={(name) =>
              findUserByUsername(realUsers, name) !== undefined
            }
            legacyBudgetAvailable={legacyBudgetAvailable && noRealUsers}
            guestAvailable={guestAvailable && noRealUsers}
            firstAccount={noRealUsers}
            showGuestOption={noRealUsers}
            onCreate={onCreateAccount}
            onContinueWithoutAccount={onContinueWithoutAccount}
            onSwitchToSignIn={noRealUsers ? null : () => setMode("sign-in")}
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
  const t = useT();
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
        setError(t("auth.noAccount"));
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
    [busy, username, password, users, onSignIn, t],
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
          {t("auth.signIn")}
        </h1>
      </div>
      <p className="text-xs text-muted">{t("auth.privacyHint")}</p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("auth.username")}</span>
        <ClearableTextInput
          id="budget-username"
          name="username"
          autoComplete="username"
          value={username}
          onValueChange={setUsername}
          // Dedicated single-purpose sign-in form — landing focus on
          // the first empty field is the expected UX. The same is
          // assumed by every password manager.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={initialUsername === null}
          wrapperClassName="w-full"
          className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("auth.password")}</span>
        <PasswordInput
          name="current-password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          show={show}
          onToggleShow={() => setShow((v) => !v)}
          // When the username is pre-filled (returning user re-signing
          // in after a session expiry) the password is the only field
          // they need to touch — drop the cursor there directly.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={initialUsername !== null}
        />
      </label>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || password.length === 0 || username.length === 0}
        className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t("auth.signingIn") : t("auth.signIn")}
      </button>

      <button
        type="button"
        onClick={onSwitchToSignUp}
        className="-mt-1 cursor-pointer text-center text-xs text-link hover:underline"
      >
        {t("auth.createNewAccount")}
      </button>
    </form>
  );
}

function SignUpForm({
  usernameAlreadyTaken,
  legacyBudgetAvailable,
  guestAvailable,
  firstAccount,
  showGuestOption,
  onCreate,
  onContinueWithoutAccount,
  onSwitchToSignIn,
}: {
  usernameAlreadyTaken: (name: string) => boolean;
  legacyBudgetAvailable: boolean;
  // True when a no-password guest account already exists. Drives the
  // "your guest session will be carried into this account" line.
  guestAvailable: boolean;
  firstAccount: boolean;
  // Whether to surface the "Continue without account" link below the
  // form. Hidden once a real account exists on the device.
  showGuestOption: boolean;
  onCreate: (
    username: string,
    password: string,
    importLegacy: boolean,
  ) => Promise<void>;
  onContinueWithoutAccount: () => Promise<void>;
  onSwitchToSignIn: (() => void) | null;
}) {
  const t = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [importLegacy, setImportLegacy] = useState(legacyBudgetAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

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

  const handleGuest = useCallback(async () => {
    if (guestBusy) return;
    setGuestBusy(true);
    setGuestError(null);
    try {
      await onContinueWithoutAccount();
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : String(err));
      setGuestBusy(false);
    }
  }, [guestBusy, onContinueWithoutAccount]);

  return (
    <form
      id="budget-sign-up"
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-xl"
    >
      <div className="flex items-center gap-2 text-accent">
        <UserPlus size={18} aria-hidden focusable={false} />
        <h1 className="text-sm font-bold tracking-wide text-fg-bright">
          {firstAccount ? t("auth.welcomeTitle") : t("auth.createAccountTitle")}
        </h1>
      </div>
      <p className="text-xs text-muted">
        {t("auth.newAccountHint", { min: MIN_PASSWORD_LENGTH })}
        {guestAvailable && <> {t("auth.guestImportHint")}</>}
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("auth.username")}</span>
        <ClearableTextInput
          id="budget-new-username"
          name="username"
          autoComplete="username"
          value={username}
          onValueChange={setUsername}
          // Dedicated single-purpose create-account form — see note on
          // the sign-in field for the rationale.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          wrapperClassName="w-full"
          className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">{t("auth.password")}</span>
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
        <span className="text-xs text-muted">{t("auth.confirmPassword")}</span>
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
        <Checkbox
          checked={importLegacy}
          onChange={setImportLegacy}
          label={t("auth.importLegacyLabel")}
          description={t("auth.importLegacyHint")}
        />
      )}

      {taken && (
        <p role="alert" className="text-xs text-danger">
          {t("auth.accountTaken")}
        </p>
      )}
      {tooShort && (
        <p role="alert" className="text-xs text-danger">
          {t("auth.useAtLeast", { min: MIN_PASSWORD_LENGTH })}
        </p>
      )}
      {mismatch && (
        <p role="alert" className="text-xs text-danger">
          {t("auth.passwordsMismatch")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t("auth.creatingAccount") : t("auth.createAccount")}
      </button>

      {showGuestOption && (
        <>
          <button
            type="button"
            onClick={() => {
              void handleGuest();
            }}
            disabled={guestBusy}
            className="-mt-1 cursor-pointer text-center text-xs text-link hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guestBusy
              ? t("auth.loading")
              : guestAvailable
                ? t("auth.continueAsGuest")
                : t("auth.continueWithoutAccount")}
          </button>
          {guestError && (
            <p
              role="alert"
              className="-mt-2 text-center text-xs text-danger"
            >
              {guestError}
            </p>
          )}
        </>
      )}

      {onSwitchToSignIn && (
        <button
          type="button"
          onClick={onSwitchToSignIn}
          className="-mt-1 cursor-pointer text-center text-xs text-link hover:underline"
        >
          {t("auth.alreadyHaveAccount")}
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
  const t = useT();
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
        // The caller decides whether autoFocus is appropriate (see the
        // sign-in / create-account forms in this file).
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 pr-9 text-sm text-fg"
      />
      <button
        type="button"
        onClick={onToggleShow}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
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
