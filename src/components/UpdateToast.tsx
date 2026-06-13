import { useT } from "../i18n";
import { usePwaUpdate } from "../hooks";

// Soft "a new build is ready, click to reload" prompt. Mounted by
// `LanguageRoot` so it renders pre-auth, post-auth, and on every
// prerendered SEO alias (`/privacy/`, `/system/`).
//
// The service-worker registration, update polling, and download-
// progress tracking all live in the `usePwaUpdate` store
// (`src/hooks/usePwaUpdate.ts`); this component is just the completion
// CTA. While a new build downloads, the header "budget" wordmark fills
// gold from the bottom (also driven by `usePwaUpdate`); once it is full
// this toast appears so the user can apply the update at a moment of
// their choosing.
export function UpdateToast() {
  const t = useT();
  const { needRefresh, incomingVersion, reload, dismiss } = usePwaUpdate();

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
        onClick={reload}
      >
        {t("pwa.reload")}
      </button>
      <button
        type="button"
        aria-label={t("pwa.dismiss")}
        className="hit-24 inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:text-fg"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}
