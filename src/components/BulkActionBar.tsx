import { type ReactNode } from "react";
import { Copy, MoveRight, Pencil, Trash2, X } from "lucide-react";

import { useT } from "../i18n";

type Props = {
  selectedCount: number;
  onEdit: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onCancel: () => void;
};

// The bulk-select toolbar: a live count followed by the four operations
// that act on the current selection (edit / move / copy / delete) and a
// cancel that exits select mode. Presentational and page-agnostic — it
// takes only a count and callbacks, so both the BottomBar (acting on the
// active sheet) and the search modal drive the same widget.
export function BulkActionBar({
  selectedCount,
  onEdit,
  onMove,
  onCopy,
  onDelete,
  onCancel,
}: Props) {
  const t = useT();
  const disabled = selectedCount === 0;
  return (
    <>
      <span className="shrink-0 px-2 text-xs font-bold tracking-wider text-fg-bright tabular-nums uppercase">
        {selectedCount}
        <span className="ml-1 text-muted">{t("bulkBar.selectedSuffix")}</span>
      </span>
      <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
      <BulkButton
        tone="text-accent"
        icon={<Pencil size={16} aria-hidden focusable={false} />}
        onClick={onEdit}
        disabled={disabled}
        ariaLabel={t("bulkBar.editSelected")}
        title={t("common.edit")}
      />
      <BulkButton
        tone="text-meta"
        icon={<MoveRight size={16} aria-hidden focusable={false} />}
        onClick={onMove}
        disabled={disabled}
        ariaLabel={t("bulkBar.moveSelected")}
        title={t("bulkBar.move")}
      />
      <BulkButton
        tone="text-link"
        icon={<Copy size={16} aria-hidden focusable={false} />}
        onClick={onCopy}
        disabled={disabled}
        ariaLabel={t("bulkBar.copySelected")}
        title={t("bulkBar.copy")}
      />
      <BulkButton
        tone="text-danger"
        icon={<Trash2 size={16} aria-hidden focusable={false} />}
        onClick={onDelete}
        disabled={disabled}
        ariaLabel={t("bulkBar.deleteSelected")}
        title={t("common.delete")}
      />
      <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
      <BulkButton
        tone="text-muted"
        icon={<X size={16} aria-hidden focusable={false} />}
        onClick={onCancel}
        ariaLabel={t("bulkBar.cancelSelection")}
        title={t("common.cancel")}
      />
    </>
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
