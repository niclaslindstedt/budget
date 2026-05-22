import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Heart,
  ListChecks,
  LogOut,
  Menu,
  Redo2,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Trash2,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";

import type { StoredUser } from "../data/types";
import { useEscapeKey, usePointerOutside } from "../hooks";
import { useT } from "../i18n";

type Props = {
  user: StoredUser;
  hasOtherUsers: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectMode: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSelectMode: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
};

// Single burger menu in the page header. Houses everything that used
// to sit on the right side of the top bar (undo/redo, select rows,
// settings, account actions) plus the privacy / changelog / donate
// links that used to live in the Settings modal footer. The cloud /
// save indicator stays on the bar so the user can glance at sync
// state without opening anything.
export function HeaderMenu({
  user,
  hasOtherUsers,
  canUndo,
  canRedo,
  selectMode,
  onUndo,
  onRedo,
  onToggleSelectMode,
  onOpenSettings,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onDeleteAccount,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"main" | "delete">("main");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEscapeKey(open, close);
  usePointerOutside(open, [rootRef], close);

  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  const isGuest = user.isDefault === true;
  const donateUrl = import.meta.env.VITE_DONATE_URL?.trim();

  function pick(handler: () => void) {
    setOpen(false);
    handler();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("headerMenu.openMenu")}
        title={t("headerMenu.openMenu")}
        className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
          open
            ? "border-pipe bg-pipe/15 text-pipe"
            : "border-line text-muted hover:border-fg hover:bg-surface-2 hover:text-fg"
        }`}
      >
        <Menu size={18} aria-hidden focusable={false} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        >
          {view === "main" ? (
            <MainView
              user={user}
              isGuest={isGuest}
              hasOtherUsers={hasOtherUsers}
              canUndo={canUndo}
              canRedo={canRedo}
              selectMode={selectMode}
              donateUrl={donateUrl}
              onUndo={() => pick(onUndo)}
              onRedo={() => pick(onRedo)}
              onToggleSelectMode={() => pick(onToggleSelectMode)}
              onOpenSettings={() => pick(onOpenSettings)}
              onSignOut={() => pick(onSignOut)}
              onSwitchUser={() => pick(onSwitchUser)}
              onCreateAccount={() => pick(onCreateAccount)}
              onAskDelete={() => setView("delete")}
            />
          ) : (
            <DeleteView
              username={user.username}
              isGuest={isGuest}
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
  isGuest,
  hasOtherUsers,
  canUndo,
  canRedo,
  selectMode,
  donateUrl,
  onUndo,
  onRedo,
  onToggleSelectMode,
  onOpenSettings,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
  onAskDelete,
}: {
  user: StoredUser;
  isGuest: boolean;
  hasOtherUsers: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectMode: boolean;
  donateUrl: string | undefined;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSelectMode: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
  onAskDelete: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col">
      <div className="border-b border-line bg-surface-3 px-3 py-3">
        <p className="text-xs text-muted">
          {isGuest ? t("userMenu.guestMode") : t("userMenu.signedInAs")}
        </p>
        <p className="truncate text-sm font-bold text-fg-bright">
          {isGuest ? t("userMenu.guestNoAccount") : user.username}
        </p>
        {isGuest && (
          <p className="mt-1 text-xs text-muted">
            {t("userMenu.guestModeHint")}
          </p>
        )}
      </div>

      <MenuSection>
        <MenuItem
          icon={<Undo2 size={16} aria-hidden focusable={false} />}
          label={t("app.undo")}
          disabled={!canUndo}
          onClick={onUndo}
        />
        <MenuItem
          icon={<Redo2 size={16} aria-hidden focusable={false} />}
          label={t("app.redo")}
          disabled={!canRedo}
          onClick={onRedo}
        />
      </MenuSection>

      <MenuSection>
        <MenuItem
          icon={<ListChecks size={16} aria-hidden focusable={false} />}
          label={selectMode ? t("app.exitSelectMode") : t("app.selectRows")}
          onClick={onToggleSelectMode}
        />
        <MenuItem
          icon={<SettingsIcon size={16} aria-hidden focusable={false} />}
          label={t("app.settings")}
          onClick={onOpenSettings}
        />
      </MenuSection>

      <MenuSection>
        {!isGuest && (
          <MenuItem
            icon={<LogOut size={16} aria-hidden focusable={false} />}
            label={t("userMenu.signOut")}
            onClick={onSignOut}
          />
        )}
        {hasOtherUsers && (
          <MenuItem
            icon={<Users size={16} aria-hidden focusable={false} />}
            label={t("userMenu.switchUser")}
            onClick={onSwitchUser}
          />
        )}
        <MenuItem
          icon={<UserPlus size={16} aria-hidden focusable={false} />}
          label={
            isGuest ? t("userMenu.createAccount") : t("userMenu.createAnother")
          }
          onClick={onCreateAccount}
        />
      </MenuSection>

      <MenuSection>
        <MenuLink
          icon={<Shield size={16} aria-hidden focusable={false} />}
          label={t("settings.footer.privacy")}
          href="/privacy"
        />
        <MenuLink
          icon={<Sparkles size={16} aria-hidden focusable={false} />}
          label={t("settings.footer.changelog")}
          href="/changelog"
        />
        {donateUrl && (
          <MenuLink
            icon={
              <Heart
                size={16}
                className="text-danger"
                fill="currentColor"
                aria-hidden
              />
            }
            label={t("settings.storage.donate")}
            href={donateUrl}
            external
          />
        )}
      </MenuSection>

      <MenuSection>
        <MenuItem
          icon={<Trash2 size={16} aria-hidden focusable={false} />}
          label={
            isGuest ? t("userMenu.clearData") : t("userMenu.deleteThisAccount")
          }
          danger
          onClick={onAskDelete}
        />
      </MenuSection>
    </div>
  );
}

// Separator between groups of menu items. The first section drops its
// own top border so the user-info block above sits flush against it.
function MenuSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-line first:border-t-0">{children}</div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        disabled
          ? "cursor-not-allowed opacity-40"
          : "cursor-pointer hover:bg-surface-2"
      } ${danger ? "text-danger" : "text-fg"}`}
    >
      <span className={danger ? "text-danger" : "text-muted"}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuLink({
  icon,
  label,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target="_blank"
      rel={external ? "noreferrer noopener" : "noreferrer"}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </a>
  );
}

function DeleteView({
  username,
  isGuest,
  onCancel,
  onConfirm,
}: {
  username: string;
  isGuest: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => Promise<void>;
}) {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-3">
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
              autoFocus
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

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-xs text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          autoFocus={isGuest}
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
