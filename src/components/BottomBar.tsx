import { History, ListChecks, Redo2, Search, Undo2 } from "lucide-react";

import { useIsStandalone, useScrollHide } from "../hooks";
import { useT } from "../i18n";
import { BulkActionBar } from "./BulkActionBar";
import { useModalDispatch } from "./modal-dispatch";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  selectMode: boolean;
  // Some sheet types (accounts, items) have no select-many concept, so
  // the toggle is disabled there rather than entering an empty mode.
  selectSupported: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSelectMode: () => void;

  bulkSelectedCount: number;
  onBulkEdit: () => void;
  // Omitted on pages whose rows can't move between months (salary).
  onBulkMove?: () => void;
  onBulkCopy?: () => void;
  onBulkDelete: () => void;
  onBulkCancel: () => void;
};

const actionButton =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted";

// Single solid bar pinned to the bottom of the viewport. The right edge
// holds the always-available search / undo / redo / history / select
// toggle; in select mode the bulk-action set takes the left half. Sheet
// switching lives in the header SheetSwitcher dropdown, not here — a
// horizontally scrolling tab strip inside this `position: sticky` bar
// knocked iOS WebKit off composited scrolling, dragging the whole chrome
// with the page, so the tabs moved to a portalled dropdown.
export function BottomBar({
  canUndo,
  canRedo,
  selectMode,
  selectSupported,
  onUndo,
  onRedo,
  onToggleSelectMode,
  bulkSelectedCount,
  onBulkEdit,
  onBulkMove,
  onBulkCopy,
  onBulkDelete,
  onBulkCancel,
}: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const selectLabel = !selectSupported
    ? t("app.selectUnavailable")
    : selectMode
      ? t("app.exitSelectMode")
      : t("app.selectRows");

  // Browser mode already gets a "hide on scroll" feel for free —
  // mobile Safari / Chrome's URL bar collapses on scroll down and
  // the bar's `translate-y-[calc(100dvh-100svh)]` rides that
  // collapse off-screen. In installed-PWA mode there's no URL bar,
  // so drive the same behaviour from JS: collapse the bar when the
  // user scrolls down past a threshold and bring it back on any
  // upward scroll. CSS in `styles.css` (inside the
  // `@media (display-mode: standalone)` block) does the actual
  // translate so the transition + reduce-motion guard stay in CSS.
  // The hook is gated on `useIsStandalone()` so the listener doesn't
  // even mount in browser mode where the CSS path already handles
  // it.
  const isStandalone = useIsStandalone();
  const hideOnScroll = useScrollHide({ enabled: isStandalone });

  return (
    // Two-mode positioning:
    //
    // Browser mode (Safari / Chrome / Firefox tab): `position:
    // sticky; bottom: 0` inside the flex column. The
    // `translate-y-[calc(100dvh-100svh)]` transform pushes the bar
    // down by exactly the floating Liquid Glass chrome's footprint
    // so it lands flush with the screen edge instead of floating
    // above the translucent address bar on an empty budget. The
    // transform is render-only so it doesn't inflate the
    // scrollable area, and on non-Liquid-Glass browsers `dvh ≈ svh`
    // so it collapses to 0.
    //
    // Standalone mode (installed PWA): `src/styles.css` promotes
    // the bar to `position: fixed; inset: auto 0 0 0` — same
    // pattern the Modal's fullscreen footer uses — and reserves a
    // matching `padding-bottom` on `<main data-budget-main>` so the
    // last AddRow clears the out-of-flow bar. iOS 26 PWAs have a
    // known cold-launch quirk where `fixed; bottom: 0` anchors
    // ~20–30 px above the actual screen edge until the first
    // overscroll-bounce reconciles the visual viewport — the long
    // comment in `styles.css` explains why we accepted that as an
    // iOS bug instead of chasing more workarounds.
    //
    // The inner padding floors `env(safe-area-inset-bottom)` with
    // a 0.25 rem minimum so the bar keeps a visible gap from the
    // home indicator even when the inset returns 0 (a separate
    // iOS 26 bug seen after a cold reopen — see
    // `vercel/next.js#81264`, `ionic-team/ionic-framework#29621`).
    //
    // The `-mx-1 md:-mx-5` cancels `data-budget-shell`'s
    // `px-1 md:px-5` so the bar's background and top border bleed
    // edge-to-edge in browser mode (where the bar is `sticky` and
    // inherits the wrapper's content width). In standalone mode the
    // bar is promoted to `position: fixed; inset: auto 0 0 0` so
    // the margin is inert — `left/right: 0` is authoritative.
    <div
      data-floating-chrome
      data-bottom-bar
      data-swipe-handled
      data-bottom-bar-hidden={hideOnScroll ? "true" : undefined}
      className="sticky bottom-0 z-30 -mx-1 translate-y-[calc(100dvh-100svh)] border-t border-line bg-surface-2 md:-mx-5"
    >
      <div className="flex items-center gap-1 px-2 pt-1 pb-[calc(0.25rem+max(env(safe-area-inset-bottom),0.25rem))] sm:px-3 sm:pt-1.5 sm:pb-[calc(0.5rem+max(env(safe-area-inset-bottom),0.25rem))]">
        {/* Left half: only the bulk-action bar, and only in select mode.
            Sheet switching moved to the header SheetSwitcher dropdown
            (see the component banner). In normal mode this stays empty
            and the flex spacer pushes the action cluster to the right. */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {selectMode && (
            <BulkActionBar
              selectedCount={bulkSelectedCount}
              onEdit={onBulkEdit}
              onMove={onBulkMove}
              onCopy={onBulkCopy}
              onDelete={onBulkDelete}
              onCancel={onBulkCancel}
            />
          )}
        </div>
        <div
          className={`flex shrink-0 items-center gap-0.5 ${
            selectMode ? "border-l border-line pl-1.5 sm:pl-2" : ""
          }`}
        >
          {/* In select mode the bulk action bar (with its own Cancel)
              owns the left side; collapse the search / undo / redo /
              history cluster so the toggle is the only thing left on the
              right, freeing the tight bottom-bar width. */}
          {!selectMode && (
            <>
              <button
                type="button"
                onClick={() => dispatchModal({ kind: "open-search" })}
                aria-label={t("searchTransaction.open")}
                title={t("searchTransaction.open")}
                className={actionButton}
              >
                <Search size={16} aria-hidden focusable={false} />
              </button>
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label={t("app.undo")}
                title={t("app.undoShort")}
                className={actionButton}
              >
                <Undo2 size={16} aria-hidden focusable={false} />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label={t("app.redo")}
                title={t("app.redoShort")}
                className={actionButton}
              >
                <Redo2 size={16} aria-hidden focusable={false} />
              </button>
              <button
                type="button"
                onClick={() => dispatchModal({ kind: "open-action-history" })}
                aria-label={t("app.actionHistory")}
                title={t("app.actionHistory")}
                className={actionButton}
              >
                <History size={16} aria-hidden focusable={false} />
              </button>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
            </>
          )}
          <button
            type="button"
            onClick={onToggleSelectMode}
            disabled={!selectSupported}
            aria-pressed={selectMode}
            aria-label={selectLabel}
            title={selectLabel}
            className={`${actionButton} ${selectMode ? "text-accent hover:text-accent" : ""}`}
          >
            <ListChecks size={16} aria-hidden focusable={false} />
          </button>
        </div>
      </div>
    </div>
  );
}
