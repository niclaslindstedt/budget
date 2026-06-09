import { useMemo, useState } from "react";
import { LineChart as LineChartIcon } from "lucide-react";

import { buildSavingsTotalSeries } from "../../data/savings/series";
import type { Saving, Settings } from "../../data/types";
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

// "Visualize value" for the Savings sheet — charts the combined balance set
// aside across the chosen accounts over time as a single line. The user picks
// which savings accounts to include (all by default); the line is the running
// total of their most recent dated balances, so it climbs as accounts come
// online and as each is topped up. The heavy lifting lives in the reusable
// `LineChart` primitive and the pure `buildSavingsTotalSeries` builder; this
// modal only maps data to a themed, translated series and owns the account
// chooser. Mirrors `PropertyValueChartModal`.
//
// `centered`: the only controls are toggle checkboxes, so nothing opens the
// soft keyboard.

type Props = {
  open: boolean;
  savings: Saving[];
  settings: Settings;
  onClose: () => void;
};

export function SavingsValueChartModal({
  open,
  savings,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const allIds = useMemo(() => savings.map((s) => s.id), [savings]);

  // Default to every account selected; re-seed whenever the modal reopens or
  // the set of accounts changes underneath it.
  const [selectedIds, setSelectedIds] = useState<string[]>(allIds);
  useResetOnOpen(open, allIds.join(","), () => setSelectedIds(allIds));

  if (!open) return null;

  const selectedSet = new Set(selectedIds);
  const allSelected =
    savings.length > 0 && selectedIds.length === savings.length;

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : allIds);
  }

  const points = buildSavingsTotalSeries(savings, selectedIds);
  const hasChart = points.length >= 2;

  const series: ChartSeries[] = [
    {
      id: "total",
      label: t("savingsSheet.valueChartTotal"),
      colorVar: "--accent",
      points,
    },
  ];

  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  // Desktop renders the full grouped figure (the chart sizes its left gutter to
  // fit, so number formatting never clips the axis); mobile is too narrow for
  // that, so the Y axis always abbreviates to "3.2M kr" regardless of the
  // user's `abbreviateNumbers` preference. Savings totals can sit in a narrow
  // band relative to their magnitude, so the mobile abbreviation forces one
  // decimal — without it nearby ticks collapse to an identical "100K kr".
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
      labelledBy="savings-value-chart-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<LineChartIcon size={14} aria-hidden focusable={false} />}
        title={t("savingsSheet.visualizeValue")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {selectedIds.length === 0 ? (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("savingsSheet.valueChartNoSelection")}
            </div>
          ) : hasChart ? (
            <LineChart series={series} formatX={formatX} formatY={formatY} />
          ) : (
            <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
              {t("savingsSheet.valueChartEmpty")}
            </div>
          )}

          {savings.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider uppercase text-muted">
                  {t("savingsSheet.valueChartAccounts")}
                </span>
                <Checkbox
                  checked={allSelected}
                  onChange={toggleAll}
                  label={t("savingsSheet.valueChartSelectAll")}
                />
              </div>
              <div className="flex flex-col gap-2">
                {savings.map((saving) => (
                  <Checkbox
                    key={saving.id}
                    checked={selectedSet.has(saving.id)}
                    onChange={() => toggle(saving.id)}
                    label={saving.name}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}
