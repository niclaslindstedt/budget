import { Download, Pencil, Scale, Scissors, Trash2 } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { useActionsCompact } from "../ActionsCompactContext";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  accountId: string;
  accountName: string;
  canCut: boolean;
  canUpdateBalance: boolean;
  onUpdateBalance: (accountId: string) => void;
  onImportHistory: (accountId: string) => void;
  onCutHistory: (accountId: string) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking any menu item so the parent can dismiss its
  // swipe state in the same frame the dropdown closes — mirrors the
  // contract `BudgetEntryActionsMenu` exposes for the budget sheet.
  onAction: () => void;
};

// Narrower than the shared ACTIONS_MENU_PLACEMENT — the accounts table's
// shorter labels fit a 200px panel.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "right",
  coordinateSpace: "document",
};

// Overflow menu for the Accounts table. Mirrors `BudgetEntryActionsMenu` from
// the budget sheet — same trigger glyph, same dropdown shell, same
// `onAction` hook so the parent can collapse the swipe in the same
// frame. Houses the import / cut actions that don't earn a dedicated
// button in the swipe strip.
export function AccountActionsMenu({
  accountId,
  accountName,
  canCut,
  canUpdateBalance,
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
      label: t("accountsSheet.updateBalanceTitle"),
      disabled: !canUpdateBalance,
      title: canUpdateBalance ? undefined : t("account.addBudgetSheetHint"),
      onClick: () => onUpdateBalance(accountId),
    },
    {
      key: "import",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("accountsSheet.importHistoryTitle"),
      onClick: () => onImportHistory(accountId),
    },
    {
      key: "cut",
      icon: <Scissors size={16} aria-hidden focusable={false} />,
      label: t("accountsSheet.cutHistoryTitle"),
      disabled: !canCut,
      title: canCut ? undefined : t("accountsSheet.nothingToCut"),
      onClick: () => onCutHistory(accountId),
    },
  ];

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("accountsSheet.moreActionsAria", { name: accountName })}
      triggerTitle={t("accountsSheet.moreActions")}
      placement={PLACEMENT}
      rowId={accountId}
      // The account row's own tap opens the history viewer — keep menu
      // clicks from bubbling into it.
      stopPropagation
      onPick={onAction}
    />
  );
}
