import { FileText, Upload } from "lucide-react";

import type { PropertyRepair } from "../../data/types";
import { useT } from "../../i18n";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  repair: PropertyRepair;
  // Whether the active backend can hold receipt files (the localStorage
  // backend can't). When false the menu has no entries and renders nothing,
  // so the swipe strip stays at edit + delete.
  canManageReceipt: boolean;
  // Whether the repair already carries at least one receipt — toggles the
  // entry's glyph between "has files" and "upload".
  hasReceipt: boolean;
  // Open the receipts manager for this repair.
  onManageReceipt: (repair: PropertyRepair) => void;
  // Fired after picking any menu item so the parent can dismiss its swipe
  // state in the same frame the dropdown closes.
  onAction: () => void;
};

// The "…" overflow popover in a repair row's swipe strip — the repairs-view
// analogue of `ItemEntryActionsMenu`. Its single entry manages the repair's
// receipts. Renders nothing when the backend can't hold receipts, so the strip
// stays at edit + delete.
export function RepairEntryActionsMenu({
  repair,
  canManageReceipt,
  hasReceipt,
  onManageReceipt,
  onAction,
}: Props) {
  const t = useT();

  const items: MenuItem[] = [];

  if (canManageReceipt) {
    items.push({
      key: "receipt",
      icon: hasReceipt ? (
        <FileText size={16} aria-hidden focusable={false} />
      ) : (
        <Upload size={16} aria-hidden focusable={false} />
      ),
      label: t("properties.manageReceipts"),
      onClick: () => onManageReceipt(repair),
    });
  }

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      rowId={repair.id}
      // The repair row's own tap retracts the swipe — keep menu clicks
      // from bubbling into it.
      stopPropagation
      onPick={onAction}
    />
  );
}
