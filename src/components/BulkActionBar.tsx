import { type ReactNode } from "react";
import { Copy, HandCoins, MoveRight, Pencil, Trash2, X } from "lucide-react";

import { useT } from "../i18n";

type Props = {
  selectedCount: number;
  onEdit: () => void;
  // Move / copy are budget-only operations (they shift rows between
  // months). Pages without that notion — the salary sheet, whose rows
  // are pinned to their pay month — omit these so only Edit + Delete
  // render.
  onMove?: () => void;
  onCopy?: () => void;
  onDelete: () => void;
  onCancel: () => void;
  // Cover an all-historic selection with a transfer from another account.
  // Provided only on the budget page; rendered only when `coverAvailable`.
  onCover?: () => void;
  // True when an imported (historic) row is part of the selection. Imported
  // transactions are the bank's truth, so Edit / Move / Delete are hidden —
  // only Copy (which clones to fresh manual rows) and Cover survive.
  hideMutations?: boolean;
  // True when every selected row is historic, so the Cover action applies.
  coverAvailable?: boolean;
};

// The bulk-select toolbar: a live count followed by the operations that
// act on the current selection (edit / move / copy / delete) and a
// cancel that exits select mode. Presentational and page-agnostic — it
// takes only a count and callbacks, so both the BottomBar (acting on the
// active sheet) and the search modal drive the same widget. Move / copy
// are optional so a page that can't relocate its rows hides them.
export function BulkActionBar({
  selectedCount,
  onEdit,
  onMove,
  onCopy,
  onDelete,
  onCancel,
  onCover,
  hideMutations = false,
  coverAvailable = false,
}: Props) {
  const t = useT();
  const disabled = selectedCount === 0;
  return (
    <>
      <span
        className="shrink-0 px-2 text-xs font-bold tracking-wider text-fg-bright tabular-nums uppercase"
        aria-label={`${selectedCount} ${t("bulkBar.selectedSuffix")}`}
      >
        {selectedCount}
      </span>
      <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-line" />
      {!hideMutations && (
        <BulkButton
          tone="text-accent"
          icon={<Pencil size={16} aria-hidden focusable={false} />}
          onClick={onEdit}
          disabled={disabled}
          ariaLabel={t("bulkBar.editSelected")}
          title={t("common.edit")}
        />
      )}
      {!hideMutations && onMove && (
        <BulkButton
          tone="text-meta"
          icon={<MoveRight size={16} aria-hidden focusable={false} />}
          onClick={onMove}
          disabled={disabled}
          ariaLabel={t("bulkBar.moveSelected")}
          title={t("bulkBar.move")}
        />
      )}
      {onCopy && (
        <BulkButton
          tone="text-link"
          icon={<Copy size={16} aria-hidden focusable={false} />}
          onClick={onCopy}
          disabled={disabled}
          ariaLabel={t("bulkBar.copySelected")}
          title={t("bulkBar.copy")}
        />
      )}
      {onCover && coverAvailable && (
        <BulkButton
          tone="text-positive"
          icon={<HandCoins size={16} aria-hidden focusable={false} />}
          onClick={onCover}
          disabled={disabled}
          ariaLabel={t("coverTransfer.coverSelected")}
          title={t("coverTransfer.coverAction")}
        />
      )}
      {!hideMutations && (
        <BulkButton
          tone="text-danger"
          icon={<Trash2 size={16} aria-hidden focusable={false} />}
          onClick={onDelete}
          disabled={disabled}
          ariaLabel={t("bulkBar.deleteSelected")}
          title={t("common.delete")}
        />
      )}
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
