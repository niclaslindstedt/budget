import { useCallback, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

type Props = {
  // Resolves successfully when the supplied password decrypts the
  // stored envelope; rejects with an Error whose message is rendered
  // verbatim to the user. The parent owns the actual decryption
  // attempt so the unlock surface stays pure UI.
  onUnlock: (password: string) => Promise<void>;
};

// Full-page password prompt shown when the browser's storage holds an
// encrypted envelope and no password has been entered this session.
// Replaces the entire app surface until the user authenticates so no
// budget data is exposed before the key is known.
export function UnlockScreen({ onUnlock }: Props) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy || password.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        await onUnlock(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [busy, password, onUnlock],
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <form
        id="budget-unlock"
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-5 shadow-xl"
      >
        <div className="flex items-center gap-2 text-pipe">
          <Lock size={18} aria-hidden focusable={false} />
          <h1 className="text-sm font-bold tracking-wide text-fg-bright">
            Unlock budget
          </h1>
        </div>
        <p className="text-xs text-muted">
          Your budget is encrypted on this device. Enter your password to
          continue.
        </p>

        {/* Stable hidden identifier so password managers attach the
            credential to this form and surface the same entry that was
            saved during setup. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value="budget"
          readOnly
          hidden
          aria-hidden="true"
        />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Password</span>
          <div className="relative flex items-center">
            <input
              id="budget-unlock-password"
              name="current-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 pr-9 text-sm text-fg"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
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
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>

        <p className="text-center text-xs text-muted">
          Forgot your password? The data on this device cannot be recovered
          without it. You can clear it and start fresh from your browser&apos;s
          storage settings.
        </p>
      </form>
    </div>
  );
}
