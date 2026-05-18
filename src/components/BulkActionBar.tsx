import { Copy, MoveRight, Pencil, Trash2, X } from "lucide-react";

type Props = {
  count: number;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  onCopy: () => void;
  onCancel: () => void;
};

const iconButton =
  "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

// Floating bar pinned to the bottom of the viewport while bulk-select
// mode is on. Stays visible across scroll so the selection's actions
// are always one tap away.
export function BulkActionBar({
  count,
  onEdit,
  onDelete,
  onMove,
  onCopy,
  onCancel,
}: Props) {
  const disabled = count === 0;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3">
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-3 py-1.5 shadow-2xl backdrop-blur">
        <span className="px-2 text-xs font-bold tracking-wider text-fg-bright tabular-nums uppercase">
          {count}
          <span className="ml-1 text-muted">selected</span>
        </span>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          className={`${iconButton} text-accent`}
          onClick={onEdit}
          disabled={disabled}
          aria-label="Edit selected"
          title="Edit"
        >
          <Pencil size={18} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          className={`${iconButton} text-meta`}
          onClick={onMove}
          disabled={disabled}
          aria-label="Move selected to another month"
          title="Move"
        >
          <MoveRight size={18} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          className={`${iconButton} text-link`}
          onClick={onCopy}
          disabled={disabled}
          aria-label="Copy selected to other months"
          title="Copy"
        >
          <Copy size={18} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          className={`${iconButton} text-danger`}
          onClick={onDelete}
          disabled={disabled}
          aria-label="Delete selected"
          title="Delete"
        >
          <Trash2 size={18} aria-hidden focusable={false} />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          className={`${iconButton} text-muted`}
          onClick={onCancel}
          aria-label="Cancel selection"
          title="Cancel"
        >
          <X size={18} aria-hidden focusable={false} />
        </button>
      </div>
    </div>
  );
}
