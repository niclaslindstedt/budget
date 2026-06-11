import { useCallback, useRef, useState } from "react";
import {
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  Scale,
  Trash2,
} from "lucide-react";

import { useT } from "../../i18n";
import type { Loan } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";
import {
  ACTIONS_MENU_PLACEMENT,
  ACTIONS_MENU_TRIGGER_CLASS,
  menuItemClass,
  type MenuItem,
} from "../form/menu";

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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    onAction();
    handler();
  }

  const items: MenuItem[] = [
    // In the compact layout the inline pen / trash are hidden, so the menu
    // leads with Edit / Delete to keep both reachable.
    ...(compact
      ? [
          {
            key: "edit",
            icon: <Pencil size={16} aria-hidden focusable={false} />,
            label: t("common.edit"),
            onClick: () => pick(onEdit),
          },
          {
            key: "delete",
            icon: <Trash2 size={16} aria-hidden focusable={false} />,
            label: t("common.delete"),
            onClick: () => pick(onDelete),
          },
        ]
      : []),
    {
      key: "balance",
      icon: <Scale size={16} aria-hidden focusable={false} />,
      label: t("loansSheet.updateBalance"),
      disabled: isLinked,
      title: isLinked ? t("loansSheet.linkedBalanceHint") : undefined,
      onClick: () => pick(() => onUpdateBalance(loan.id)),
    },
    {
      key: "import",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("loansSheet.importPayments"),
      onClick: () => pick(() => onImportPayments(loan.id)),
    },
    {
      key: "view",
      icon: <Eye size={16} aria-hidden focusable={false} />,
      label: t("loansSheet.viewPayments"),
      disabled: !hasPayments,
      title: hasPayments ? undefined : t("loansSheet.noPayments"),
      onClick: () => pick(() => onViewPayments(loan.id)),
    },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={ACTIONS_MENU_TRIGGER_CLASS}
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
        placement={ACTIONS_MENU_PLACEMENT}
        rowId={loan.id}
        className="overflow-hidden"
      >
        <ul role="menu" className="py-1">
          {items.map((it) => (
            <li key={it.key} role="none">
              <button
                type="button"
                role="menuitem"
                aria-disabled={it.disabled || undefined}
                title={it.title}
                onClick={(e) => {
                  // The panel is portalled, but React routes synthetic
                  // events through the component tree — without this the
                  // click bubbles up to the row's onClick and also fires
                  // its tap action (opening the View loan modal behind the
                  // one this item just opened).
                  e.stopPropagation();
                  if (it.disabled) return;
                  it.onClick();
                }}
                className={menuItemClass(it.disabled)}
              >
                <span
                  aria-hidden
                  className={it.disabled ? "text-muted" : "text-accent"}
                >
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
