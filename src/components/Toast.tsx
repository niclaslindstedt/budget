import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ToastContext,
  type ToastContextValue,
  type ToastInput,
  type ToastKind,
} from "../hooks/useToast";
import { useT } from "../i18n";

// General-purpose toast notifications. Mounted by `LanguageRoot`
// alongside `UpdateToast` / `InstallPrompt` so `useToast()` is
// available on every route (pre-auth, post-auth, SEO aliases). The
// viewport anchors via the shared `--toast-stack-bottom` custom
// property (defined in `src/styles.css`), which sits above the
// BottomBar when one is mounted and visible and falls back to the
// safe-area inset on routes without a bar (pre-auth, `/privacy/`,
// `/system/`) and on mobile viewports where an open modal hides
// the bar. `z-[70]` keeps the stack above the PWA prompts at
// `z-[60]` so the floating chrome stays legible.
//
// Visual shell mirrors `UpdateToast` and `InstallPrompt` so the three
// stay visually coherent — `rounded border border-line bg-surface
// text-fg shadow-md`. The variant kind (`info`/`success`/`warning`/
// `error`) is communicated by a 2px left stripe coloured via CSS
// tokens (`--link` / `--success` / `--meta` / `--danger`) so themes
// and the Custom-theme palette flow through automatically.
//
// Auto-dismiss respects `[data-reduce-motion="true"]` because the
// global rule in `src/styles.css` already zeroes every transition
// duration; nothing extra is needed here beyond not bypassing the
// guard with `!important`.

type ToastItem = {
  id: number;
  kind: ToastKind;
  message: string;
  durationMs: number;
};

const DEFAULT_DURATION_MS = 4000;
const ERROR_DURATION_MS = 6000;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((input: ToastInput): number => {
    const id = nextId.current++;
    const kind = input.kind ?? "info";
    const durationMs =
      input.durationMs ??
      (kind === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
    setToasts((current) => {
      const next = [
        ...current,
        { id, kind, message: input.message, durationMs },
      ];
      // Cap the visible stack. Oldest entries drop off so a flurry of
      // events doesn't pile up beyond the user's ability to read.
      return next.length > MAX_VISIBLE
        ? next.slice(next.length - MAX_VISIBLE)
        : next;
    });
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ push, dismiss }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const t = useT();
  if (toasts.length === 0) return null;
  return (
    <div
      role="region"
      aria-label={t("toast.region")}
      data-toast-stack
      className="pointer-events-none fixed right-3 bottom-[var(--toast-stack-bottom)] z-[70] flex flex-col-reverse gap-2"
    >
      {toasts.map((toast) => (
        <ToastItemView key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItemView({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const t = useT();
  useEffect(() => {
    const handle = window.setTimeout(
      () => onDismiss(toast.id),
      toast.durationMs,
    );
    return () => window.clearTimeout(handle);
  }, [toast.id, toast.durationMs, onDismiss]);

  // Token map keyed by toast kind. Held in JS so the stripe colour is
  // picked from CSS variables at render time and follows the active
  // theme (including the Custom theme) without a per-kind className.
  const stripeVar =
    toast.kind === "success"
      ? "var(--success)"
      : toast.kind === "warning"
        ? "var(--meta)"
        : toast.kind === "error"
          ? "var(--danger)"
          : "var(--link)";

  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      aria-live={toast.kind === "error" ? "assertive" : "polite"}
      className="pointer-events-auto flex max-w-sm items-start gap-3 overflow-hidden rounded border border-line bg-surface pr-2 text-fg shadow-md"
    >
      <span
        aria-hidden
        className="self-stretch"
        style={{ width: "2px", background: stripeVar }}
      />
      <span className="flex-1 py-2 pr-1 text-sm">{toast.message}</span>
      <button
        type="button"
        aria-label={t("toast.dismiss")}
        className="-mr-1 px-1 py-2 text-muted hover:text-fg"
        onClick={() => onDismiss(toast.id)}
      >
        ×
      </button>
    </div>
  );
}
