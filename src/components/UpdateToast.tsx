import { useEffect, useRef, useState } from "react";
import type { Workbox } from "workbox-window";

import { useT } from "../i18n";

// Soft "a new build is ready, click to reload" prompt. Mounted by
// `LanguageRoot` so it renders pre-auth, post-auth, and on every
// prerendered SEO alias (`/privacy/`, `/system/`).
//
// We register the service worker ourselves via `workbox-window`
// rather than vite-plugin-pwa's `useRegisterSW` virtual module — the
// hook's auto-injected register call doesn't forward
// `updateViaCache: "none"` to the browser, so an HTTP-cached `sw.js`
// can satisfy update checks indefinitely (the SW spec only forces a
// cache bypass once the cached SW is over 24h old). With
// `updateViaCache: "none"` every `reg.update()` re-fetches the SW
// script from the network, so a tab that's been open long enough to
// have built up an HTTP cache still picks up new builds on the next
// poll.
//
// Update strategy stays "prompt": the new SW installs and parks in
// the `waiting` state, we flip `needRefresh` from the workbox
// `waiting` event, and the user clicks Reload at a moment of their
// choosing. We deliberately do NOT call `skipWaiting()` from the SW
// itself or set `clientsClaim` — the page would silently swap to new
// JS, breaking long-lived in-progress edits.
//
// Dismissals are per-SW: workbox fires `waiting` again every time a
// newer SW reaches the waiting state, so dismissing the toast hides
// the current notice but re-opens automatically when a fresher build
// arrives.
//
// Polling cadence: an immediate `reg.update()` once registration
// resolves so we don't rely solely on the browser's built-in initial
// check, then every 60 minutes while the tab is visible (plus on
// every `visibilitychange` to visible).
const HOUR_MS = 60 * 60 * 1000;

// The running bundle only knows its OWN version (`BUILD_LABEL`), which
// is the build the toast is upgrading AWAY from — naming it would tell
// the user they're "updating to" the version they're already on. The
// incoming build's version lives in `version.json`, deployed alongside
// the new SW; fetch it cache-bypassed so the still-active old SW lets
// the request reach the network and return the freshly-deployed file.
async function fetchIncomingVersion(base: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}version.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === "object" &&
      "version" in data &&
      typeof (data as { version: unknown }).version === "string"
    ) {
      return (data as { version: string }).version;
    }
    return null;
  } catch {
    // Offline, or a deploy predating version.json — fall back to the
    // version-less toast copy rather than guessing.
    return null;
  }
}

export function UpdateToast() {
  const t = useT();
  const [needRefresh, setNeedRefresh] = useState(false);
  const [incomingVersion, setIncomingVersion] = useState<string | null>(null);
  const wbRef = useRef<Workbox | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const base = import.meta.env.BASE_URL ?? "/";
    const swUrl = `${base}sw.js`;
    let cancelled = false;
    let cleanupFns: Array<() => void> = [];

    void import("workbox-window").then(({ Workbox }) => {
      if (cancelled) return;
      const wb = new Workbox(swUrl, {
        scope: base,
        type: "classic",
        // Bypass the HTTP cache when checking for a new SW. Without
        // this, GitHub Pages' default caching can serve the same
        // bytes back to the browser's update check and the new SW
        // never gets discovered until the cached SW is >24h old.
        updateViaCache: "none",
      });
      wbRef.current = wb;

      const onWaiting = () => {
        setNeedRefresh(true);
        void fetchIncomingVersion(base).then((version) => {
          if (!cancelled) setIncomingVersion(version);
        });
      };
      const onControlling = (event: { isUpdate?: boolean }) => {
        if (event.isUpdate) window.location.reload();
      };
      wb.addEventListener("waiting", onWaiting);
      wb.addEventListener("controlling", onControlling);
      cleanupFns.push(() => {
        wb.removeEventListener("waiting", onWaiting);
        wb.removeEventListener("controlling", onControlling);
      });

      wb.register()
        .then((reg) => {
          if (cancelled || !reg) return;
          void reg.update();
          const interval = window.setInterval(() => {
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
          cleanupFns.push(() => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisible);
          });
        })
        .catch(() => {
          // Registration errors are swallowed — same as
          // useRegisterSW's default. We surface no UI for "SW failed
          // to register" because the app still functions without it.
        });
    });

    return () => {
      cancelled = true;
      for (const fn of cleanupFns) fn();
      cleanupFns = [];
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-stack
      className="fixed inset-x-3 bottom-[var(--toast-stack-bottom)] z-[60] mx-auto flex max-w-md items-center gap-3 rounded border border-line bg-surface px-3 py-2 text-fg shadow-md"
    >
      <span className="text-sm">
        {incomingVersion
          ? t("pwa.updateReady", { version: incomingVersion })
          : t("pwa.updateReadyGeneric")}
      </span>
      <button
        type="button"
        className="cursor-pointer text-sm text-accent hover:underline"
        onClick={() => {
          const wb = wbRef.current;
          if (!wb) return;
          // Post SKIP_WAITING to the waiting SW. The `controlling`
          // listener above reloads the page once the new SW takes
          // control.
          wb.messageSkipWaiting();
        }}
      >
        {t("pwa.reload")}
      </button>
      <button
        type="button"
        aria-label={t("pwa.dismiss")}
        className="hit-24 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:text-fg"
        onClick={() => setNeedRefresh(false)}
      >
        ×
      </button>
    </div>
  );
}
