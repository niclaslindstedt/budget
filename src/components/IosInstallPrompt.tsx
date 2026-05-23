import { useEffect, useState } from "react";

import { IOS_INSTALL_HINT_DISMISSED_KEY } from "../data/constants";
import { useT } from "../i18n";

// iOS Safari does not fire `beforeinstallprompt` like Chromium does —
// there is no programmatic install API on iOS, so users have to walk
// the Share → "Add to Home Screen" path themselves to install a PWA.
// This component detects that environment (iOS Safari, not already
// running standalone, hint not previously dismissed) and surfaces a
// non-blocking bottom-centered banner showing the iOS share glyph and
// the step. Mounted by `LanguageRoot` next to `UpdateToast` so it
// renders on every route (pre-auth, post-auth, and SEO aliases).
//
// Dismissal is sticky per-device — stored under
// `IOS_INSTALL_HINT_DISMISSED_KEY` so the hint never returns on that
// browser. It does not ride along in budget export / import (it's
// device-local UI state, not data).

const SHOW_DELAY_MS = 2500;

type StandaloneNavigator = Navigator & { standalone?: boolean };

function detectShouldShow(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPhone / iPod always identify themselves; iPad on iPadOS 13+
  // masquerades as "MacIntel" with multi-touch, so fall back to that
  // pair so iPad users see the hint too.
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  if (!isIosDevice) return false;
  // Only Safari installs PWAs as standalone on iOS. In-app browsers
  // (Chrome's CriOS, Firefox's FxiOS, Edge's EdgiOS, the Facebook /
  // Instagram / LinkedIn webviews) cannot, so showing the hint there
  // would mislead the user.
  const isSafari =
    /Safari/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|LinkedInApp|Line|Twitter|Snapchat/.test(
      ua,
    );
  if (!isSafari) return false;
  // Already running as a home-screen PWA — nothing to install.
  const nav = window.navigator as StandaloneNavigator;
  if (nav.standalone === true) return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return false;
  try {
    if (window.localStorage.getItem(IOS_INSTALL_HINT_DISMISSED_KEY) === "1") {
      return false;
    }
  } catch {
    // Private-mode quirks etc. — fall through and show the hint; the
    // dismissal write will fail silently below and the hint will
    // reappear next session, which is acceptable.
  }
  return true;
}

export function IosInstallPrompt() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!detectShouldShow()) return;
    const handle = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(IOS_INSTALL_HINT_DISMISSED_KEY, "1");
    } catch {
      // Ignore — the hint will reappear next session if storage is
      // unavailable, which is a benign degradation.
    }
    setVisible(false);
  };

  // Split the body string around the `{share}` sentinel so the iOS
  // share glyph renders inline at the right spot. `t()` leaves the
  // literal `{share}` in place when no matching param is supplied
  // (see `formatString` in `src/i18n/index.ts`).
  const [bodyBefore, bodyAfter = ""] = t("pwa.iosInstallBody").split("{share}");

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("pwa.iosInstallTitle")}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-start gap-3 rounded border border-line bg-surface px-3 py-2 text-fg shadow-md"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">
          {t("pwa.iosInstallTitle")}
        </span>
        <span className="text-sm text-muted">
          {bodyBefore}
          <IosShareGlyph />
          {bodyAfter}
        </span>
      </div>
      <button
        type="button"
        aria-label={t("pwa.iosInstallDismiss")}
        className="-mr-1 px-1 text-muted hover:text-fg"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}

function IosShareGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mx-1 inline h-4 w-4 align-text-bottom text-accent"
    >
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6" />
    </svg>
  );
}
