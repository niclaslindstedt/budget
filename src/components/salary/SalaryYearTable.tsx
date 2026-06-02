import { useMemo } from "react";
import {
  Banknote,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Receipt,
  Tag,
  Wallet,
  Wrench,
} from "lucide-react";

import { resolveSalary } from "../../data/salary/salary";
import type { Employer, Salary, Settings, TaxParams } from "../../data/types";
import { useT } from "../../i18n";
import { formatBalance } from "../../utils/format";
import { monthColorVar } from "../../utils/monthColor";
import { SalaryRow } from "./SalaryRow";

type Props = {
  year: string;
  // Salaries for this year, already sorted newest-first.
  salaries: readonly Salary[];
  employersById: ReadonlyMap<string, Employer>;
  settings: Settings;
  // Tax params from the sheet's profile, or null for no estimation.
  taxParams: TaxParams | null;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (salaryId: string) => void;
  onToggleSelectYear: (salaryIds: string[], target: boolean) => void;
  onEdit: (salaryId: string) => void;
  onDelete: (salary: Salary) => void;
  // Whether the active storage backend can hold payslip files — gates the
  // payslip entry in each row's "…" menu (upload / view / replace / remove).
  canManagePayslip: boolean;
  onManagePayslip: (salary: Salary) => void;
};

