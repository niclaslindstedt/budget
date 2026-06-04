import { useCallback, useEffect, useRef } from "react";
import { History, ListChecks, Plus, Redo2, Search, Undo2 } from "lucide-react";

import type { Sheet } from "../data/types";
import { useIsStandalone, useLongPress, useScrollHide } from "../hooks";
import { useT } from "../i18n";
import { tintFill } from "../utils/tint";
import { BulkActionBar } from "./BulkActionBar";
import { CategoryIconGlyph } from "./icons";
import { useModalDispatch } from "./modal-dispatch";

type Props = {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;

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

// Single solid bar pinned to the bottom of the viewport. Tabs (or the
// bulk-select action set) scroll horizontally on the left; the right
// edge holds the always-available undo / redo / history / select
// toggle. Replaces the previously separate top-pinned UndoRedoBar +
// bottom-pinned SheetTabs / BulkActionBar pills.
export function BottomBar({
  sheets,
  activeSheetId,
  onSelectSheet,
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

  // Arrow-Left / Right / Home / End cycle the active sheet when focus
  // sits on a tab. WAI-ARIA tabs in "automatic" mode — focus = select —
  // matches the rest of the chrome's switch-on-tap UX and avoids a
  // separate Enter-to-activate step.
  const onTabKey = useCallback(
    (currentIdx: number, key: string) => {
      if (sheets.length === 0) return;
      let next = currentIdx;
      if (key === "ArrowLeft") next = currentIdx - 1;
      else if (key === "ArrowRight") next = currentIdx + 1;
      else if (key === "Home") next = 0;
      else if (key === "End") next = sheets.length - 1;
      else return;
      const wrapped = (next + sheets.length) % sheets.length;
      onSelectSheet(sheets[wrapped].id);
    },
    [sheets, onSelectSheet],
  );

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
        {/* `overflow-hidden`, never `overflow-x-auto`: a horizontally
            scrolling region inside this `position: sticky` bar knocks iOS
            WebKit off composited scrolling, so the whole chrome (this bar
            *and* the top header) starts lagging the page scroll and only
            settles when the gesture ends. Tabs that don't fit are clipped
            here and reached through the header's SheetSwitcher dropdown
            instead. */}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {selectMode ? (
            <BulkActionBar
              selectedCount={bulkSelectedCount}
              onEdit={onBulkEdit}
              onMove={onBulkMove}
              onCopy={onBulkCopy}
              onDelete={onBulkDelete}
              onCancel={onBulkCancel}
            />
          ) : (
            // Sheet picker as an ARIA tablist — each tab carries
            // `aria-selected`, the inactive tabs roll `tabIndex={-1}`
            // off the keyboard tour (the active one is the single
            // entry point), and `onTabKey` cycles between them. The
            // tabpanel lives in `<main data-budget-main>` over in
            // AppShell and points back here via `aria-labelledby`.
            //
            // The "New sheet" button lives outside the tablist — axe's
            // `aria-required-children` flags any non-tab child of a
            // tablist, and the button is an action, not a tab.
            <>
              <div
                role="tablist"
                aria-label={t("sheetTabs.tablistLabel")}
                className="flex min-w-0 items-center gap-1"
              >
                {sheets.map((sheet, idx) => (
                  <SheetTab
                    key={sheet.id}
                    sheet={sheet}
                    active={sheet.id === activeSheetId}
                    index={idx}
                    onSelect={() => onSelectSheet(sheet.id)}
                    onEdit={() =>
                      dispatchModal({
                        kind: "open-edit-sheet",
                        sheetId: sheet.id,
                      })
                    }
                    onTabKey={onTabKey}
                  />
                ))}
              </div>
              <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
              <button
                type="button"
                onClick={() => dispatchModal({ kind: "open-new-sheet" })}
                aria-label={t("sheetTabs.newSheet")}
                title={t("sheetTabs.newSheet")}
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-accent hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
              >
                <Plus size={18} aria-hidden focusable={false} />
              </button>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 border-l border-line pl-1.5 sm:pl-2">
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

function SheetTab({
  sheet,
  active,
  index,
  onSelect,
  onEdit,
  onTabKey,
}: {
  sheet: Sheet;
  active: boolean;
  index: number;
  onSelect: () => void;
  onEdit: () => void;
  onTabKey: (currentIdx: number, key: string) => void;
}) {
  const t = useT();
  // Long-press / right-click both open the edit modal. The
  // `consumeTriggered` flag guards the trailing click so the tap that
  // produced the long-press doesn't also fire a sheet switch.
  const longPress = useLongPress({ onLongPress: onEdit });
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Pull the active tab back into the visible window of the horizontal
  // scroller after a sheet switch. Without this, opening a sheet whose
  // tab has scrolled off the edge silently leaves the user looking at
  // an empty-feeling bar. We also re-focus the active tab when it was
  // moved via arrow keys so the roving tabindex follows the selection
  // — `data-keyboard-focused` is set by `handleKeyDown` and cleared on
  // any pointer interaction.
  useEffect(() => {
    if (!active) return;
    buttonRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
    if (buttonRef.current?.dataset.keyboardFocused === "true") {
      buttonRef.current.focus();
      delete buttonRef.current.dataset.keyboardFocused;
    }
  }, [active]);

  function handleClick() {
    if (longPress.consumeTriggered()) return;
    onSelect();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "Home" ||
      e.key === "End"
    ) {
      e.preventDefault();
      // The selected-tab effect picks the flag up after re-render and
      // restores keyboard focus to the new active button. Without
      // this hop, the focus would stay on the old (now `tabIndex=-1`)
      // tab and the next arrow key would do nothing.
      if (buttonRef.current) {
        buttonRef.current.dataset.keyboardFocused = "true";
      }
      onTabKey(index, e.key);
    }
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      role="tab"
      id={`sheet-tab-${sheet.id}`}
      aria-controls={`sheet-tabpanel-${sheet.id}`}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerUp}
      onContextMenu={longPress.onContextMenu}
      aria-label={t("sheetTabs.tabAriaLabel", { name: sheet.name })}
      title={
        sheet.description ? `${sheet.name} — ${sheet.description}` : sheet.name
      }
      className={`sheet-tab inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        active ? "border-current" : "border-transparent hover:bg-surface"
      }`}
      style={{
        color: sheet.color,
        backgroundColor: active ? tintFill(sheet.color) : undefined,
      }}
    >
      <CategoryIconGlyph name={sheet.glyph} size={16} />
      <span className="hidden max-w-[10rem] truncate text-xs font-bold tracking-wide md:inline">
        {sheet.name}
      </span>
    </button>
  );
}
