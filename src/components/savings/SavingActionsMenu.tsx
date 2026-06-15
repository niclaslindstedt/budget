import { Download, Pencil, Scale, Scissors, Trash2 } from "lucide-react";

import { useT } from "../../i18n";
import type { Saving } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  saving: Saving;
  // True when there are transactions or transfers in range to cut.
  canCut: boolean;
  // Open the dated-balance update modal for this savings account.
  onUpdateBalance: (savingId: string) => void;
  // Import a bank statement into this savings account. The transactions are
  // stored for transfer detection, not surfaced on the Savings page.
  onImportHistory: (savingId: string) => void;
  // Cut imported transactions / transfers before a chosen cutoff date.
  onCutHistory: (savingId: string) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking the menu item so the parent row can dismiss its
  // swipe state in the same frame the dropdown closes.
  onAction: () => void;
};

// The "…" overflow popover in a savings row's swipe strip. Records a new dated
// balance, and — since a savings account stores transactions for transfer
// detection — imports / cuts that bank history. Viewing the history is the
// row's own tap (see `SavingsRow`), mirroring `AccountActionsMenu` /
// `AccountRow`.
export function SavingActionsMenu({
  saving,
  canCut,
  onUpdateBalance,
  onImportHistory,
  onCutHistory,
  onEdit,
  onDelete,
  onAction,
}: Props) {
  const t = useT();
  const compact = useActionsCompact();

  const items: MenuItem[] = [
    // In the compact layout the inline pen / trash are hidden, so the menu
    // leads with Edit / Delete to keep both reachable.
    ...(compact
      ? [
          {
            key: "edit",
            icon: <Pencil size={16} aria-hidden focusable={false} />,
            label: t("common.edit"),
            onClick: onEdit,
          },
          {
            key: "delete",
            icon: <Trash2 size={16} aria-hidden focusable={false} />,
            label: t("common.delete"),
            onClick: onDelete,
          },
        ]
      : []),
    {
      key: "balance",
      icon: <Scale size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.updateBalance"),
      onClick: () => onUpdateBalance(saving.id),
    },
    {
      key: "import",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.importHistory"),
      onClick: () => onImportHistory(saving.id),
    },
    {
      key: "cut",
      icon: <Scissors size={16} aria-hidden focusable={false} />,
      label: t("savingsSheet.cutHistory"),
      disabled: !canCut,
      title: canCut ? undefined : t("savingsSheet.nothingToCut"),
      onClick: () => onCutHistory(saving.id),
    },
  ];

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      rowId={saving.id}
      // The saving row's own tap opens the view modal (the tap handler
      // the other *Row siblings wire) — keep menu clicks from bubbling
      // into it.
      stopPropagation
      onPick={onAction}
    />
  );
}
