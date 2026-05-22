import { useCallback, useState } from "react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";

import { useT } from "../../i18n";

type Props = {
  username: string;
  isGuest: boolean;
  onConfirm: (password: string) => Promise<void>;
};

// Danger-zone form for clearing guest data or deleting the active
// account. Lives in the Storage tab because it's the same surface
// that owns the data itself — backups, encryption, import/export. The
// form is always visible (no collapse) so the user reads the warning
// before interacting; the password requirement (for non-guest) gates
// any accidental click on the submit button.
export function DeleteAccountForm({ username, isGuest, onConfirm }: Props) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !busy && (isGuest || password.length > 0);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      setBusy(true);
      setError(null);
      try {
        await onConfirm(isGuest ? "" : password);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [canSubmit, isGuest, password, onConfirm],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-start gap-2 text-danger">
        <AlertTriangle size={16} aria-hidden focusable={false} />
        <div className="flex-1">
          <p className="text-sm font-bold text-fg-bright">
            {isGuest
              ? t("userMenu.clearGuestTitle")
              : t("userMenu.deleteAccountTitle")}
          </p>
          <p className="mt-1 text-xs text-muted">
            {isGuest
              ? t("userMenu.clearGuestHint")
              : t("userMenu.deleteAccountHint", { username })}
          </p>
        </div>
      </div>

      {!isGuest && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">
            {t("userMenu.confirmWithPassword")}
          </span>
          <div className="relative flex items-center">
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 pr-9 text-sm text-fg"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={
                show ? t("auth.hidePassword") : t("auth.showPassword")
              }
              className="absolute right-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
            >
              {show ? (
                <EyeOff size={14} aria-hidden focusable={false} />
              ) : (
                <Eye size={14} aria-hidden focusable={false} />
              )}
            </button>
          </div>
        </label>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="cursor-pointer rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? isGuest
              ? t("userMenu.clearingData")
              : t("userMenu.deletingAccount")
            : isGuest
              ? t("userMenu.clearData")
              : t("userMenu.deleteThisAccount")}
        </button>
      </div>
    </form>
  );
}
