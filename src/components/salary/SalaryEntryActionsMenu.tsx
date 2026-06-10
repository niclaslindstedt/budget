import { useCallback, useRef, useState } from "react";
import { FileText, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import type { Salary } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { FloatingPanel } from "../FloatingPanel";

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
