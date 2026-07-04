import { RotateCcw } from "lucide-react";

import { useT } from "../i18n";
import { usePwaUpdate } from "../hooks";
import { Button } from "./form/Button";

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
//
// The Update button carries the whole "apply it" affordance, so the
// message is a compact headline plus the incoming version on a second
// line (truncated so a long build label never wraps the toast) — we
// don't spell out "reload to apply" in the copy anymore.
export function UpdateToast() {
  const t = useT();
  const { needRefresh, incomingVersion, reload, dismiss } = usePwaUpdate();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-toast-stack
      className="fixed inset-x-3 bottom-[var(--toast-stack-bottom)] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-sm border border-line bg-surface px-3 py-2.5 text-fg shadow-md"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{t("pwa.updateReady")}</span>
        {incomingVersion && (
          <span className="truncate text-xs text-muted tabular-nums">
            {t("pwa.updateVersion", { version: incomingVersion })}
          </span>
        )}
      </div>
      <Button variant="primary" withIcon className="shrink-0" onClick={reload}>
        <RotateCcw className="h-4 w-4" />
        {t("pwa.updateAction")}
      </Button>
      <button
        type="button"
        aria-label={t("pwa.dismiss")}
        className="hit-24 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted hover:text-fg"
        onClick={dismiss}
      >
        ×
      </button>
    </div>
  );
}
