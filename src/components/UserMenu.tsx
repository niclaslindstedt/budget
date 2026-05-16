import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleUser,
  Eye,
  EyeOff,
  LogOut,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import type { StoredUser } from "../data/types";

type Props = {
  user: StoredUser;
  // True when there is more than one account on the device, so the
  // menu offers a "Switch user" affordance that signs out and lands
  // on the picker form.
  hasOtherUsers: boolean;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  // Verifies the password then deletes the account + its budget. The
  // dialog catches the rejection and shows the message verbatim.
  onDeleteAccount: (password: string) => Promise<void>;
};

// Account button in the page header. Click to open a small dropdown
// with the current user's name and the four destructive-or-navigation
// actions. The dropdown closes on Escape or click-outside; account
// deletion drops into a separate confirmation panel inside the same
// surface so the password prompt does not steal page focus.
export function UserMenu({
  user,
  hasOtherUsers,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onDeleteAccount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "delete">("main");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu (signed in as ${user.username})`}
        title={`Signed in as ${user.username}`}
        className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          open
            ? "border-pipe bg-pipe/15 text-pipe"
            : "border-line text-pipe hover:border-pipe hover:bg-surface-2"
        }`}
      >
        <CircleUser size={18} aria-hidden focusable={false} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        >
          {view === "main" ? (
            <MainView
              user={user}
              hasOtherUsers={hasOtherUsers}
              onSignOut={() => {
                setOpen(false);
                onSignOut();
              }}
              onSwitchUser={() => {
                setOpen(false);
                onSwitchUser();
              }}
              onCreateAccount={() => {
                setOpen(false);
                onCreateAccount();
              }}
              onAskDelete={() => setView("delete")}
            />
          ) : (
            <DeleteView
              username={user.username}
              onCancel={() => setView("main")}
              onConfirm={async (password) => {
                await onDeleteAccount(password);
                setOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MainView({
  user,
  hasOtherUsers,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onAskDelete,
}: {
  user: StoredUser;
  hasOtherUsers: boolean;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onAskDelete: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-line bg-surface-3 px-3 py-3">
        <p className="text-xs text-muted">Signed in as</p>
        <p className="truncate text-sm font-bold text-fg-bright">
          {user.username}
        </p>
      </div>
      <MenuItem
        icon={<LogOut size={16} aria-hidden focusable={false} />}
        label="Sign out"
        onClick={onSignOut}
      />
      {hasOtherUsers && (
        <MenuItem
          icon={<Users size={16} aria-hidden focusable={false} />}
          label="Switch user"
          onClick={onSwitchUser}
        />
      )}
      <MenuItem
        icon={<UserPlus size={16} aria-hidden focusable={false} />}
        label="Create another account"
        onClick={onCreateAccount}
      />
      <div className="border-t border-line">
        <MenuItem
          icon={<Trash2 size={16} aria-hidden focusable={false} />}
          label="Delete this account"
          danger
          onClick={onAskDelete}
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        danger ? "text-danger" : "text-fg"
      }`}
    >
      <span className={danger ? "text-danger" : "text-muted"}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DeleteView({
  username,
  onCancel,
  onConfirm,
}: {
  username: string;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
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
        await onConfirm(password);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [busy, password, onConfirm],
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2 text-danger">
        <AlertTriangle size={16} aria-hidden focusable={false} />
        <div className="flex-1">
          <p className="text-sm font-bold text-fg-bright">Delete account?</p>
          <p className="mt-1 text-xs text-muted">
            This permanently removes <strong>{username}</strong> and the budget
            data stored under it on this device.
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Confirm with password</span>
        <div className="relative flex items-center">
          <input
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
              <EyeOff size={14} aria-hidden focusable={false} />
            ) : (
              <Eye size={14} aria-hidden focusable={false} />
            )}
          </button>
        </div>
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-xs text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="cursor-pointer rounded border border-danger/60 bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </form>
  );
}
