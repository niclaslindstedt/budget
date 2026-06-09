import { useCallback, useRef, useState } from "react";
import { Download, Eye, MoreHorizontal } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Loan } from "../../data/types";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  loan: Loan;
  // True when the loan (or its linked mortgage) has recorded payments —
  // gates the View entry (which has nothing to show otherwise).
  hasPayments: boolean;
  // Open the payment-import modal — candidates are bank entries typed with
  // the loan's kind or matching its learned payment patterns.
  onImportPayments: (loanId: string) => void;
  // Open the recorded-payments list.
  onViewPayments: (loanId: string) => void;
  // Fired after picking the menu item so the parent row can dismiss its
  // swipe state in the same frame the dropdown closes.
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
  disabled?: boolean;
  title?: string;
  onClick: () => void;
};

// The "…" overflow popover in a loan row's swipe strip. Imports payments
// from bank transactions and views the recorded list. Mirrors
// `SavingActionsMenu`.
export function LoanActionsMenu({
  loan,
  hasPayments,
  onImportPayments,
  onViewPayments,
  onAction,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function pick(handler: () => void) {
    setOpen(false);
    onAction();
    handler();
  }

  const items: MenuItem[] = [
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
                onClick={() => {
                  if (it.disabled) return;
                  it.onClick();
                }}
                className={`flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left font-mono text-sm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  it.disabled
                    ? "cursor-not-allowed text-muted opacity-50"
                    : "cursor-pointer text-fg hover:bg-surface"
                }`}
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
