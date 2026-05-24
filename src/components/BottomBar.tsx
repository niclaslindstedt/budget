import { useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  Copy,
  History,
  ListChecks,
  MoveRight,
  Pencil,
  Plus,
  Redo2,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import type { Sheet } from "../data/types";
import { useIsStandalone, useScrollHide } from "../hooks";
import { useT } from "../i18n";
import { CategoryIconGlyph } from "./icons";

type Props = {
  sheets: Sheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onEditSheet: (sheetId: string) => void;
  onAddSheet: () => void;

  canUndo: boolean;
  canRedo: boolean;
  selectMode: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistory: () => void;
  onOpenSearch: () => void;
  onToggleSelectMode: () => void;

  bulkSelectedCount: number;
  onBulkEdit: () => void;
  onBulkMove: () => void;
  onBulkCopy: () => void;
  onBulkDelete: () => void;
  onBulkCancel: () => void;
};

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 8;

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
  onEditSheet,
  onAddSheet,
  canUndo,
  canRedo,
  selectMode,
  onUndo,
  onRedo,
  onOpenHistory,
  onOpenSearch,
  onToggleSelectMode,
  bulkSelectedCount,
  onBulkEdit,
  onBulkMove,
  onBulkCopy,
  onBulkDelete,
  onBulkCancel,
}: Props) {
  const t = useT();
  const selectLabel = selectMode
    ? t("app.exitSelectMode")
    : t("app.selectRows");
  const bulkDisabled = bulkSelectedCount === 0;

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
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {selectMode ? (
            <>
              <span className="shrink-0 px-2 text-xs font-bold tracking-wider text-fg-bright tabular-nums uppercase">
                {bulkSelectedCount}
                <span className="ml-1 text-muted">
                  {t("bulkBar.selectedSuffix")}
                </span>
              </span>
              <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
              <BulkButton
                tone="text-accent"
                icon={<Pencil size={16} aria-hidden focusable={false} />}
                onClick={onBulkEdit}
                disabled={bulkDisabled}
                ariaLabel={t("bulkBar.editSelected")}
                title={t("bulkBar.edit")}
              />
              <BulkButton
                tone="text-meta"
                icon={<MoveRight size={16} aria-hidden focusable={false} />}
                onClick={onBulkMove}
                disabled={bulkDisabled}
                ariaLabel={t("bulkBar.moveSelected")}
                title={t("bulkBar.move")}
              />
              <BulkButton
                tone="text-link"
                icon={<Copy size={16} aria-hidden focusable={false} />}
                onClick={onBulkCopy}
                disabled={bulkDisabled}
                ariaLabel={t("bulkBar.copySelected")}
                title={t("bulkBar.copy")}
              />
              <BulkButton
                tone="text-danger"
                icon={<Trash2 size={16} aria-hidden focusable={false} />}
                onClick={onBulkDelete}
                disabled={bulkDisabled}
                ariaLabel={t("bulkBar.deleteSelected")}
                title={t("bulkBar.delete")}
              />
              <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
              <BulkButton
                tone="text-muted"
                icon={<X size={16} aria-hidden focusable={false} />}
                onClick={onBulkCancel}
                ariaLabel={t("bulkBar.cancelSelection")}
                title={t("bulkBar.cancel")}
              />
            </>
          ) : (
            // Sheet picker as an ARIA tablist — each tab carries
            // `aria-selected`, the inactive tabs roll `tabIndex={-1}`
            // off the keyboard tour (the active one is the single
            // entry point), and `onTabKey` cycles between them. The
            // tabpanel lives in `<main data-budget-main>` over in
            // BudgetView and points back here via `aria-labelledby`.
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
                    onEdit={() => onEditSheet(sheet.id)}
                    onTabKey={onTabKey}
                  />
                ))}
              </div>
              <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
              <button
                type="button"
                onClick={onAddSheet}
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
          <button
            type="button"
            onClick={onOpenSearch}
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
            onClick={onOpenHistory}
            aria-label={t("app.actionHistory")}
            title={t("app.actionHistory")}
            className={actionButton}
          >
            <History size={16} aria-hidden focusable={false} />
          </button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
          <button
            type="button"
            onClick={onToggleSelectMode}
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

const bulkIconButton =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

function BulkButton({
  tone,
  icon,
  onClick,
  disabled,
  ariaLabel,
  title,
}: {
  tone: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={`${bulkIconButton} ${tone}`}
    >
      {icon}
    </button>
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
  // Long-press / right-click both open the edit modal. Mirrors the
  // AddRowButton pattern: a timer fires after LONG_PRESS_MS and a
  // `triggered` flag guards the trailing click so the tap doesn't
  // also fire a sheet switch.
  const timer = useRef<number | null>(null);
  const triggered = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
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

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    triggered.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    clearTimer();
    timer.current = window.setTimeout(() => {
      triggered.current = true;
      timer.current = null;
      onEdit();
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (timer.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) clearTimer();
  }

  function handlePointerUp() {
    clearTimer();
  }

  function handleClick() {
    if (triggered.current) {
      triggered.current = false;
      return;
    }
    onSelect();
  }

  function handleContextMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    clearTimer();
    triggered.current = true;
    onEdit();
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
      aria-label={t("sheetTabs.tabAriaLabel", { name: sheet.name })}
      title={
        sheet.description ? `${sheet.name} — ${sheet.description}` : sheet.name
      }
      className={`sheet-tab inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
        active ? "border-current" : "border-transparent hover:bg-surface"
      }`}
      style={{
        color: sheet.color,
        backgroundColor: active
          ? `color-mix(in srgb, ${sheet.color} 18%, transparent)`
          : undefined,
      }}
    >
      <CategoryIconGlyph name={sheet.glyph} size={16} />
      <span className="hidden max-w-[10rem] truncate text-xs font-bold tracking-wide md:inline">
        {sheet.name}
      </span>
    </button>
  );
}
