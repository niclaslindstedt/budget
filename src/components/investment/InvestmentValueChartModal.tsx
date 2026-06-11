import { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import { buildInvestmentTotalSeries } from "../../data/investment/series";
import type {
  InvestmentHolding,
  Settings,
  StockPosition,
} from "../../data/types";
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
import { LineChart, type ChartSeries } from "../charts/LineChart";
import {
  ChartRangeRow,
  DEFAULT_CHART_RANGE,
  chartRangeCutoffMs,
  type ChartRange,
} from "../charts/ChartRangeRow";

// "Visualize value" for the Investment sheet — charts the combined value
// of every holding and every private stock position over time as one
// line. The "Show net value" toggle swaps the gross market value for the
// after-sale-tax value (ISK / KF untaxed, depå 30 %, company 20.6 %). The
// trailing-window range buttons sit BELOW the graph (Avanza style). The
// heavy lifting lives in the reusable `LineChart` primitive and the pure
// `buildInvestmentTotalSeries` builder; this modal only maps data to a
// themed, translated series and clips it to the selected window.
//
// `centered`: the only controls are a toggle and the range buttons, so
// nothing opens the soft keyboard.

type Props = {
  open: boolean;
  holdings: readonly InvestmentHolding[];
  stocks: readonly StockPosition[];
  settings: Settings;
  onClose: () => void;
};

export function InvestmentValueChartModal({
  open,
  holdings,
  stocks,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [showNetValue, setShowNetValue] = useState(false);
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);

  useResetOnOpen(open, null, () => {
    setShowNetValue(false);
    setRange(DEFAULT_CHART_RANGE);
  });

  if (!open) return null;

  const today = todayIso();
  const allPoints = buildInvestmentTotalSeries(
    holdings,
    stocks,
    settings,
    today,
    {
      showNetValue,
    },
  );
  const cutoffMs = chartRangeCutoffMs(range, today);
  const points = allPoints.filter((p) => p.x >= cutoffMs);

  const hasChart = points.length >= 2;

  const seriesColor = showNetValue ? "--meta" : "--accent";
  const seriesLabel = showNetValue
    ? t("investment.valueChartNetValue")
    : t("investment.valueChartValue");
  const series: ChartSeries[] = [
    { id: "value", label: seriesLabel, colorVar: seriesColor, points },
  ];

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

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="investment-value-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<LineChartIcon size={14} aria-hidden focusable={false} />}
        title={t("investment.valueChartTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {hasChart ? (
            <LineChart series={series} formatX={formatX} formatY={formatY} />
          ) : (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("investment.valueChartEmpty")}
            </div>
          )}

          <ChartRangeRow value={range} onChange={setRange} />

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <Checkbox
              checked={showNetValue}
              onChange={setShowNetValue}
              disabled={!hasChart}
              label={t("investment.valueChartShowNetValue")}
              description={t("investment.valueChartShowNetValueHint")}
            />
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
