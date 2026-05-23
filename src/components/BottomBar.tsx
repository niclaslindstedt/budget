import { useEffect, useRef, type ReactNode } from "react";
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

  return (
    // Two-mode positioning:
    //
    // Browser mode (Safari / Chrome / Firefox tab): the bar is
    // `position: sticky; bottom: 0` and rides inside the flex
    // column's flow. The `translate-y-[calc(100dvh-100svh)]`
    // transform offsets the bar visually by exactly the floating
    // Liquid Glass chrome's footprint so it lands flush against
    // the screen edge instead of floating above the translucent
    // address bar on a first-load empty budget — first impressions
    // matter, and svh-only positioning left a visible gap.
    // Transform is render-only, so it doesn't inflate the
    // scrollable area; older iOS / non-Liquid-Glass browsers
    // report `dvh ≈ svh` so the offset collapses to 0 and the
    // bar stays exactly where `bottom: 0` puts it.
    //
    // Standalone mode (installed PWA): the override block in
    // `src/styles.css` (`@media (display-mode: standalone)`)
    // anchors the bar via `position: fixed; transform:
    // translateY(calc(var(--vv-bottom) - 100%))`. iOS 26 ships a
    // viewport-coherence regression (WebKit #297779) where the
    // compositor pins fixed elements to a stale rectangle that's
    // 100–200 px taller than the actually-rendered visual
    // viewport — every signal except `visualViewport.height +
    // .offsetTop` reads from that poisoned rectangle on a cold
    // launch, which is why earlier attempts using `innerHeight` /
    // `100dvh` / `bottom: 0` all left the bar floating up, with
    // the user having to drag the page to "snap" it down.
    //
    // The fix has three coordinated parts: `main.tsx` calls
    // `bootViewportWorkaround()` BEFORE React mounts to "wake"
    // the compositor (toggle viewport-fit + a no-op scrollBy
    // round-trip — see the file for the references);
    // `useVisualViewportOffset` in `LanguageRoot` keeps
    // `--vv-bottom` in sync; and the CSS rule reads that variable
    // via `transform: translateY` instead of `bottom: 0`.
    //
    // The matching `<main data-budget-main>` padding reserve in
    // the same media-query block keeps a scrolled budget's last
    // row from disappearing behind the out-of-flow bar.
    //
    // The inner padding floors `env(safe-area-inset-bottom)` with
    // a 0.25 rem minimum so the bar keeps a visible gap from the
    // home indicator even when the inset returns 0 (a separate
    // iOS 26 bug seen after a cold reopen — see
    // `vercel/next.js#81264`, `ionic-team/ionic-framework#29621`).
    <div
      data-floating-chrome
      className="sticky bottom-0 z-30 translate-y-[calc(100dvh-100svh)] border-t border-line bg-surface-2"
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
            <>
              {sheets.map((sheet) => (
                <SheetTab
                  key={sheet.id}
                  sheet={sheet}
                  active={sheet.id === activeSheetId}
                  onSelect={() => onSelectSheet(sheet.id)}
                  onEdit={() => onEditSheet(sheet.id)}
                />
              ))}
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
  onSelect,
  onEdit,
}: {
  sheet: Sheet;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
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
  // an empty-feeling bar.
  useEffect(() => {
    if (!active) return;
    buttonRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
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

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
      aria-pressed={active}
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
