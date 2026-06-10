import { useMemo, useState } from "react";
import { ChartArea } from "lucide-react";

import {
  buildLoanBalanceBands,
  buildLoanPaymentBands,
  type LoanBandSeries,
} from "../../data/loans/series";
import type { Loan, Property, Settings } from "../../data/types";
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
// `centered`: the only controls are toggles, so nothing opens the soft
// keyboard.

type Props = {
  open: boolean;
  loans: Loan[];
  properties: Property[];
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
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [view, setView] = useState<ChartView>("balances");
  const [includeStudent, setIncludeStudent] = useState(true);
  const [includeMortgages, setIncludeMortgages] = useState(true);
  const [breakOutInterest, setBreakOutInterest] = useState(false);
  useResetOnOpen(open, undefined, () => {
    setView("balances");
    setIncludeStudent(true);
    setIncludeMortgages(true);
    setBreakOutInterest(false);
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

  const series: StackedChartSeries[] = bands.loans.map((band) => ({
    id: band.loanId,
    label: sorted.find((l) => l.id === band.loanId)?.name ?? band.loanId,
    color: colorFor(band),
    points: band.points,
  }));
  if (bands.interest !== null) {
    series.push({
      id: "interest",
      label: t("loansSheet.chartInterest"),
      color: "--danger",
      points: bands.interest,
    });
  }

  const noneIncluded =
    loans.length > 0 &&
    sorted.every(
      (loan) =>
        (loan.kind === "student" && !includeStudent) ||
        (loan.kind === "mortgage" && !includeMortgages),
    );
  const hasChart = bands.loans.length > 0 && bands.loans[0].points.length >= 2;

  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  // Desktop renders the full grouped figure (the chart sizes its left gutter
  // to fit); mobile is too narrow for that, so the Y axis always abbreviates
  // with one forced decimal — without it nearby ticks collapse to an
  // identical "100K kr".
  const formatY = (y: number) =>
    withCurrency(
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
          ) : hasChart ? (
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
                  <span key={s.id} className="inline-flex items-center gap-1.5">
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
              {t("loansSheet.chartEmpty")}
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
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
