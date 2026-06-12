import { useMemo, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import { currentFiscalMonthKey, nextMonthKey } from "../../data/fiscal-month";
import {
  buildScenarioChartPoints,
  epochMsToMonthKey,
} from "../../data/scenarios/series";
import type { Settings } from "../../data/types";
import { useIsMobile } from "../../hooks";
import { useLang, useT } from "../../i18n";
import {
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import {
  ChartHorizonRow,
  DEFAULT_CHART_HORIZON,
  type ChartHorizon,
} from "../charts/ChartRangeRow";
import { LineChart, type ChartSeries } from "../charts/LineChart";
import { Modal } from "../Modal";

// "Visualize scenarios" for the Scenarios sheet — every variant's
// projected monthly end balance (the dashed Baseline plus one line per
// scenario) on one chart, opened from the sheet title's "…" menu. The
// view is strictly forward-looking: the shared `ChartHorizonRow` picks
// how far into the future the month axis runs (1M / 3M / 6M / 1Y / 2Y
// from the current fiscal month), and months past the last dated row
// carry the final balance forward. Legend chips toggle series, same as
// the savings / loans visualizers.
//
// `centered`: the only controls are toggle buttons, so nothing opens
// the soft keyboard.

export type ScenarioChartVariant = {
  key: string;
  label: string;
  colorVar: string;
  // The Baseline renders dashed so it reads as "unaltered".
  dashed?: boolean;
};

type Props = {
  open: boolean;
  variants: ScenarioChartVariant[];
  // Monthly end balances per variant key, straight from
  // `monthlyEndBalances` — the modal clips them to its horizon itself.
  endBalancesByVariant: ReadonlyMap<string, Map<string, number>>;
  openingBalance: number;
  settings: Settings;
  onClose: () => void;
};

export function ScenariosChartModal({
  open,
  variants,
  endBalancesByVariant,
  openingBalance,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [horizon, setHorizon] = useState<ChartHorizon>(DEFAULT_CHART_HORIZON);
  const [hiddenSeries, setHiddenSeries] = useState<ReadonlySet<string>>(
    new Set(),
  );

  const pointsByVariant = useMemo(() => {
    const from = currentFiscalMonthKey(settings.startOfMonth);
    let to = from;
    for (let i = 0; i < horizon; i++) to = nextMonthKey(to);
    return buildScenarioChartPoints(endBalancesByVariant, openingBalance, {
      from,
      to,
    });
  }, [endBalancesByVariant, openingBalance, settings.startOfMonth, horizon]);

  if (!open) return null;

  const series: ChartSeries[] = variants
    .filter((v) => !hiddenSeries.has(v.key))
    .map((v) => ({
      id: v.key,
      label: v.label,
      colorVar: v.colorVar,
      dashed: v.dashed,
      points: pointsByVariant.get(v.key) ?? [],
    }));
  const hasChart = series.some((s) => s.points.length >= 2);

  const formatX = (x: number) =>
    formatMonthYearShort(epochMsToMonthKey(x), lang);
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
      labelledBy="scenarios-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<LineChartIcon size={14} aria-hidden focusable={false} />}
        title={t("scenarios.visualizeAction")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <ChartHorizonRow value={horizon} onChange={setHorizon} />
          <div
            role="group"
            aria-label={t("scenarios.legendLabel")}
            className="flex flex-wrap items-center gap-1.5"
          >
            {variants.map((variant) => {
              const hidden = hiddenSeries.has(variant.key);
              return (
                <button
                  key={variant.key}
                  type="button"
                  aria-pressed={!hidden}
                  aria-label={t("scenarios.legendToggleAria", {
                    name: variant.label,
                  })}
                  onClick={() =>
                    setHiddenSeries((prev) => {
                      const next = new Set(prev);
                      if (next.has(variant.key)) next.delete(variant.key);
                      else next.add(variant.key);
                      return next;
                    })
                  }
                  className={`flex cursor-pointer items-center gap-1.5 rounded border border-line px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                    hidden
                      ? "bg-transparent text-muted opacity-60"
                      : "bg-surface text-fg"
                  }`}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: `var(${variant.colorVar})` }}
                  />
                  <span className={hidden ? "line-through" : undefined}>
                    {variant.label}
                  </span>
                </button>
              );
            })}
          </div>
          {hasChart ? (
            <LineChart series={series} formatX={formatX} formatY={formatY} />
          ) : (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("scenarios.chartEmpty")}
            </div>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}
