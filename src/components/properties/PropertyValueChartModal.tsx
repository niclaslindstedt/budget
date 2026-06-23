import { useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import { buildPropertyValueSeries } from "../../data/property-value/series";
import type { Property, Settings } from "../../data/types";
import { useIsMobile, useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import {
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { Checkbox } from "../form";
import { Modal } from "../Modal";
import { LineChart, type ChartSeries } from "../charts/LineChart";

// "Visualize value" — the first analysis surface in the app. Charts a
// property's recorded market value over time as a single line that the two
// toggles transform in place: "Include repairs" adds the cumulative repair
// spend onto the value (the money invested shows in the curve), and "Show net
// value" turns the curve into the full net sale profit per snapshot (after
// broker, advertising, repairs, purchase price, and capital-gains tax). In the
// two market-value views a dotted purchase-value baseline is drawn underneath,
// so the gap above the line reads as profit; the net-value view drops it since
// that curve already nets out the purchase price. The heavy lifting lives in
// the reusable `LineChart` primitive and the pure `buildPropertyValueSeries`
// builder; this modal only maps data to a themed, translated series.
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
  const isMobile = useIsMobile();

  const [includeRepairs, setIncludeRepairs] = useState(false);
  const [showNetValue, setShowNetValue] = useState(false);
  const [includeInterest, setIncludeInterest] = useState(false);
  const [includeAssociationInterest, setIncludeAssociationInterest] =
    useState(false);

  // Reset the toggles to off whenever the modal opens for a property.
  useResetOnOpen(open, property?.id, () => {
    setIncludeRepairs(false);
    setShowNetValue(false);
    setIncludeInterest(false);
    setIncludeAssociationInterest(false);
  });

  if (!open || !property) return null;

  // The association-interest leg only makes sense for a property that records
  // a share of the association's debt; without it the toggle would do nothing.
  const hasAssociationLoan = property.associationLoan !== undefined;

  const points = buildPropertyValueSeries(property, settings, {
    includeRepairs,
    showNetValue,
    includeInterest,
    // Gated on the interest toggle (the modal only shows it then) and on the
    // property actually carrying an association loan.
    includeAssociationInterest:
      includeInterest && hasAssociationLoan && includeAssociationInterest,
  });

  const hasChart = points.length >= 2;

  // One line; its colour + label track what the toggles are showing so the
  // tooltip names the right figure (net value vs. market value).
  const seriesColor = showNetValue ? "--meta" : "--accent";
  const seriesLabel = showNetValue
    ? t("properties.valueChartNetValue")
    : t("properties.valueChartMarketValue");
  const series: ChartSeries[] = [
    { id: "value", label: seriesLabel, colorVar: seriesColor, points },
  ];

  // A dotted purchase-value baseline so the gap above the line reads as profit.
  // Only meaningful for the market-value views (default and "Include repairs");
  // the net-value curve already nets out the purchase price, so a second
  // purchase line there would be redundant. Spans the same x-range as the data
  // line, flat at the purchase amount, and joins the y-domain so it stays on
  // screen even when every recorded value sits above it.
  const purchaseAmount = property.purchaseAmount;
  if (!showNetValue && purchaseAmount !== undefined && hasChart) {
    series.push({
      id: "purchase",
      label: t("properties.valueChartPurchaseValue"),
      colorVar: "--muted",
      dashed: true,
      // Flat baseline — its value is constant, so listing it in the hover
      // tooltip alongside the market value adds noise without information.
      omitFromTooltip: true,
      points: points.map((p) => ({ x: p.x, y: purchaseAmount })),
    });
  }

  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  // Desktop renders the full grouped figure (the chart sizes its left
  // gutter to fit, so number formatting never clips the axis); mobile is
  // too narrow for that, so the Y axis always abbreviates to "3.2M kr"
  // regardless of the user's `abbreviateNumbers` preference. Property
  // value ranges are often narrow relative to their magnitude (a 3M cabin
  // worth 2.95M–3.3M across snapshots), so the mobile abbreviation forces
  // one decimal — without it every tick collapses to an identical "3M kr".
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
            <LineChart series={series} formatX={formatX} formatY={formatY} />
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
            <Checkbox
              checked={includeInterest}
              onChange={setIncludeInterest}
              disabled={!hasChart}
              label={t("properties.valueChartIncludeInterest")}
              description={t("properties.valueChartIncludeInterestHint")}
            />
            {includeInterest && hasAssociationLoan && (
              <Checkbox
                checked={includeAssociationInterest}
                onChange={setIncludeAssociationInterest}
                disabled={!hasChart}
                label={t("properties.valueChartIncludeAssociationInterest")}
                description={t(
                  "properties.valueChartIncludeAssociationInterestHint",
                )}
                // Nested under "Include interest" — indent so the dependency
                // reads visually.
                className="ml-5"
              />
            )}
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
