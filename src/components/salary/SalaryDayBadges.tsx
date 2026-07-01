import { useT } from "../../i18n";

// The four absence-day counts a paycheck (or a year's worth of them)
// can carry. Every field is optional / zero-able so the same shape backs
// a single salary and an aggregated year total.
export type DayCounts = {
  careOfChildDays?: number;
  parentalLeaveDays?: number;
  vacationDays?: number;
  sickDays?: number;
};

// One small pill per non-zero absence-day count — used both per row (an
// off-average paycheck carrying its own explanation inline) and in the
// year total footer (a year's summed leave at a glance). Renders nothing
// when every count is zero.
export function SalaryDayBadges({ days }: { days: DayCounts }) {
  const t = useT();
  const badges: Array<{ key: string; label: string; n: number }> = [];
  if (days.careOfChildDays)
    badges.push({
      key: "vab",
      label: t("salary.careOfChildShort"),
      n: days.careOfChildDays,
    });
  if (days.parentalLeaveDays)
    badges.push({
      key: "parental",
      label: t("salary.parentalLeaveShort"),
      n: days.parentalLeaveDays,
    });
  if (days.vacationDays)
    badges.push({
      key: "vacation",
      label: t("salary.vacationShort"),
      n: days.vacationDays,
    });
  if (days.sickDays)
    badges.push({
      key: "sick",
      label: t("salary.sickShort"),
      n: days.sickDays,
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
