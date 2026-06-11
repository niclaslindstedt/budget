import { Download, Eye, Pencil, Scale, Trash2 } from "lucide-react";

import { useT } from "../../i18n";
import type { Loan } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

type Props = {
  loan: Loan;
  // True when the loan resolves a linked property mortgage — its balance
  // lives on the mortgage, so the Update balance entry is disabled and
  // points the user at the Properties sheet instead.
  isLinked: boolean;
  // True when the loan (or its linked mortgage) has recorded payments —
  // gates the View entry (which has nothing to show otherwise).
  hasPayments: boolean;
  // Open the dated-balance update modal for this loan.
  onUpdateBalance: (loanId: string) => void;
  // Open the payment-import modal — candidates are bank entries typed with
  // the loan's kind or matching its learned payment patterns.
  onImportPayments: (loanId: string) => void;
  // Open the recorded-payments list.
  onViewPayments: (loanId: string) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking the menu item so the parent row can dismiss its
  // swipe state in the same frame the dropdown closes.
  onAction: () => void;
};

// The "…" overflow popover in a loan row's swipe strip. Records a dated
// outstanding balance, imports payments from bank transactions, and views
// the recorded list. Mirrors `SavingActionsMenu`.
export function LoanActionsMenu({
  loan,
  isLinked,
  hasPayments,
  onUpdateBalance,
  onImportPayments,
  onViewPayments,
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
      label: t("loansSheet.updateBalance"),
      disabled: isLinked,
      title: isLinked ? t("loansSheet.linkedBalanceHint") : undefined,
      onClick: () => onUpdateBalance(loan.id),
    },
    {
      key: "import",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("loansSheet.importPayments"),
      onClick: () => onImportPayments(loan.id),
    },
    {
      key: "view",
      icon: <Eye size={16} aria-hidden focusable={false} />,
      label: t("loansSheet.viewPayments"),
      disabled: !hasPayments,
      title: hasPayments ? undefined : t("loansSheet.noPayments"),
      onClick: () => onViewPayments(loan.id),
    },
  ];

  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      rowId={loan.id}
      // The loan row's own tap opens the View loan modal — keep menu
      // clicks from bubbling into it.
      stopPropagation
      onPick={onAction}
    />
  );
}