// One table per calendar year, mirroring the budget page's per-month
// tables: a sticky year-tinted header, a column header row, the month
// rows, and a footer that totals brutto + netto for the year.
export function SalaryYearTable({
  year,
  salaries,
  employersById,
  settings,
  taxParams,
  selectMode,
  selectedIds,
  onToggleSelect,
  onToggleSelectYear,
  onEdit,
  onDelete,
  canManagePayslip,
  onManagePayslip,
}: Props) {
  const t = useT();

  const totals = useMemo(() => {
    let gross = 0;
    let net = 0;
    for (const s of salaries) {
      gross += resolveSalary(s, taxParams).gross;
      net += s.net;
    }
    return { gross, net };
  }, [salaries, taxParams]);

  // Drives the year header's "select all" tri-state checkbox, mirroring
  // the budget month table's per-month select-all.
  const { yearRowIds, allSelected, someSelected } = useMemo(() => {
    const ids = salaries.map((s) => s.id);
    const selectedCount = ids.reduce(
      (n, id) => (selectedIds.has(id) ? n + 1 : n),
      0,
    );
    return {
      yearRowIds: ids,
      allSelected: ids.length > 0 && selectedCount === ids.length,
      someSelected: selectedCount > 0 && selectedCount < ids.length,
    };
  }, [salaries, selectedIds]);

  // Give each year a stable pastel from the month palette so adjacent
  // year tables are visually distinct, like the per-month tints.
  const yearNum = Number(year);
  const headerColor = Number.isFinite(yearNum)
    ? monthColorVar((yearNum % 12) + 1)
    : undefined;

  return (
    <section className="mb-6">
      <h3
        className={`sticky top-[var(--app-header-h)] z-20 mb-1 bg-page-bg pt-1 pb-1 pl-2 text-xs font-bold tracking-wider uppercase md:pt-2 md:pb-2 md:pl-3 ${
          headerColor ? "" : "text-fg-bright"
        }`}
        style={headerColor ? { color: headerColor } : undefined}
      >
        {year}
      </h3>
      <div className="overflow-clip rounded border border-line bg-surface">
        <table
          className={`salary-table w-full border-collapse text-sm md:text-[13px]${
            selectMode ? " is-selecting" : ""
          }`}
        >
          <thead>
            <tr className="border-b border-line bg-surface-3 text-xs font-bold tracking-wider uppercase text-muted">
              {selectMode && (
                <th
                  scope="col"
                  className="w-10 px-2.5 py-2 text-center"
                  aria-label={t("salary.selectAllInYear")}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSelectYear(yearRowIds, !allSelected)}
                    disabled={yearRowIds.length === 0}
                    className="inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 disabled:opacity-30"
                    aria-label={
                      allSelected
                        ? t("salary.deselectAllInYear")
                        : t("salary.selectAllInYear")
                    }
                    aria-pressed={allSelected}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                        allSelected
                          ? "border-accent bg-accent text-page-bg"
                          : someSelected
                            ? "border-accent text-accent"
                            : "border-muted"
                      }`}
                    >
                      {allSelected ? "✓" : someSelected ? "–" : ""}
                    </span>
                  </button>
                </th>
              )}
              <th
                scope="col"
                className="px-2.5 py-2 text-left"
                aria-label={t("salary.month")}
              >
                <span className="inline-flex items-center gap-1.5 md:gap-2">
                  <CalendarDays
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">{t("salary.month")}</span>
                </span>
              </th>
              <th
                scope="col"
                className="px-2.5 py-2 text-left"
                aria-label={t("salary.employer")}
              >
                <span className="inline-flex items-center gap-1.5 md:gap-2">
                  <Briefcase
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">
                    {t("salary.employer")}
                  </span>
                </span>
              </th>
              <th
                scope="col"
                className="salary-secondary-cell hidden px-2.5 py-2 text-left md:table-cell"
                aria-label={t("salary.title")}
              >
                <span className="inline-flex items-center gap-1.5 md:gap-2">
                  <Tag
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">{t("salary.title")}</span>
                </span>
              </th>
              <th
                scope="col"
                className="px-2.5 py-2 text-right"
                aria-label={t("salary.gross")}
              >
                <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                  <Banknote
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">{t("salary.gross")}</span>
                </span>
              </th>
              <th
                scope="col"
                className="salary-secondary-cell hidden px-2.5 py-2 text-right md:table-cell"
                aria-label={t("salary.tax")}
              >
                <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                  <Receipt
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">{t("salary.tax")}</span>
                </span>
              </th>
              <th
                scope="col"
                className="px-2.5 py-2 text-right"
                aria-label={t("salary.net")}
              >
                <span className="inline-flex items-center justify-end gap-1.5 md:gap-2">
                  <Wallet
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">{t("salary.net")}</span>
                </span>
              </th>
              <th
                scope="col"
                className="salary-secondary-cell hidden px-2.5 py-2 text-left md:table-cell"
                aria-label={t("salary.days")}
              >
                <span className="inline-flex items-center gap-1.5 md:gap-2">
                  <CalendarClock
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">{t("salary.days")}</span>
                </span>
              </th>
              <th
                scope="col"
                className="salary-action-cell w-32 px-2.5 py-2"
                aria-label={t("salary.actions")}
              >
                <span className="flex items-center justify-center gap-1.5 md:gap-2">
                  <Wrench
                    size={16}
                    className="shrink-0 text-accent"
                    aria-hidden
                    focusable={false}
                  />
                  <span className="hidden md:inline">
                    {t("salary.actions")}
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {salaries.map((salary) => (
              <SalaryRow
                key={salary.id}
                salary={salary}
                employer={
                  salary.employerId
                    ? employersById.get(salary.employerId)
                    : undefined
                }
                settings={settings}
                taxParams={taxParams}
                selectMode={selectMode}
                selected={selectedIds.has(salary.id)}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                canManagePayslip={canManagePayslip}
                onManagePayslip={onManagePayslip}
              />
            ))}
            <tr className="border-t border-line bg-surface-3 font-mono text-xs font-bold text-fg-bright">
              {selectMode && <td className="px-2.5 py-2" />}
              <td className="px-2.5 py-2 text-left tracking-wider uppercase text-muted">
                {t("salary.yearTotal")}
              </td>
              <td className="px-2.5 py-2" />
              <td className="salary-secondary-cell hidden px-2.5 py-2 md:table-cell" />
              <td className="px-2.5 py-2 text-right tabular-nums">
                {formatBalance(totals.gross, settings)}
              </td>
              <td className="salary-secondary-cell hidden px-2.5 py-2 md:table-cell" />
              <td className="px-2.5 py-2 text-right tabular-nums">
                {formatBalance(totals.net, settings)}
              </td>
              <td className="salary-secondary-cell hidden px-2.5 py-2 md:table-cell" />
              <td className="salary-action-cell px-2.5 py-2" />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
