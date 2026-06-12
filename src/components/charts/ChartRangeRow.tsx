import { useT, type MessageKey } from "../../i18n";
import { addMonthsIso } from "../../utils/date";

// Avanza-style rows of window buttons shared by chart surfaces that
// clip their series to a window. Two flavours over one pill row:
//
// - `ChartRangeRow` — trailing windows (1Y / 2Y / 3Y / 5Y / All) for
//   history charts (the loans visualizer, the Insights net-worth
//   chart, the investment value chart). `chartRangeCutoffMs` turns the
//   selection into the cutoff timestamp to filter sample points by.
// - `ChartHorizonRow` — forward windows (1M / 3M / 6M / 1Y / 2Y) for
//   projection charts (the scenarios visualizer). The caller clips its
//   month axis to "now + horizon".
//
// A sliding pill marks the active button (the global reduce-motion
// rule zeroes the transition). The clipping itself stays with the
// caller.

// Trailing window a history chart is clipped to. A number is a count
// of years back from today; "all" keeps every sample.
export type ChartRange = 1 | 2 | 3 | 5 | "all";

// Default to a few years back: realistic data only spans a couple of
// years, so "all" would prepend a long flat lead-in for nothing.
export const DEFAULT_CHART_RANGE: ChartRange = 3;

const RANGES: { value: ChartRange; labelKey: MessageKey }[] = [
  { value: 1, labelKey: "charts.range1y" },
  { value: 2, labelKey: "charts.range2y" },
  { value: 3, labelKey: "charts.range3y" },
  { value: 5, labelKey: "charts.range5y" },
  { value: "all", labelKey: "charts.rangeAll" },
];

// Forward window a projection chart extends to, in months from today.
export type ChartHorizon = 1 | 3 | 6 | 12 | 24;

export const DEFAULT_CHART_HORIZON: ChartHorizon = 6;

const HORIZONS: { value: ChartHorizon; labelKey: MessageKey }[] = [
  { value: 1, labelKey: "charts.range1m" },
  { value: 3, labelKey: "charts.range3m" },
  { value: 6, labelKey: "charts.range6m" },
  { value: 12, labelKey: "charts.range1y" },
  { value: 24, labelKey: "charts.range2y" },
];

// The cutoff timestamp (ms) for the selected range: keep samples with
// `x >= cutoff`. "all" maps to -Infinity so every sample passes.
export function chartRangeCutoffMs(range: ChartRange, today: string): number {
  return range === "all"
    ? -Infinity
    : Date.parse(addMonthsIso(today, -12 * range));
}

type PillRowProps<V extends ChartRange | ChartHorizon> = {
  options: readonly { value: V; labelKey: MessageKey }[];
  value: V;
  onChange: (value: V) => void;
};

function PillRow<V extends ChartRange | ChartHorizon>({
  options,
  value,
  onChange,
}: PillRowProps<V>) {
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("charts.rangeAria")}
      className="relative flex flex-1 rounded border border-line bg-surface-3 text-sm"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 rounded bg-surface transition-transform"
        style={{
          width: `${100 / options.length}%`,
          transform: `translateX(${options.findIndex((o) => o.value === value) * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-2 py-1 transition-colors ${
            value === o.value ? "text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {t(o.labelKey)}
        </button>
      ))}
    </div>
  );
}

type RangeProps = {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
};

export function ChartRangeRow({ value, onChange }: RangeProps) {
  return <PillRow options={RANGES} value={value} onChange={onChange} />;
}

type HorizonProps = {
  value: ChartHorizon;
  onChange: (horizon: ChartHorizon) => void;
};

export function ChartHorizonRow({ value, onChange }: HorizonProps) {
  return <PillRow options={HORIZONS} value={value} onChange={onChange} />;
}
