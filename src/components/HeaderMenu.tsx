import { useCallback, useRef, useState } from "react";
import {
  Code2,
  Heart,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import type { StoredUser } from "../data/types";
import type { FloatingPlacement } from "../hooks";
import { useT } from "../i18n";
import { BUILD_LABEL } from "../utils/build-env";
import { FloatingPanel } from "./FloatingPanel";

type Props = {
  user: StoredUser;
  hasOtherUsers: boolean;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
};

// Single burger menu in the page header. Houses settings, account
// actions, and the privacy / changelog / donate links. Undo, redo,
// and select-mode live in the BottomBar at the foot of the viewport;
// the danger-zone "Clear data" / "Delete account" action lives in
// the Storage tab of Settings.
// Right-anchored 16rem-wide panel that opens just below the burger.
// The FloatingPanel hook clamps it into the viewport so it never
// drops off-screen.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 256 },
  anchor: "right",
  coordinateSpace: "viewport",
};

export function HeaderMenu({
  user,
  hasOtherUsers,
  onOpenSettings,
  onOpenChangelog,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const isGuest = user.isDefault === true;
  const donateUrl = import.meta.env.VITE_DONATE_URL?.trim();

  function pick(handler: () => void) {
    setOpen(false);
    handler();
  }

  return (
    <div ref={triggerRef} className="relative">
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
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
      >
        <div role="menu" className="w-full">
          <MainView
            user={user}
            isGuest={isGuest}
            hasOtherUsers={hasOtherUsers}
            donateUrl={donateUrl}
            onOpenSettings={() => pick(onOpenSettings)}
            onOpenChangelog={() => pick(onOpenChangelog)}
            onSignOut={() => pick(onSignOut)}
            onSwitchUser={() => pick(onSwitchUser)}
            onCreateAccount={() => pick(onCreateAccount)}
          />
        </div>
      </FloatingPanel>
    </div>
  );
}

function MainView({
  user,
  isGuest,
  hasOtherUsers,
  donateUrl,
  onOpenSettings,
  onOpenChangelog,
  onSignOut,
  onSwitchUser,
  onCreateAccount,
}: {
  user: StoredUser;
  isGuest: boolean;
  hasOtherUsers: boolean;
  donateUrl: string | undefined;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
  onSignOut: () => void;
  onSwitchUser: () => void;
  onCreateAccount: () => void;
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
          href={`${import.meta.env.BASE_URL}privacy`}
        />
        <MenuItem
          icon={<Sparkles size={16} aria-hidden focusable={false} />}
          label={t("settings.footer.changelog")}
          onClick={onOpenChangelog}
        />
        <MenuLink
          icon={<Code2 size={16} aria-hidden focusable={false} />}
          label={t("settings.footer.source")}
          href="https://github.com/niclaslindstedt/budget"
          external
          meta={BUILD_LABEL}
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
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuLink({
  icon,
  label,
  href,
  external,
  meta,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  external?: boolean;
  meta?: string;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target="_blank"
      rel={external ? "noreferrer noopener" : "noreferrer"}
      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
    >
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
      {meta && (
        <span className="ml-auto text-xs text-muted tabular-nums">{meta}</span>
      )}
    </a>
  );
}
