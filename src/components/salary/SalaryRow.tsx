import { memo } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { resolveSalary, roleForDate } from "../../data/salary/salary";
import type { Employer, Salary, Settings, TaxParams } from "../../data/types";
import { useRowSwipe } from "../../hooks/useRowSwipe";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatMonthLabel } from "../../utils/format";
import { CategoryIconGlyph } from "../icons";
import { useClaimActiveRow } from "../useClaimActiveRow";

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
};

// One small pill per non-zero absence-day count, so an off-average
// paycheck carries its own explanation inline.
function DayBadges({ salary }: { salary: Salary }) {
  const t = useT();
  const badges: Array<{ key: string; label: string; n: number }> = [];
  if (salary.careOfChildDays)
    badges.push({
      key: "vab",
      label: t("salary.careOfChildShort"),
      n: salary.careOfChildDays,
    });
  if (salary.parentalLeaveDays)
    badges.push({
      key: "parental",
      label: t("salary.parentalLeaveShort"),
      n: salary.parentalLeaveDays,
    });
  if (salary.vacationDays)
    badges.push({
      key: "vacation",
      label: t("salary.vacationShort"),
      n: salary.vacationDays,
    });
  if (salary.sickDays)
    badges.push({
      key: "sick",
      label: t("salary.sickShort"),
      n: salary.sickDays,
    });
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.key}
          className="rounded-full border border-line px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted"
        >
          {b.label} {t("salary.daysValue", { n: String(b.n) })}
        </span>
      ))}
    </span>
  );
}

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
}: Props) {
  const t = useT();
  const lang = useLang();
  const title = roleForDate(employer, salary.date)?.title;
  // Bulk-select mode suppresses the per-row swipe so the gesture doesn't
  // fight the select tap, matching the budget sheet.
  const { swiped, setSwiped, touchHandlers } = useRowSwipe({
    disabled: selectMode,
  });
  // A swiped row exposes edit / delete; claim the active-row slot so a
  // tap elsewhere only retracts the swipe instead of also firing the
  // control underneath.
  useClaimActiveRow(salary.id, swiped, () => setSwiped(false));
  const { gross, tax, estimated } = resolveSalary(salary, taxParams);
  // Estimated gross / tax render muted + italic with a "≈" prefix and a
  // tooltip, so an estimate is visually distinct from an entered figure.
  const estTitle = estimated ? t("tax.estimatedTitle") : undefined;
  const estClass = estimated ? "text-muted italic" : "text-fg";

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
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(salary.id)}
            className="h-4 w-4 accent-accent"
            aria-label={t("salary.editAria", {
              month: formatMonthLabel(salary.date.slice(0, 7), lang),
            })}
          />
        </td>
      )}
      <td className="px-2.5 py-2 align-middle font-mono whitespace-nowrap text-fg-bright">
        {formatMonthLabel(salary.date.slice(0, 7), lang)}
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
        className={`px-2.5 py-2 text-right align-middle font-mono whitespace-nowrap tabular-nums ${estClass}`}
        title={estTitle}
      >
        {estimated && `${t("tax.estimatedBadge")} `}
        {formatBalance(gross, settings)}
      </td>
      <td
        className="salary-secondary-cell hidden px-2.5 py-2 text-right align-middle font-mono whitespace-nowrap text-muted tabular-nums md:table-cell"
        title={estTitle}
      >
        {estimated && `${t("tax.estimatedBadge")} `}
        {formatBalance(tax, settings)}
      </td>
      <td className="px-2.5 py-2 text-right align-middle font-mono whitespace-nowrap text-fg-bright tabular-nums">
        {formatBalance(salary.net, settings)}
      </td>
      <td className="salary-secondary-cell hidden px-2.5 py-2 align-middle md:table-cell">
        <DayBadges salary={salary} />
      </td>
      <td className="salary-action-cell w-24 p-0 align-middle">
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
        </div>
      </td>
    </tr>
  );
}

export const SalaryRow = memo(SalaryRowImpl);
