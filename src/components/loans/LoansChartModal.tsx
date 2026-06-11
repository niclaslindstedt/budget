import { useMemo, useState } from "react";
import { ChartArea } from "lucide-react";

import {
  buildLoanBalanceBands,
  buildLoanPaymentBands,
  type LoanBandSeries,
} from "../../data/loans/series";
import { averageMonthlyNetAt } from "../../data/salary/salary";
import type { Loan, Property, Salary, Settings } from "../../data/types";
import { useIsMobile, useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import {
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { Checkbox } from "../form";
import { Modal } from "../Modal";
import {
  ChartRangeRow,
  chartRangeCutoffMs,
  DEFAULT_CHART_RANGE,
  type ChartRange,
} from "../charts/ChartRangeRow";
import {
  StackedAreaChart,
  type StackedChartSeries,
} from "../charts/StackedAreaChart";
import { StackedBarChart } from "../charts/StackedBarChart";

// "Visualize loans" for the Loans sheet — every loan is its own colored
// layer, so the top of the stack reads as the total and each layer as that
// loan's contribution. Two views behind a segmented toggle: Balances
// (outstanding debt over time, a smooth stacked area) and Payments (what
// was paid each month, stacked bars — a skipped month is an honest gap, not
// a curve gliding across it), the latter with an optional combined
// estimated-interest segment broken out of each month's amounts. Student
// loans and mortgages can be excluded from the stack. The heavy lifting
// lives in the reusable `StackedAreaChart` / `StackedBarChart` primitives
// and the pure `buildLoanBalanceBands` / `buildLoanPaymentBands` builders;
// this modal only maps loans to themed, translated series and owns the
// toggles. Mirrors `SavingsValueChartModal`.
//
// A "multiple of monthly salary" modifier (hidden when no salaries are
// recorded) divides every band's value at each sample by the household's
// average monthly net salary effective at that date
// (`averageMonthlyNetAt`), so the Balances stack reads as months of
// take-home pay owed and the Payments bars as the share of a paycheck
// spent on loans — a debt-to-income view that stays honest when the
// salary grows over time.
//
// The shared `ChartRangeRow` (1Y / 2Y / 3Y / 5Y / All) clips the series
// to a trailing window — the builders sample from the loan's start,
// which on an old loan with only recent transactions is a long useless flat
// line, so the default range trims it. The Balances view also carries a
// signed balance-change badge for the visible window: a debt that *shrank*
// reads as a negative percent in `--positive` green (paying off is good),
// a debt that *grew* as a positive percent in `--negative` red.
//
// `centered`: the only controls are toggles, so nothing opens the soft
// keyboard.

type Props = {
  open: boolean;
  loans: Loan[];
  properties: Property[];
  salaries: Salary[];
  settings: Settings;
  onClose: () => void;
};

type ChartView = "balances" | "payments";

// Band colours for loans without a user-picked colour, assigned by sorted
// index. `--danger` is deliberately absent — it's reserved for the
// broken-out Interest band.
const FALLBACK_COLORS = [
  "--accent",
  "--path",
  "--flag",
  "--pipe",
  "--link",
  "--success",
] as const;

export function LoansChartModal({
  open,
  loans,
  properties,
  salaries,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [view, setView] = useState<ChartView>("balances");
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  const [includeStudent, setIncludeStudent] = useState(true);
  const [includeMortgages, setIncludeMortgages] = useState(true);
  const [breakOutInterest, setBreakOutInterest] = useState(false);
  const [salaryMultiple, setSalaryMultiple] = useState(false);
  useResetOnOpen(open, undefined, () => {
    setView("balances");
    setRange(DEFAULT_CHART_RANGE);
    setIncludeStudent(true);
    setIncludeMortgages(true);
    setBreakOutInterest(false);
    setSalaryMultiple(false);
  });

  // Same stable order as the page's table, so band colours don't reshuffle
  // between opens.
  const sorted = useMemo(
    () => loans.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [loans],
  );

  if (!open) return null;

  const options = { includeStudent, includeMortgages };
  const today = todayIso();
  const bands =
    view === "balances"
      ? {
          loans: buildLoanBalanceBands(sorted, properties, today, options),
          interest: null,
        }
      : buildLoanPaymentBands(sorted, properties, today, {
          ...options,
          breakOutInterest,
        });

  // The loan's own colour when picked, a deterministic theme token
  // otherwise — keyed by the loan's index in the sorted list so a band
  // keeps its colour when toggles drop neighbours from the stack.
  const colorFor = (band: LoanBandSeries): string => {
    const index = sorted.findIndex((l) => l.id === band.loanId);
    const loan = index >= 0 ? sorted[index] : undefined;
    return loan?.color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
  };

  let fullSeries: StackedChartSeries[] = bands.loans.map((band) => ({
    id: band.loanId,
    label: sorted.find((l) => l.id === band.loanId)?.name ?? band.loanId,
    color: colorFor(band),
    points: band.points,
  }));
  if (bands.interest !== null) {
    fullSeries.push({
      id: "interest",
      label: t("loansSheet.chartInterest"),
      color: "--danger",
      points: bands.interest,
    });
  }

  // Salary-multiple modifier: divide every band's value by the household's
  // average monthly net salary at that sample. The divisor is resolved once
  // per sample x (the builders give every band the same x array) and a
  // sample with no resolvable divisor is dropped from every band alike, so
  // the stack stays aligned. The checkbox is hidden when no salaries exist,
  // so a fully-empty divisor map can't blank the chart silently.
  const hasSalaries = salaries.length > 0;
  const showSalaryMultiple = salaryMultiple && hasSalaries;
  if (showSalaryMultiple) {
    const divisorByX = new Map<number, number | null>();
    for (const p of fullSeries[0]?.points ?? []) {
      const iso = new Date(p.x).toISOString().slice(0, 10);
      divisorByX.set(p.x, averageMonthlyNetAt(salaries, iso));
    }
    fullSeries = fullSeries.map((s) => ({
      ...s,
      points: s.points.flatMap((p) => {
        const divisor = divisorByX.get(p.x);
        if (divisor === null || divisor === undefined) return [];
        return [{ ...p, y: p.y / divisor }];
      }),
    }));
  }

  // Clip every band to the trailing window. The builders sample every band
  // over one shared x array, so the same cutoff keeps them aligned.
  const cutoffMs = chartRangeCutoffMs(range, today);
  const series: StackedChartSeries[] = fullSeries.map((s) => ({
    ...s,
    points:
      range === "all" ? s.points : s.points.filter((p) => p.x >= cutoffMs),
  }));

  const noneIncluded =
    loans.length > 0 &&
    sorted.every(
      (loan) =>
        (loan.kind === "student" && !includeStudent) ||
        (loan.kind === "mortgage" && !includeMortgages),
    );
  // The loan has chartable data at all (independent of the range), vs. the
  // selected window actually containing ≥ 2 samples to draw.
  const hasAnyData =
    bands.loans.length > 0 && bands.loans[0].points.length >= 2;
  const hasChart = series.length > 0 && series[0].points.length >= 2;

  // Signed balance change across the visible window: total debt at the last
  // visible sample vs. the first. Negative ⇒ debt shrank (paid off) ⇒ green;
  // positive ⇒ debt grew ⇒ red. Only meaningful for the Balances view, where
  // the stack is outstanding debt (the Payments view stacks per-month spend).
  let changePct: number | null = null;
  if (view === "balances" && hasChart) {
    const n = series[0].points.length;
    const sumAt = (i: number) =>
      series.reduce((acc, s) => acc + (s.points[i]?.y ?? 0), 0);
    const first = sumAt(0);
    const last = sumAt(n - 1);
    if (first > 0) changePct = ((last - first) / first) * 100;
  }
  const formatChangePct = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const body = Math.abs(value)
      .toFixed(1)
      .replace(".", settings.decimalSeparator);
    return `${sign}${body}%`;
  };
  const changeColor =
    changePct === null
      ? "var(--muted)"
      : changePct < 0
        ? "var(--positive)"
        : changePct > 0
          ? "var(--negative)"
          : "var(--muted)";

  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  // Desktop renders the full grouped figure (the chart sizes its left gutter
  // to fit); mobile is too narrow for that, so the Y axis always abbreviates
  // with one forced decimal — without it nearby ticks collapse to an
  // identical "100K kr". In salary-multiple mode the values are unitless
  // ratios (a mortgage is tens of monthly salaries, a month's payment a
  // fraction of one), so one decimal plus "×" replaces the currency.
  const formatY = (y: number) =>
    showSalaryMultiple
      ? `${y.toFixed(1).replace(".", settings.decimalSeparator)}×`
      : withCurrency(
          formatNumber(
            y,
            isMobile ? { ...settings, showDecimals: true } : settings,
            isMobile ? { forceAbbreviate: true } : {},
          ),
          settings,
        );

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="loans-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<ChartArea size={14} aria-hidden focusable={false} />}
        title={t("loansSheet.visualizeLoans")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div
            role="group"
            aria-label={t("loansSheet.chartViewAria")}
            className="relative flex rounded border border-line bg-surface-3 text-sm"
          >
            {/* The sliding "active" pill — mirrors MortgageViewToggle; the
                global reduce-motion rule zeroes the transition. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded bg-surface transition-transform"
              style={{
                transform:
                  view === "payments" ? "translateX(100%)" : "translateX(0)",
              }}
            />
            {(["balances", "payments"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-3 py-1.5 transition-colors ${
                  view === mode ? "text-accent" : "text-muted hover:text-fg"
                }`}
              >
                {mode === "balances"
                  ? t("loansSheet.chartBalances")
                  : t("loansSheet.chartPayments")}
              </button>
            ))}
          </div>

          {noneIncluded ? (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("loansSheet.chartNoneIncluded")}
            </div>
          ) : !hasAnyData ? (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("loansSheet.chartEmpty")}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {hasChart ? (
                <div className="flex flex-col gap-2">
                  {view === "balances" ? (
                    <StackedAreaChart
                      series={series}
                      formatX={formatX}
                      formatY={formatY}
                      totalLabel={t("loansSheet.chartTotal")}
                    />
                  ) : (
                    <StackedBarChart
                      series={series}
                      formatX={formatX}
                      formatY={formatY}
                      totalLabel={t("loansSheet.chartTotal")}
                    />
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {series.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: s.color.startsWith("--")
                              ? `var(${s.color})`
                              : s.color,
                          }}
                        />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
                  {t("loansSheet.chartNoneInRange")}
                </div>
              )}

              {/* Range row: clip the window, and (Balances only) show the
                  signed balance change for it. */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <ChartRangeRow value={range} onChange={setRange} />
                {view === "balances" && changePct !== null && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted">
                      {t("loansSheet.chartBalanceChange")}
                    </span>
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: changeColor }}
                    >
                      {formatChangePct(changePct)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Checkbox
              checked={includeStudent}
              onChange={() => setIncludeStudent((prev) => !prev)}
              label={t("loansSheet.chartIncludeStudent")}
            />
            <Checkbox
              checked={includeMortgages}
              onChange={() => setIncludeMortgages((prev) => !prev)}
              label={t("loansSheet.chartIncludeMortgages")}
            />
            {view === "payments" && (
              <Checkbox
                checked={breakOutInterest}
                onChange={() => setBreakOutInterest((prev) => !prev)}
                label={t("loansSheet.chartBreakOutInterest")}
              />
            )}
            {hasSalaries && (
              <Checkbox
                checked={salaryMultiple}
                onChange={() => setSalaryMultiple((prev) => !prev)}
                label={t("loansSheet.chartSalaryMultiple")}
              />
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
