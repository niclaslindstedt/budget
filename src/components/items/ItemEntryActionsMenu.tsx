import { Coins, FileText, Pencil, Trash2, Upload } from "lucide-react";

import { useT } from "../../i18n";
import type { Item } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

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
  // Open the "Update value" modal for this item — record a dated value
  // snapshot so an appreciating item tracks its rising value over time.
  onUpdateValue: (item: Item) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking any menu item so the parent can dismiss its swipe
  // state in the same frame the dropdown closes.
  onAction: () => void;
};

// The "…" overflow popover in an item row's swipe strip — the items-sheet
// analogue of `SalaryEntryActionsMenu`. Always offers "Update value"
// (record a dated value snapshot for appreciation / re-appraisal) and
// manages the receipt of the purchase the item is linked to when one
// applies. Edit / Delete join the list only in the compact layout where
// the inline pen / trash are hidden.
export function ItemEntryActionsMenu({
  item,
  canManageReceipt,
  hasReceipt,
  onManageReceipt,
  onUpdateValue,
  onEdit,
  onDelete,
  onAction,
}: Props) {
  const t = useT();
  const compact = useActionsCompact();

  const items: MenuItem[] = [];

  // In the compact layout the inline pen / trash are hidden, so the menu
  // leads with Edit / Delete to keep both reachable (and so the ⋯ button
  // renders even for an item with no receipt entry).
  if (compact) {
    items.push({
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("common.edit"),
      onClick: onEdit,
    });
    items.push({
      key: "delete",
      icon: <Trash2 size={16} aria-hidden focusable={false} />,
      label: t("common.delete"),
      onClick: onDelete,
    });
  }

  items.push({
    key: "update-value",
    icon: <Coins size={16} aria-hidden focusable={false} />,
    label: t("items.updateValue"),
    onClick: () => onUpdateValue(item),
  });

  if (canManageReceipt) {
    items.push({
      key: "receipt",
      icon: hasReceipt ? (
        <FileText size={16} aria-hidden focusable={false} />
      ) : (
        <Upload size={16} aria-hidden focusable={false} />
      ),
      label: hasReceipt ? t("items.viewReceipt") : t("items.receiptUpload"),
      onClick: () => onManageReceipt(item),
    });
  }

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      rowId={item.id}
      // The item row's own tap retracts the swipe — keep menu clicks from
      // bubbling into it.
      stopPropagation
      onPick={onAction}
    />
  );
}
