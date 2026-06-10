import { useCallback, useRef, useState } from "react";
import { FileText, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Item } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  item: Item;
  // Whether the receipt entry should show at all. An item's receipt hangs
  // off the single transaction it's linked to, so this is true only when
  // the item is linked to a purchase AND the active backend can hold
  // receipt files (the localStorage backend can't). Hidden otherwise — an
  // unlinked item has no transaction to attach a receipt to.
  canManageReceipt: boolean;
  // Whether the linked transaction already carries a receipt — toggles the
  // entry between "View receipt" and "Upload receipt".
  hasReceipt: boolean;
  // Open the shared attachment modal for this item's receipt — upload a new
  // one, or view / replace / remove the existing file.
  onManageReceipt: (item: Item) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking any menu item so the parent can dismiss its swipe
  // state in the same frame the dropdown closes.
  onAction: () => void;
};

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 224 },
  anchor: "right",
  coordinateSpace: "document",
};

type MenuItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

// The "…" overflow popover in an item row's swipe strip — the items-sheet
// analogue of `SalaryEntryActionsMenu`. Its single entry manages the
// receipt of the purchase the item is linked to. Renders nothing when no
// entry applies (no receipts capability, or the item isn't linked to a
// transaction yet), so the swipe strip stays at edit + delete.
export function ItemEntryActionsMenu({
  item,
  canManageReceipt,
  hasReceipt,
  onManageReceipt,
  onEdit,
  onDelete,
  onAction,
}: Props) {
  const t = useT();
  const compact = useActionsCompact();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    onAction();
    handler();
  }

  const items: MenuItem[] = [];

  // In the compact layout the inline pen / trash are hidden, so the menu
  // leads with Edit / Delete to keep both reachable (and so the ⋯ button
  // renders even for an item with no receipt entry).
  if (compact) {
    items.push({
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("common.edit"),
      onClick: () => pick(onEdit),
    });
    items.push({
      key: "delete",
      icon: <Trash2 size={16} aria-hidden focusable={false} />,
      label: t("common.delete"),
      onClick: () => pick(onDelete),
    });
  }

  if (canManageReceipt) {
    items.push({
      key: "receipt",
      icon: hasReceipt ? (
        <FileText size={16} aria-hidden focusable={false} />
      ) : (
        <Upload size={16} aria-hidden focusable={false} />
      ),
      label: hasReceipt ? t("items.viewReceipt") : t("items.receiptUpload"),
      onClick: () => pick(() => onManageReceipt(item)),
    });
  }

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="action-btn action-btn-more inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
        aria-label={t("cell.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={16} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={triggerRef}
        placement={PLACEMENT}
        rowId={item.id}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={it.onClick}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden className="text-accent">
                  {it.icon}
                </span>
                <span className="flex-1 truncate">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </>
  );
}
