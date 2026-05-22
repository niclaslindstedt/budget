import { History, ListChecks, Redo2, Undo2 } from "lucide-react";

import { useT } from "../i18n";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  selectMode: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenHistory: () => void;
  onToggleSelectMode: () => void;
};

const iconButton =
  "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted";

// Pill of undo / redo / select-mode actions pinned below the three
// stacked sticky bands at the top of the sheet (app header, month
// name, column thead). Mirrors the bottom-pinned SheetTabs so the
// floating chrome reads as a matched pair, but sits inside the
// content column instead of overlapping the app header / iOS notch
// area at the very top of the viewport.
export function UndoRedoBar({
  canUndo,
  canRedo,
  selectMode,
  onUndo,
  onRedo,
  onOpenHistory,
  onToggleSelectMode,
}: Props) {
  const t = useT();
  const selectLabel = selectMode
    ? t("app.exitSelectMode")
    : t("app.selectRows");
  return (
    <div
      data-floating-chrome
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-2 sm:px-4"
      style={{
        top: "calc(var(--app-header-h) + var(--month-header-h) + 2.25rem)",
      }}
    >
      <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2/95 px-1 py-0.5 shadow-2xl backdrop-blur">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("app.undo")}
          title={t("app.undoShort")}
          className={iconButton}
        >
          <Undo2 size={14} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("app.redo")}
          title={t("app.redoShort")}
          className={iconButton}
        >
          <Redo2 size={14} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label={t("app.actionHistory")}
          title={t("app.actionHistory")}
          className={iconButton}
        >
          <History size={14} aria-hidden focusable={false} />
        </button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={onToggleSelectMode}
          aria-pressed={selectMode}
          aria-label={selectLabel}
          title={selectLabel}
          className={`${iconButton} ${selectMode ? "text-accent hover:text-accent" : ""}`}
        >
          <ListChecks size={14} aria-hidden focusable={false} />
        </button>
      </div>
    </div>
  );
}
