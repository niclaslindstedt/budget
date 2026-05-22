import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { useT } from "../i18n";
import { BUILD_LABEL } from "../utils/build-env";

// Soft "a new build is ready, click to reload" prompt. Mounted by
// `LanguageRoot` so it renders pre-auth, post-auth, and on every
// prerendered SEO alias (`/privacy/`, `/changelog/`, `/system/`).
//
// Service worker registration is handled by the `useRegisterSW`
// virtual module from vite-plugin-pwa. With `registerType:
// "autoUpdate"`, `skipWaiting`, and `clientsClaim` (configured in
// `vite.config.ts`), the new SW activates and claims the open tab
// immediately — but the tab's JS bundle is still the old one until
// the user reloads. This toast surfaces a non-blocking prompt so
// the reload happens at a moment the user controls (we never want
// to refresh mid-edit). Dismissing the toast hides it until the
// next polling cycle finds another new build.
//
// Polling cadence: every 60 minutes while the tab is visible. Many
// builds per day means a tab left open without polling would never
// pick up the new bundle until the user navigated; visibility-gated
// polling keeps background tabs quiet but catches updates on
// active tabs within the hour.
const HOUR_MS = 60 * 60 * 1000;

export function UpdateToast() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          void reg.update();
        }
      }, HOUR_MS);
      const onVisible = () => {
        if (document.visibilityState === "visible") {
          void reg.update();
        }
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearInterval(interval);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
  });

  // No-op effect kept as a future seam (e.g. announcing the
  // available version to screen readers via aria-live region updates).
  useEffect(() => {}, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-3 bottom-3 z-[60] flex items-center gap-3 rounded border border-line bg-surface px-3 py-2 text-fg shadow-md"
    >
      <span className="text-sm">
        {t("pwa.updateReady", { version: BUILD_LABEL })}
      </span>
      <button
        type="button"
        className="text-sm text-accent hover:underline"
        onClick={() => updateServiceWorker(true)}
      >
        {t("pwa.reload")}
      </button>
      <button
        type="button"
        aria-label={t("pwa.dismiss")}
        className="text-muted hover:text-fg"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
}
