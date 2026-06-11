import { useT } from "../../i18n";
import { addMonthsIso } from "../../utils/date";

// Avanza-style row of trailing-window range buttons (1Y / 2Y / 3Y / 5Y /
// All) shared by chart surfaces that clip their series to a window — the
// loans visualizer and the Insights net-worth chart. A sliding pill marks
// the active button (the global reduce-motion rule zeroes the transition).
// The clipping itself stays with the caller: `chartRangeCutoffMs` turns
// the selected range into the cutoff timestamp to filter sample points by.

// Trailing window a chart is clipped to. A number is a count of years
// back from today; "all" keeps every sample.
export type ChartRange = 1 | 2 | 3 | 5 | "all";

// Default to a few years back: realistic data only spans a couple of
// years, so "all" would prepend a long flat lead-in for nothing.
export const DEFAULT_CHART_RANGE: ChartRange = 3;

const RANGES: {
  value: ChartRange;
  labelKey: "range1y" | "range2y" | "range3y" | "range5y" | "rangeAll";
}[] = [
  { value: 1, labelKey: "range1y" },
  { value: 2, labelKey: "range2y" },
  { value: 3, labelKey: "range3y" },
  { value: 5, labelKey: "range5y" },
  { value: "all", labelKey: "rangeAll" },
];

// The cutoff timestamp (ms) for the selected range: keep samples with
// `x >= cutoff`. "all" maps to -Infinity so every sample passes.
export function chartRangeCutoffMs(range: ChartRange, today: string): number {
  return range === "all"
    ? -Infinity
    : Date.parse(addMonthsIso(today, -12 * range));
}

type Props = {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
};

export function ChartRangeRow({ value, onChange }: Props) {
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
          width: `${100 / RANGES.length}%`,
          transform: `translateX(${RANGES.findIndex((r) => r.value === value) * 100}%)`,
        }}
      />
      {RANGES.map((r) => (
        <button
          key={String(r.value)}
          type="button"
          onClick={() => onChange(r.value)}
          aria-pressed={value === r.value}
          className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-2 py-1 transition-colors ${
            value === r.value ? "text-accent" : "text-muted hover:text-fg"
          }`}
        >
          {t(`charts.${r.labelKey}`)}
        </button>
      ))}
    </div>
  );
}
