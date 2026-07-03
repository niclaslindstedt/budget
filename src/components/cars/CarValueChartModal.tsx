import { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import {
  buildCarMileageSeries,
  buildCarValueSeries,
} from "../../data/cars/series";
import { loanInterestAccruedBetween } from "../../data/loans/balance";
import type { Car, Loan, Settings } from "../../data/types";
import { useIsMobile, useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import {
  distanceUnitLabel,
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { Checkbox } from "../form";
import { Modal } from "../Modal";
import { LineChart, type ChartSeries } from "../charts/LineChart";

// "Visualize value" for a car. Two chart modes behind a pill toggle —
// the market value over time (monthly-sampled so a depreciation curve
// reads as the decay it is, not straight lines between snapshots) and
// the odometer readings — because the two figures live on different
// unit scales and would distort each other's y-domain on one axis. The
// value mode's toggles subtract the running costs (and the linked
// loan's accrued interest) so the curve shows what the car has really
// consumed. Mirrors `PropertyValueChartModal`.
//
// `centered`: the only controls are toggles, so nothing opens the soft
// keyboard.

type Props = {
  open: boolean;
  car: Car | null;
  // The loan financing the car (null when none) — feeds the interest
  // subtraction toggle.
  loan: Loan | null;
  settings: Settings;
  onClose: () => void;
};

type ChartMode = "value" | "mileage";

export function CarValueChartModal({
  open,
  car,
  loan,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [mode, setMode] = useState<ChartMode>("value");
  const [subtractCosts, setSubtractCosts] = useState(false);
  const [subtractInterest, setSubtractInterest] = useState(false);

  useResetOnOpen(open, car?.id, () => {
    setMode("value");
    setSubtractCosts(false);
    setSubtractInterest(false);
  });

  if (!open || !car) return null;

  const today = todayIso();
  // The interest toggle only makes sense when the linked loan can
  // actually accrue (a rate + a balance anchor); otherwise it would do
  // nothing.
  const hasInterest =
    loan !== null &&
    loanInterestAccruedBetween(loan, "0001-01-01", today) !== null;

  const valuePoints = buildCarValueSeries(
    car,
    loan ?? undefined,
    {
      includeCosts: subtractCosts,
      includeLoanInterest: subtractCosts && hasInterest && subtractInterest,
    },
    today,
  );
  const mileagePoints = buildCarMileageSeries(car, today);

  const points = mode === "value" ? valuePoints : mileagePoints;
  const hasChart = points.length >= 2;

  const series: ChartSeries[] = [
    {
      id: mode,
      label:
        mode === "value"
          ? t("carsSheet.chartValueLabel")
          : t("carsSheet.chartMileageLabel"),
      colorVar: mode === "value" ? "--accent" : "--link",
      points,
    },
  ];

  // A dotted purchase-price baseline so the gap under the line reads as
  // retained value. Value mode only — the odometer has no baseline.
  const purchasePrice = car.purchasePrice;
  if (mode === "value" && purchasePrice !== undefined && hasChart) {
    series.push({
      id: "purchase",
      label: t("carsSheet.chartPurchaseLabel"),
      colorVar: "--muted",
      dashed: true,
      // Flat baseline — constant, so listing it in the hover tooltip
      // adds noise without information.
      omitFromTooltip: true,
      points: points.map((p) => ({ x: p.x, y: purchasePrice })),
    });
  }

  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  // Mobile always abbreviates the y-axis (mirrors the property chart);
  // the mileage axis is a plain count, never a currency figure.
  const formatY = (y: number) => {
    const figure = formatNumber(
      y,
      isMobile ? { ...settings, showDecimals: true } : settings,
      isMobile ? { forceAbbreviate: true } : {},
    );
    return mode === "value"
      ? withCurrency(figure, settings)
      : `${figure} ${distanceUnitLabel(settings)}`;
  };

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="car-value-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<LineChartIcon size={14} aria-hidden focusable={false} />}
        title={t("carsSheet.valueChartTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm font-bold text-fg-bright">{car.name}</p>

          <div
            role="group"
            aria-label={t("carsSheet.chartModeAria")}
            className="relative flex rounded border border-line bg-surface-3 text-sm"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded bg-surface transition-transform"
              style={{
                transform: `translateX(${mode === "value" ? 0 : 100}%)`,
              }}
            />
            {(["value", "mileage"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-2 py-1 transition-colors ${
                  mode === m ? "text-accent" : "text-muted hover:text-fg"
                }`}
              >
                {m === "value"
                  ? t("carsSheet.chartValueLabel")
                  : t("carsSheet.chartMileageLabel")}
              </button>
            ))}
          </div>

          {hasChart ? (
            <LineChart series={series} formatX={formatX} formatY={formatY} />
          ) : (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {mode === "value"
                ? t("carsSheet.valueChartEmpty")
                : t("carsSheet.mileageChartEmpty")}
            </div>
          )}

          {mode === "value" && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <Checkbox
                checked={subtractCosts}
                onChange={setSubtractCosts}
                disabled={!hasChart}
                label={t("carsSheet.subtractCosts")}
                description={t("carsSheet.subtractCostsHint")}
              />
              {subtractCosts && hasInterest && (
                <Checkbox
                  checked={subtractInterest}
                  onChange={setSubtractInterest}
                  disabled={!hasChart}
                  label={t("carsSheet.subtractLoanInterest")}
                  description={t("carsSheet.subtractLoanInterestHint")}
                  // Nested under "Subtract running costs" — indent so
                  // the dependency reads visually.
                  className="ml-5"
                />
              )}
            </div>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}
