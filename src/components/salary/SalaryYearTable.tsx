import { useMemo } from "react";

import { salaryGross } from "../../data/salary/salary";
import type { Employer, Salary, Settings } from "../../data/types";
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
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (salaryId: string) => void;
  onEdit: (salaryId: string) => void;
  onDelete: (salary: Salary) => void;
};

// One table per calendar year, mirroring the budget page's per-month
// tables: a sticky year-tinted header, a column header row, the month
// rows, and a footer that totals brutto + netto for the year.
export function SalaryYearTable({
  year,
  salaries,
  employersById,
  settings,
  selectMode,
  selectedIds,
  onToggleSelect,
  onEdit,
  onDelete,
}: Props) {
  const t = useT();

  const totals = useMemo(() => {
    let gross = 0;
    let net = 0;
    for (const s of salaries) {
      gross += salaryGross(s);
      net += s.net;
    }
    return { gross, net };
  }, [salaries]);

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
        <table className="accounts-table w-full border-collapse text-sm md:text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-3 text-xs font-bold tracking-wider uppercase text-muted">
              {selectMode && <th scope="col" className="w-10 px-2.5 py-2" />}
              <th scope="col" className="px-2.5 py-2 text-left">
                {t("salary.month")}
              </th>
              <th scope="col" className="px-2.5 py-2 text-left">
                {t("salary.employer")}
              </th>
              <th
                scope="col"
                className="hidden px-2.5 py-2 text-left sm:table-cell"
              >
                {t("salary.title")}
              </th>
              <th scope="col" className="px-2.5 py-2 text-right">
                {t("salary.gross")}
              </th>
              <th
                scope="col"
                className="hidden px-2.5 py-2 text-right sm:table-cell"
              >
                {t("salary.tax")}
              </th>
              <th scope="col" className="px-2.5 py-2 text-right">
                {t("salary.net")}
              </th>
              <th
                scope="col"
                className="hidden px-2.5 py-2 text-left md:table-cell"
              >
                {t("salary.days")}
              </th>
              <th
                scope="col"
                className="w-24 px-2.5 py-2"
                aria-label={t("salary.actions")}
              />
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
                selectMode={selectMode}
                selected={selectedIds.has(salary.id)}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
            <tr className="border-t border-line bg-surface-3 font-mono text-xs font-bold text-fg-bright">
              {selectMode && <td className="px-2.5 py-2" />}
              <td className="px-2.5 py-2 text-left tracking-wider uppercase text-muted">
                {t("salary.yearTotal")}
              </td>
              <td className="px-2.5 py-2" />
              <td className="hidden px-2.5 py-2 sm:table-cell" />
              <td className="px-2.5 py-2 text-right tabular-nums">
                {formatBalance(totals.gross, settings)}
              </td>
              <td className="hidden px-2.5 py-2 sm:table-cell" />
              <td className="px-2.5 py-2 text-right tabular-nums">
                {formatBalance(totals.net, settings)}
              </td>
              <td className="hidden px-2.5 py-2 md:table-cell" />
              <td className="px-2.5 py-2" />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
