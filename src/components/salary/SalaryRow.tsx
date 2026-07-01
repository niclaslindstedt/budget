import { memo } from "react";
import { FileText, Pencil, Trash2 } from "lucide-react";

import { resolveSalary, roleForSalary } from "../../data/salary/salary";
import type { Employer, Salary, Settings, TaxParams } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import {
  formatBalance,
  formatMonthLabel,
  formatMonthName,
} from "../../utils/format";
import { CategoryIconGlyph } from "../icons";
import { useRowSwipeAndClaim } from "../useRowSwipeAndClaim";
import { SalaryDayBadges } from "./SalaryDayBadges";
import { SalaryEntryActionsMenu } from "./SalaryEntryActionsMenu";

type Props = {
  salary: Salary;
  employer: Employer | undefined;
  settings: Settings;
  // Tax params from the sheet's profile, or null for no estimation.
  taxParams: TaxParams | null;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: (salaryId: string) => void;
  onEdit: (salaryId: string) => void;
  onDelete: (salary: Salary) => void;
  // Whether the active storage backend can hold payslip files — gates the
  // payslip entry in the row's "…" menu (upload / view / replace / remove).
  canManagePayslip: boolean;
  onManagePayslip: (salary: Salary) => void;
};

function SalaryRowImpl({
  salary,
  employer,
  settings,
  taxParams,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  canManagePayslip,
  onManagePayslip,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass } = useAmountColumns();
  const title = roleForSalary(salary, employer)?.title;
  // Bulk-select mode suppresses the per-row swipe so the gesture doesn't
  // fight the select tap, matching the budget sheet. A swiped row exposes
  // edit / delete; the active-row claim (folded into the hook) makes a
  // tap elsewhere only retract the swipe instead of firing the control
  // underneath.
  const { swiped, setSwiped, touchHandlers } = useRowSwipeAndClaim(salary.id, {
    disabled: selectMode,
  });
  const { gross, tax, estimated } = resolveSalary(salary, taxParams);
  // Estimated gross / tax render muted + italic with a "≈" prefix and a
  // tooltip, so an estimate is visually distinct from an entered figure.
  const estTitle = estimated ? t("tax.estimatedTitle") : undefined;
  const estClass = estimated ? "text-muted italic" : "text-fg";
  // Show a payslip icon beside the gross figure once a file is attached and
  // the backend can read it; tapping it opens the same attachment modal as
  // the row's "…" menu.
  const showPayslipIcon = canManagePayslip && salary.payslipPath !== undefined;

  return (
    <tr
      className={`border-b border-line last:border-b-0 hover:bg-surface-2${
        swiped && !selectMode ? " is-swiped" : ""
      }`}
      data-row-id={salary.id}
      data-swipe-handled
      onClick={() => {
        if (swiped) setSwiped(false);
      }}
      {...touchHandlers}
    >
      {selectMode && (
        <td className="w-10 px-2.5 py-2 text-center align-middle">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(salary.id);
            }}
            className={`inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 ${
              selected ? "text-accent" : "text-muted"
            }`}
            aria-label={t(
              selected ? "salary.deselectRowAria" : "salary.selectRowAria",
              { month: formatMonthLabel(salary.date.slice(0, 7), lang) },
            )}
            aria-pressed={selected}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                selected
                  ? "border-accent bg-accent text-page-bg"
                  : "border-muted"
              }`}
            >
              {selected ? "✓" : ""}
            </span>
          </button>
        </td>
      )}
      <td className="px-2.5 py-2 align-middle font-mono whitespace-nowrap text-fg-bright">
        {formatMonthName(salary.date.slice(0, 7), lang)}
      </td>
      <td className="px-2.5 py-2 align-middle">
        {employer ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden style={{ color: employer.color ?? undefined }}>
              <CategoryIconGlyph name={employer.glyph ?? "wallet"} size={14} />
            </span>
            <span className="truncate text-fg">{employer.name}</span>
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="salary-secondary-cell hidden px-2.5 py-2 align-middle text-fg md:table-cell">
        {title ?? <span className="text-muted">—</span>}
      </td>
      <td
        className={`px-2.5 py-2 align-middle font-mono whitespace-nowrap tabular-nums ${cellClass} ${estClass}`}
        title={estTitle}
      >
        {showPayslipIcon ? (
          // Document glyph + amount fused into one tappable pill that
          // opens the payslip attachment modal (same target as the row's
          // "…" menu). Inherits the cell's estimate styling; the pill
          // chrome's width is reserved in the gross column via
          // --salary-gross-col-buffer so it never clips.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onManagePayslip(salary);
            }}
            aria-label={t("salary.viewPayslipAria", {
              month: formatMonthLabel(salary.date.slice(0, 7), lang),
            })}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-inherit hover:border-accent hover:bg-surface-3 hover:text-accent"
          >
            <FileText
              size={14}
              aria-hidden
              focusable={false}
              className="shrink-0"
            />
            <span>
              {estimated && `${t("tax.estimatedBadge")} `}
              {formatBalance(gross, settings)}
            </span>
          </button>
        ) : (
          <span>
            {estimated && `${t("tax.estimatedBadge")} `}
            {formatBalance(gross, settings)}
          </span>
        )}
      </td>
      <td
        className={`salary-secondary-cell hidden px-2.5 py-2 align-middle font-mono whitespace-nowrap text-muted tabular-nums md:table-cell ${cellClass}`}
        title={estTitle}
      >
        {estimated && `${t("tax.estimatedBadge")} `}
        {formatBalance(tax, settings)}
      </td>
      <td
        className={`px-2.5 py-2 align-middle font-mono whitespace-nowrap text-fg-bright tabular-nums ${cellClass}`}
      >
        {formatBalance(salary.net, settings)}
      </td>
      <td className="salary-secondary-cell hidden px-2.5 py-2 align-middle md:table-cell">
        <SalaryDayBadges days={salary} />
      </td>
      <td className="swipe-action-cell salary-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onEdit(salary.id);
            }}
            aria-label={t("salary.editAria", {
              month: formatMonthLabel(salary.date.slice(0, 7), lang),
            })}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onDelete(salary);
            }}
            aria-label={t("salary.deleteAria", {
              month: formatMonthLabel(salary.date.slice(0, 7), lang),
            })}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
          <SalaryEntryActionsMenu
            salary={salary}
            canManagePayslip={canManagePayslip}
            onManagePayslip={onManagePayslip}
            onEdit={() => onEdit(salary.id)}
            onDelete={() => onDelete(salary)}
            onAction={() => setSwiped(false)}
          />
        </div>
      </td>
    </tr>
  );
}

export const SalaryRow = memo(SalaryRowImpl);
