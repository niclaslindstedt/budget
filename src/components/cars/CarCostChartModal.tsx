import { useState } from "react";
import { BarChart3 } from "lucide-react";

import {
  carCostPerDistance,
  carMonthlyCosts,
  carTotalCostOfOwnership,
} from "../../data/cars/costs";
import type { Car, EntryType, Loan, Settings } from "../../data/types";
import { useIsMobile, useResetOnOpen } from "../../hooks";
import { bcp47 } from "../../i18n/locale";
import { useLang, useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import {
  isoToMonthNum,
  monthNumToIsoEnd,
  monthNumToIsoStart,
  todayIso,
} from "../../utils/date";
import {
  distanceUnitLabel,
  formatBalance,
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { Checkbox } from "../form";
import { Modal } from "../Modal";
import {
  ChartRangeRow,
  DEFAULT_CHART_RANGE,
  chartRangeCutoffMs,
  type ChartRange,
} from "../charts/ChartRangeRow";
import {
  StackedBarChart,
  type StackedBarChartSeries,
  type StackedBarOverlay,
  type StackedBarReferenceLine,
  type StackedBarSelection,
} from "../charts/StackedBarChart";

// The cost-of-ownership view: linked expenses stacked per month by
// transport type, with the two computed legs — depreciation and loan
// interest — as toggleable bands so their weight against the running
// costs is visible. The header carries the range total and, once
// odometer data exists, the headline cost-per-km figure.
//
// `centered`: toggles and range pills only — nothing opens the soft
// keyboard.

type Props = {
  open: boolean;
  car: Car | null;
  loan: Loan | null;
  settings: Settings;
  // Merged preset + user types, for band labels.
  typesById: ReadonlyMap<string, EntryType>;
  onClose: () => void;
};

// Band colours for the per-type expense stacks, cycled in order. The
// computed legs keep two reserved tokens (`--meta` depreciation,
// `--danger` interest) so they never collide with an expense band.
const TYPE_COLORS = [
  "--accent",
  "--link",
  "--path",
  "--pipe",
  "--flag",
  "--success",
] as const;

// Window (in months) for the rolling-average overlay — a trailing mean of
// each month's total cost, so the noisy per-month bars read against a
// smoother "what a month typically costs" line.
const ROLLING_WINDOW = 3;

export function CarCostChartModal({
  open,
  car,
  loan,
  settings,
  typesById,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  const [includeDepreciation, setIncludeDepreciation] = useState(false);
  const [includeInterest, setIncludeInterest] = useState(false);
  // The pressed band of the monthly bar chart (a type/leg within one month),
  // or null. Highlights the bar section, turns the matching legend entry into
  // a filled pill, and surfaces the section's real cost.
  const [barSelection, setBarSelection] = useState<StackedBarSelection | null>(
    null,
  );

  useResetOnOpen(open, car?.id, () => {
    setRange(DEFAULT_CHART_RANGE);
    setIncludeDepreciation(false);
    setIncludeInterest(false);
    setBarSelection(null);
  });

  if (!open || !car) return null;

  const today = todayIso();
  const cutoffMs = chartRangeCutoffMs(range, today);

  // The contiguous month axis: from the earliest relevant month through
  // the current month, clipped to the selected range. Every series
  // shares it. Anchored on the first EXPENSE by default; the purchase
  // date only widens the axis when the depreciation band is on —
  // otherwise a car bought long before its first linked charge drags a
  // long all-zero lead-in into view.
  let earliest: string | undefined;
  for (const expense of car.expenses) {
    if (earliest === undefined || expense.date < earliest)
      earliest = expense.date;
  }
  if (includeDepreciation && car.purchaseDate !== undefined) {
    if (earliest === undefined || car.purchaseDate < earliest)
      earliest = car.purchaseDate;
  }
  const months: number[] = [];
  if (earliest !== undefined) {
    const endMonth = isoToMonthNum(today);
    for (let m = isoToMonthNum(earliest); m <= endMonth; m++) {
      if (Date.parse(monthNumToIsoStart(m)) >= cutoffMs) months.push(m);
    }
  }

  const fromIso = months.length > 0 ? monthNumToIsoStart(months[0]) : undefined;
  const toIso =
    months.length > 0 ? monthNumToIsoEnd(months[months.length - 1]) : undefined;
  const byMonth = carMonthlyCosts(car, fromIso, toIso);

  // One band per type present in the range, in first-seen (chronological)
  // order so colours stay stable as the range widens.
  const typeIds: string[] = [];
  for (const m of months) {
    for (const typeId of byMonth.get(m)?.keys() ?? []) {
      if (!typeIds.includes(typeId)) typeIds.push(typeId);
    }
  }

  const monthMs = months.map((m) => Date.parse(monthNumToIsoStart(m)));
  const series: StackedBarChartSeries[] = typeIds.map((typeId, i) => {
    const type = typesById.get(typeId);
    return {
      id: typeId,
      label: type ? displayTypeName(type, t) : t("carsSheet.uncategorizedType"),
      color: TYPE_COLORS[i % TYPE_COLORS.length],
      points: months.map((m, j) => ({
        x: monthMs[j],
        y: byMonth.get(m)?.get(typeId) ?? 0,
      })),
    };
  });

  // The computed legs as month-over-month deltas of their cumulative
  // figures, so each bar carries what that month actually cost. Clamped
  // at 0 — a recorded value snapshot can pull the cumulative
  // depreciation down, which is a gain, not a negative cost.
  const legsAt = (iso: string) =>
    carTotalCostOfOwnership(car, loan ?? undefined, iso);
  if (includeDepreciation && months.length > 0) {
    series.push({
      id: "depreciation",
      label: t("carsSheet.chartDepreciation"),
      color: "--meta",
      points: months.map((m, j) => {
        const now = legsAt(monthNumToIsoEnd(m)).depreciation;
        const before = legsAt(monthNumToIsoEnd(m - 1)).depreciation;
        if (now === undefined) return { x: monthMs[j], y: 0 };
        return { x: monthMs[j], y: Math.max(0, now - (before ?? 0)) };
      }),
    });
  }
  const hasInterest = loan !== null && legsAt(today).loanInterest !== undefined;
  if (includeInterest && hasInterest && months.length > 0) {
    series.push({
      id: "loanInterest",
      label: t("carsSheet.chartLoanInterest"),
      color: "--danger",
      points: months.map((m, j) => {
        const now = legsAt(monthNumToIsoEnd(m)).loanInterest;
        const before = legsAt(monthNumToIsoEnd(m - 1)).loanInterest;
        if (now === undefined) return { x: monthMs[j], y: 0 };
        return { x: monthMs[j], y: Math.max(0, now - (before ?? 0)) };
      }),
    });
  }

  // The rolling-average overlay: each month's total cost (every visible
  // band summed, so it tracks the toggled legs), smoothed by a trailing
  // mean over the last `ROLLING_WINDOW` months. The window shrinks at the
  // start of the axis so the line has a value from the first bar.
  const monthlyTotals = months.map((_, j) =>
    series.reduce((sum, s) => sum + (s.points[j]?.y ?? 0), 0),
  );
  const overlay: StackedBarOverlay | null =
    months.length > 0
      ? {
          id: "rollingAvg",
          label: t("carsSheet.rollingAverage", { n: ROLLING_WINDOW }),
          color: "--fg-bright",
          points: months.map((_, j) => {
            const start = Math.max(0, j - (ROLLING_WINDOW - 1));
            const window = monthlyTotals.slice(start, j + 1);
            const avg = window.reduce((acc, v) => acc + v, 0) / window.length;
            return { x: monthMs[j], y: avg };
          }),
        }
      : null;

  const hasChart =
    months.length > 0 && series.some((s) => s.points.some((p) => p.y > 0));

  const rangeTotal = series.reduce(
    (sum, s) => sum + s.points.reduce((acc, p) => acc + p.y, 0),
    0,
  );
  // A flat dashed baseline at the mean monthly cost — the whole-range total
  // spread evenly over its months, so the noisy bars read against "what a
  // month costs on average". Distinct from the (varying) rolling average.
  const referenceLine: StackedBarReferenceLine | null =
    months.length > 0
      ? {
          id: "monthlyAvg",
          label: t("carsSheet.monthlyAverage"),
          color: "--muted",
          y: rangeTotal / months.length,
        }
      : null;
  const perDistance = carCostPerDistance(car, loan ?? undefined, today);

  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  const formatY = (y: number) =>
    withCurrency(
      formatNumber(
        y,
        isMobile ? { ...settings, showDecimals: true } : settings,
        isMobile ? { forceAbbreviate: true } : {},
      ),
      settings,
    );
  const formatAmountFull = (n: number) =>
    formatBalance(n, settings, { neverAbbreviate: true });
  const percentFmt = new Intl.NumberFormat(bcp47(lang), {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const formatPercent = (share: number) => percentFmt.format(share);

  // Resolve a stored colour (a "--token" or a hex) to a CSS colour string.
  const cssColor = (color: string) =>
    color.startsWith("--") ? `var(${color})` : color;

  // The active selection resolved to its band, value, and share. Two shapes
  // feed one highlight: pressing a single bar section (`barSelection.x` set)
  // pins to that month — value is the section's real cost, read against that
  // month's bar; clicking a legend entry (`barSelection.x` omitted) selects
  // the whole band — value is its total across the range, read against the
  // range total. `rangeTotal` is the denominator for a whole-band selection.
  const selectedSection = (() => {
    if (!barSelection) return null;
    const s = series.find((b) => b.id === barSelection.seriesId);
    if (!s) return null;
    if (barSelection.x === undefined) {
      const value = s.points.reduce((sum, p) => sum + Math.max(0, p.y), 0);
      if (value <= 0) return null;
      return {
        mode: "category" as const,
        seriesId: s.id,
        label: s.label,
        color: s.color,
        value,
        share: rangeTotal > 0 ? value / rangeTotal : 0,
      };
    }
    const point = s.points.find((p) => p.x === barSelection.x);
    if (!point || point.y <= 0) return null;
    const monthTotal = series.reduce(
      (sum, b) => sum + (b.points.find((p) => p.x === barSelection.x)?.y ?? 0),
      0,
    );
    return {
      mode: "section" as const,
      seriesId: s.id,
      label: s.label,
      color: s.color,
      value: point.y,
      monthTotal,
      share: monthTotal > 0 ? point.y / monthTotal : 0,
      month: formatX(barSelection.x),
    };
  })();

  // Toggle a whole-band highlight from a legend entry: clear it if this band
  // is already the active whole-band selection, otherwise select it.
  const toggleTypeSelection = (seriesId: string) =>
    setBarSelection((cur) =>
      cur && cur.seriesId === seriesId && cur.x === undefined
        ? null
        : { seriesId },
    );

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="car-cost-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<BarChart3 size={14} aria-hidden focusable={false} />}
        title={t("carsSheet.costChartTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-sm font-bold text-fg-bright">{car.name}</p>
            <div className="flex items-baseline gap-3 text-xs text-muted">
              <span>
                {t("carsSheet.totalInRange")}{" "}
                <span className="font-bold tabular-nums text-fg-bright">
                  {formatBalance(rangeTotal, settings, {
                    neverAbbreviate: true,
                  })}
                </span>
              </span>
              {perDistance !== undefined && (
                <span>
                  {t("carsSheet.costPerDistance", {
                    unit: distanceUnitLabel(settings),
                  })}{" "}
                  <span className="font-bold tabular-nums text-fg-bright">
                    {/* Force decimals — see the card's per-km stat. */}
                    {formatBalance(
                      perDistance,
                      { ...settings, showDecimals: true },
                      { neverAbbreviate: true },
                    )}
                  </span>
                </span>
              )}
            </div>
          </div>

          <ChartRangeRow
            value={range}
            onChange={(next) => {
              setRange(next);
              setBarSelection(null);
            }}
          />

          {hasChart ? (
            <div className="flex flex-col gap-2">
              <StackedBarChart
                series={series}
                formatX={formatX}
                formatY={formatY}
                totalLabel={t("carsSheet.chartTotal")}
                overlay={overlay}
                referenceLine={referenceLine}
                selected={barSelection}
                onSelect={setBarSelection}
              />
              {/* Legend doubles as a control: clicking a band highlights it
                  across every month, the same selection pressing a single bar
                  section produces (pinned to one month). The overlay and
                  reference-line markers stay static — they're metrics over the
                  stacks, not selectable bands. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                {series.map((s) => {
                  const isSelected = selectedSection?.seriesId === s.id;
                  if (isSelected && selectedSection) {
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleTypeSelection(s.id)}
                        aria-pressed
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium"
                        style={{
                          backgroundColor: tintFill(cssColor(s.color)),
                          borderColor: tintBorder(cssColor(s.color)),
                          color: cssColor(s.color),
                        }}
                      >
                        <span className="truncate">{s.label}</span>
                        <span className="tabular-nums">
                          {formatAmountFull(selectedSection.value)}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleTypeSelection(s.id)}
                      aria-pressed={false}
                      aria-label={t("carsSheet.costChartSelectTypeAria", {
                        name: s.label,
                      })}
                      className={`inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-muted hover:text-fg ${
                        selectedSection ? "opacity-45" : ""
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: cssColor(s.color) }}
                      />
                      {s.label}
                    </button>
                  );
                })}
                {overlay && (
                  <span
                    key={overlay.id}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      aria-hidden
                      className="h-0.5 w-3 shrink-0 rounded-full"
                      style={{ background: `var(${overlay.color})` }}
                    />
                    {overlay.label}
                  </span>
                )}
                {referenceLine && (
                  <span
                    key={referenceLine.id}
                    className="inline-flex items-center gap-1.5"
                  >
                    <span
                      aria-hidden
                      className="w-3 shrink-0 border-t border-dashed"
                      style={{ borderColor: `var(${referenceLine.color})` }}
                    />
                    {referenceLine.label}
                  </span>
                )}
              </div>
              {selectedSection && (
                <p className="m-0 text-xs text-muted">
                  {selectedSection.mode === "section"
                    ? t("carsSheet.costChartSectionShare", {
                        percent: formatPercent(selectedSection.share),
                        month: selectedSection.month,
                        total: formatAmountFull(selectedSection.monthTotal),
                      })
                    : t("carsSheet.costChartCategoryShare", {
                        percent: formatPercent(selectedSection.share),
                        total: formatAmountFull(rangeTotal),
                      })}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("carsSheet.costChartEmpty")}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <Checkbox
              checked={includeDepreciation}
              onChange={(next) => {
                setIncludeDepreciation(next);
                setBarSelection(null);
              }}
              label={t("carsSheet.includeDepreciation")}
            />
            {hasInterest && (
              <Checkbox
                checked={includeInterest}
                onChange={(next) => {
                  setIncludeInterest(next);
                  setBarSelection(null);
                }}
                label={t("carsSheet.includeLoanInterest")}
              />
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
