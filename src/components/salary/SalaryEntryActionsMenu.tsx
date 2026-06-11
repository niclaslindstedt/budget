import { useCallback, useRef, useState } from "react";
import { FileText, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";

import { useT } from "../../i18n";
import type { Salary } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";
import {
  ACTIONS_MENU_PLACEMENT,
  ACTIONS_MENU_TRIGGER_CLASS,
  MENU_ITEM_CLASS,
  type MenuItem,
} from "../form/menu";

type Props = {
  salary: Salary;
  // Whether the active storage backend can hold payslip files. The
  // localStorage backend has no payslips capability, so the whole entry is
  // hidden there; on a file-capable backend it always shows (to upload a
  // first payslip or view / replace an existing one).
  canManagePayslip: boolean;
  // Open the shared attachment modal for this salary's payslip — upload a
  // new one, or view / replace / remove the existing file.
  onManagePayslip: (salary: Salary) => void;
  // Edit / Delete handlers surfaced as menu items ONLY when the action
  // column has collapsed to the compact (⋯-only) layout — in the wide
  // layout these are the inline pen / trash buttons in the swipe strip.
  onEdit: () => void;
  onDelete: () => void;
  // Fired after picking any menu item so the parent can dismiss its
  // swipe state in the same frame the dropdown closes.
  onAction: () => void;
};

export function SalaryEntryActionsMenu({
  salary,
  canManagePayslip,
  onManagePayslip,
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
  // renders even when the backend can't hold payslips).
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

  if (canManagePayslip) {
    const hasPayslip = salary.payslipPath !== undefined;
    items.push({
      key: "payslip",
      icon: hasPayslip ? (
        <FileText size={16} aria-hidden focusable={false} />
      ) : (
        <Upload size={16} aria-hidden focusable={false} />
      ),
      label: hasPayslip ? t("salary.viewPayslip") : t("salary.payslipUpload"),
      onClick: () => pick(() => onManagePayslip(salary)),
    });
  }

  // No row-level actions available (the backend can't hold payslips) —
  // render nothing so the swipe strip stays at two buttons.
  if (items.length === 0) return null;

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
                className={MENU_ITEM_CLASS}
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
