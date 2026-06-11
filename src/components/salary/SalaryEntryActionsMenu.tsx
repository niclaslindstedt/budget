import { FileText, Pencil, Trash2, Upload } from "lucide-react";

import { useT } from "../../i18n";
import type { Salary } from "../../data/types";
import { useActionsCompact } from "../ActionsCompactContext";
import { ActionsMenu } from "../form/ActionsMenu";
import { type MenuItem } from "../form/menu";

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

  const items: MenuItem[] = [];

  // In the compact layout the inline pen / trash are hidden, so the menu
  // leads with Edit / Delete to keep both reachable (and so the ⋯ button
  // renders even when the backend can't hold payslips).
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
      onClick: () => onManagePayslip(salary),
    });
  }

  // When no entries apply (the backend can't hold payslips and the wide
  // layout keeps Edit / Delete inline) the shell renders nothing, so the
  // swipe strip stays at two buttons.
  return (
    <ActionsMenu
      items={items}
      ariaLabel={t("cell.moreActions")}
      rowId={salary.id}
      // The salary row's own tap retracts the swipe — keep menu clicks
      // from bubbling into it.
      stopPropagation
      onPick={onAction}
    />
  );
}
