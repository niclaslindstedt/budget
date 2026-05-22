import { ListChecks, Redo2, Undo2 } from "lucide-react";

import { useT } from "../i18n";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  selectMode: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSelectMode: () => void;
};

const iconButton =
  "inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted";

// Top-pinned overlay holding the undo, redo, and select-mode toggles.
// Mirrors the bottom-pinned SheetTabs pill so the page's floating
// chrome reads as a matched pair: row actions at the top, sheet
// navigation at the bottom.
export function UndoRedoBar({
  canUndo,
  canRedo,
  selectMode,
  onUndo,
  onRedo,
  onToggleSelectMode,
}: Props) {
  const t = useT();
  const selectLabel = selectMode
    ? t("app.exitSelectMode")
    : t("app.selectRows");
  return (
    <div
      data-floating-chrome
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:px-4 sm:pt-[calc(0.75rem+env(safe-area-inset-top))]"
    >
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/95 px-2 py-1.5 shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("app.undo")}
          title={t("app.undoShort")}
          className={iconButton}
        >
          <Undo2 size={16} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("app.redo")}
          title={t("app.redoShort")}
          className={iconButton}
        >
          <Redo2 size={16} aria-hidden focusable={false} />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          onClick={onToggleSelectMode}
          aria-pressed={selectMode}
          aria-label={selectLabel}
          title={selectLabel}
          className={`${iconButton} ${selectMode ? "text-accent hover:text-accent" : ""}`}
        >
          <ListChecks size={16} aria-hidden focusable={false} />
        </button>
      </div>
    </div>
  );
}
