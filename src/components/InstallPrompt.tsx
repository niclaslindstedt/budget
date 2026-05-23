import { useEffect, useRef, useState } from "react";

import { INSTALL_HINT_DISMISSED_KEY } from "../data/constants";
import { useT, type TFunction } from "../i18n";

// PWA install affordance. Two browser families behave differently here:
//
//   * iOS Safari has no programmatic install API — the user has to walk
//     Share → "Add to Home Screen" themselves. We detect the
//     environment by user agent and show a banner pointing at the
//     Share glyph.
//   * Chromium-based browsers (Chrome / Edge / Android Chrome / Brave …)
//     fire the `beforeinstallprompt` event when their install criteria
//     are met. We capture the event, suppress the browser's default
//     mini-infobar, and surface the same banner with an "Install"
//     button that replays the captured event on click.
//
// Both paths share the visual shell so the install experience looks
// the same regardless of browser. Mounted by `LanguageRoot` next to
// `UpdateToast` so it renders on every route (pre-auth, post-auth,
// and SEO aliases).
//
// Dismissal is sticky per-device under `INSTALL_HINT_DISMISSED_KEY`
// (storage string preserved as the historical
// `budget.iosInstallHintDismissed`, since the iOS-only hint shipped
// first). The flag does not ride along in budget export / import.

const SHOW_DELAY_MS = 2500;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type StandaloneNavigator = Navigator & { standalone?: boolean };

type Mode = "ios" | "chromium";

function isIosSafari(): boolean {
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
  return (
    /Safari/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|LinkedInApp|Line|Twitter|Snapchat/.test(
      ua,
    )
  );
}

function isAlreadyInstalled(): boolean {
  if (typeof window === "undefined") return true;
  const nav = window.navigator as StandaloneNavigator;
  if (nav.standalone === true) return true;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return false;
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed(): void {
  try {
    window.localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, "1");
  } catch {
    // Storage unavailable (private mode etc.) — the banner will
    // reappear next session, which is a benign degradation.
  }
}

export function InstallPrompt() {
  const t = useT();
  const [mode, setMode] = useState<Mode | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isAlreadyInstalled() || readDismissed()) return;

    // Chromium: capture the install event for later replay.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setMode((current) => current ?? "chromium");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Hide and persist when the install completes via any path
    // (our button, the browser's own UI, the OS, …).
    const onAppInstalled = () => {
      persistDismissed();
      deferredPromptRef.current = null;
      setMode(null);
    };
    window.addEventListener("appinstalled", onAppInstalled);

    // iOS: no event — fall back to UA detection after a delay so the
    // banner doesn't pop in the user's face on first paint.
    let timeout: number | undefined;
    if (isIosSafari()) {
      timeout = window.setTimeout(() => {
        setMode((current) => current ?? "ios");
      }, SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    persistDismissed();
    setMode(null);
  };

  const install = async () => {
    const evt = deferredPromptRef.current;
    if (!evt) {
      setMode(null);
      return;
    }
    try {
      await evt.prompt();
      // `appinstalled` will fire and clean up if the user accepts.
      // If they cancel, the deferred event is single-use either way.
      await evt.userChoice;
    } catch {
      // Replay can fail (already used, browser quirks); silently
      // collapse the banner — the browser still offers its own
      // install entry point.
    } finally {
      deferredPromptRef.current = null;
      setMode(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("pwa.installTitle")}
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-start gap-3 rounded border border-line bg-surface px-3 py-2 text-fg shadow-md"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">{t("pwa.installTitle")}</span>
        {mode === "ios" ? <IosBody t={t} /> : <ChromiumBody t={t} />}
      </div>
      {mode === "chromium" ? (
        <button
          type="button"
          className="text-sm text-accent hover:underline"
          onClick={install}
        >
          {t("pwa.install")}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={t("pwa.installDismiss")}
        className="-mr-1 px-1 text-muted hover:text-fg"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}

function IosBody({ t }: { t: TFunction }) {
  // Split the body string around the `{share}` sentinel so the iOS
  // share glyph renders inline at the right spot. `t()` leaves the
  // literal `{share}` in place when no matching param is supplied
  // (see `formatString` in `src/i18n/index.ts`).
  const [bodyBefore, bodyAfter = ""] = t("pwa.iosInstallBody").split("{share}");
  return (
    <span className="text-sm text-muted">
      {bodyBefore}
      <IosShareGlyph />
      {bodyAfter}
    </span>
  );
}

function ChromiumBody({ t }: { t: TFunction }) {
  return <span className="text-sm text-muted">{t("pwa.installBody")}</span>;
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
