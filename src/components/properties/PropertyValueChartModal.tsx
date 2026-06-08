import { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import { buildPropertyValueSeries } from "../../data/property-value/series";
import type { Property, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatDate, formatNumber, withCurrency } from "../../utils/format";
import { Checkbox } from "../form";
import { Modal } from "../Modal";
import { LineChart, type ChartSeries } from "../charts/LineChart";

// "Visualize value" — the first analysis surface in the app. Charts a
// property's recorded market value over time, with two toggles that overlay
// derived lines: "Include repairs" adds the cumulative repair spend onto the
// value (value including the money invested), and "Show net value" overlays
// the full net sale profit per snapshot (after broker, advertising, repairs,
// purchase price, and capital-gains tax). The heavy lifting lives in the
// reusable `LineChart` primitive and the pure `buildPropertyValueSeries`
// builder; this modal only maps data to themed, translated series.
//
// `centered`: the only controls are toggle checkboxes, so nothing opens the
// soft keyboard.

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  onClose: () => void;
};

export function PropertyValueChartModal({
  open,
  property,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();

  const [includeRepairs, setIncludeRepairs] = useState(false);
  const [showNetValue, setShowNetValue] = useState(false);

  // Reset the toggles to off whenever the modal opens for a property.
  useResetOnOpen(open, property?.id, () => {
    setIncludeRepairs(false);
    setShowNetValue(false);
  });

  if (!open || !property) return null;

  const data = buildPropertyValueSeries(property, settings, {
    includeRepairs,
    showNetValue,
  });

  const hasChart = data.marketValue.length >= 2;

  const series: ChartSeries[] = [
    {
      id: "marketValue",
      label: t("properties.valueChartMarketValue"),
      colorVar: "--accent",
      points: data.marketValue,
    },
  ];
  if (data.withRepairs) {
    series.push({
      id: "withRepairs",
      label: t("properties.valueChartWithRepairs"),
      colorVar: "--flag",
      points: data.withRepairs,
    });
  }
  if (data.netProfit) {
    series.push({
      id: "netProfit",
      label: t("properties.valueChartNetValue"),
      colorVar: "--meta",
      points: data.netProfit,
    });
  }

  const formatX = (x: number) =>
    formatDate(
      new Date(x).toISOString().slice(0, 10),
      settings.dateFormat,
      lang,
    );
  const formatY = (y: number) =>
    withCurrency(
      formatNumber(y, settings, { alwaysAbbreviate: true }),
      settings,
    );

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="property-value-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<LineChartIcon size={14} aria-hidden focusable={false} />}
        title={t("properties.valueChartTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm font-bold text-fg-bright">
            {property.name}
          </p>

          {hasChart ? (
            <>
              <LineChart series={series} formatX={formatX} formatY={formatY} />

              {/* Legend — swatches read the theme tokens directly. */}
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
                {series.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-1.5 text-xs text-muted"
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: `var(${s.colorVar})` }}
                    />
                    {s.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("properties.valueChartEmpty")}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <Checkbox
              checked={includeRepairs}
              onChange={setIncludeRepairs}
              disabled={!hasChart}
              label={t("properties.valueChartIncludeRepairs")}
              description={t("properties.valueChartIncludeRepairsHint")}
            />
            <Checkbox
              checked={showNetValue}
              onChange={setShowNetValue}
              disabled={!hasChart}
              label={t("properties.valueChartShowNetValue")}
              description={t("properties.valueChartShowNetValueHint")}
            />
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
