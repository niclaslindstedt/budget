import { useCallback, useRef, useState } from "react";
import { FileText, MoreHorizontal } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Salary } from "../../data/types";
import { FloatingPanel } from "../FloatingPanel";

type Props = {
  salary: Salary;
  // Whether the active storage backend can serve payslip files. Mirrors
  // the gate on the edit modal's View button — a stored `payslipPath`
  // alone isn't enough when the current backend (e.g. localStorage) has
  // no payslips capability.
  canViewPayslip: boolean;
  // Download + open the payslip in the in-app viewer. Same effect as
  // opening Edit and pressing View on the uploaded payslip.
  onViewPayslip: (salary: Salary) => void;
  // Fired after picking any menu item so the parent can dismiss its
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
  onClick: () => void;
};

export function SalaryEntryActionsMenu({
  salary,
  canViewPayslip,
  onViewPayslip,
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

  const items: MenuItem[] = [];

  if (canViewPayslip && salary.payslipPath !== undefined) {
    items.push({
      key: "viewPayslip",
      icon: <FileText size={16} aria-hidden focusable={false} />,
      label: t("salary.viewPayslip"),
      onClick: () => pick(() => onViewPayslip(salary)),
    });
  }

  // No row-level actions available (the common case: no payslip
  // attached) — render nothing so the swipe strip stays at two buttons.
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
        rowId={salary.id}
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
