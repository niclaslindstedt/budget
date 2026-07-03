import { useCallback, useMemo } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { Line, LinePath } from "@visx/shape";
import { useTooltip, TooltipWithBounds } from "@visx/tooltip";

import { useThemeTokens } from "../../hooks";

// A theme-aware stacked bar chart — the discrete sibling of
// `StackedAreaChart`, for per-period quantities where a zero is a real gap
// (a month without a loan payment) rather than a value a smooth curve
// should glide across. One bar per shared x sample, segments stacked
// bottom-up in series order. Like the other chart primitives it owns no
// domain knowledge and ships no user-facing copy: the caller passes the
// series, tick formatters, and the tooltip's total-row label. Every chrome
// colour, the font, and the tooltip surface read through `useThemeTokens`;
// no animation is introduced, so reduce-motion is respected by
// construction.
//
// Every series MUST share one ascending x array (a series with nothing in
// some period contributes y = 0 there) — segments are stacked per sample
// index.

export type StackedChartPoint = { x: number; y: number };

// A pressed segment: which series (by id) at which x sample. Lifted to the
// caller so it can highlight the matching legend entry and show the
// segment's real value. `x` is omitted for a whole-series selection (every
// segment of the series highlights) — the shape a legend click produces,
// where there is no single month to pin to.
export type StackedBarSelection = { seriesId: string; x?: number };

// A single line drawn over the bars, sharing both scales — e.g. a rolling
// average of the per-bar totals. Plotted at each bar's centre; joins the
// tooltip as an extra row below the total. Reads as a computed metric over
// the categorical stacks, not another band.
export type StackedBarOverlay = {
  // Stable key for React + tooltip lookups.
  id: string;
  // Legend / tooltip label (already translated by the caller).
  label: string;
  // Token ("--fg-bright") or literal CSS colour — same "--" convention as a
  // series colour.
  color: string;
  // Points at the bars' x samples (a missing x contributes no vertex there).
  points: StackedChartPoint[];
};

// A constant horizontal line spanning the whole plot — e.g. the mean of
// the per-bar totals. Unlike `overlay` it carries one y value, not
// per-sample points, so it reads as a flat baseline the bars are measured
// against. Drawn dashed to set it apart from the (solid) overlay line.
export type StackedBarReferenceLine = {
  // Stable key for React + legend lookups.
  id: string;
  // Legend label (already translated by the caller).
  label: string;
  // Token ("--muted") or literal CSS colour — same "--" convention as a
  // series colour.
  color: string;
  // The constant value the line sits at, in the series' y units.
  y: number;
};

export type StackedBarChartSeries = {
  // Stable key for React + tooltip lookups.
  id: string;
  // Legend / tooltip label (already translated by the caller).
  label: string;
  // Either a CSS custom property the segment's colour reads from
  // ("--accent") or a literal CSS colour ("#e06c75" — user-picked sheet
  // colours are stored as hexes). Disambiguated by the "--" prefix.
  color: string;
  // Ascending-x points, identical x values across every series.
  points: StackedChartPoint[];
};

type Props = {
  // Segments, stacked bottom-up in array order.
  series: StackedBarChartSeries[];
  // Formats an x value for the bottom axis ticks and the tooltip heading.
  formatX: (x: number) => string;
  // Formats a y value for the left axis ticks and the tooltip rows.
  formatY: (y: number) => string;
  // Label for the tooltip's bold total row (already translated).
  totalLabel: string;
  // Chart height in px (width fills the container).
  height?: number;
  // Controlled press-to-select: the currently pressed segment (or null).
  // When provided together with `onSelect`, pressing a segment highlights
  // it; pressing the same segment again or an empty part of the plot
  // clears the selection.
  selected?: StackedBarSelection | null;
  onSelect?: (selection: StackedBarSelection | null) => void;
  // An optional line overlaid on the bars (sharing both scales). Its x
  // values must line up with the bars' x samples.
  overlay?: StackedBarOverlay | null;
  // An optional constant horizontal line (dashed) drawn across the whole
  // plot — a flat reference such as the average of the bar totals.
  referenceLine?: StackedBarReferenceLine | null;
};

// `left` is a floor: the chart widens the gutter to fit the actual Y-axis
// tick labels (see `leftMargin` below) so a fully-grouped figure like
// "1 234 567 kr" is never clipped at the SVG edge.
const MARGIN = { top: 12, right: 18, bottom: 28, left: 44 };

// Approximate width of one axis-label glyph at `fontSize: 11`. Erring wide
// keeps labels from clipping at the SVG's left edge — the monospaced default
// face advances ~7.3px/char at this size, and a proportional Custom-theme
// font averages narrower, so this slightly-generous figure covers both.
const AXIS_CHAR_W = 7.5;
// Padding between the widest tick label and the plot area (tick mark + `dx`).
const AXIS_GUTTER_PAD = 12;

// Structural tokens the chart chrome reads, kept module-level so the hook key
// stays stable across renders. The series' token colours append per render.
const CHROME_TOKENS = [
  "--line",
  "--muted",
  "--fg",
  "--fg-bright",
  "--surface",
  "--surface-2",
  "--app-font-family",
  "--radius-md",
  "--border-width",
] as const;

// One segment's stacked geometry at one sample: cumulative bottom / top plus
// the segment's own value.
type StackedPoint = { x: number; y0: number; y1: number; own: number };

type Tooltip = {
  x: number;
  // Top segment first (matching the visual stacking), each row carrying the
  // segment's own un-stacked value.
  rows: { id: string; label: string; y: number }[];
  total: number;
  topY: number;
  // The overlay's value at this sample, when an overlay is present and has a
  // vertex here.
  overlay?: { label: string; y: number };
};

export function StackedBarChart({
  series,
  formatX,
  formatY,
  totalLabel,
  height = 280,
  selected = null,
  onSelect,
  overlay = null,
  referenceLine = null,
}: Props) {
  const colorVars = useMemo(() => {
    const set = new Set(
      series.map((s) => s.color).filter((c) => c.startsWith("--")),
    );
    if (overlay && overlay.color.startsWith("--")) set.add(overlay.color);
    if (referenceLine && referenceLine.color.startsWith("--"))
      set.add(referenceLine.color);
    return Array.from(set);
  }, [series, overlay, referenceLine]);
  const tokens = useThemeTokens([...CHROME_TOKENS, ...colorVars]);
  const fontFamily = tokens["--app-font-family"] || "monospace";
  const lineColor = tokens["--line"] || "#3a3f4b";
  const mutedColor = tokens["--muted"] || "#7f848e";
  const fgColor = tokens["--fg-bright"] || tokens["--fg"] || "#dcdfe4";
  const colorFor = useCallback(
    (color: string) =>
      color.startsWith("--") ? tokens[color] || mutedColor : color,
    [tokens, mutedColor],
  );

  return (
    <div className="relative w-full" style={{ height }}>
      <ParentSize>
        {({ width }) =>
          width < 1 ? null : (
            <Chart
              width={width}
              height={height}
              series={series}
              formatX={formatX}
              formatY={formatY}
              totalLabel={totalLabel}
              selected={selected}
              onSelect={onSelect}
              overlay={overlay}
              referenceLine={referenceLine}
              fontFamily={fontFamily}
              lineColor={lineColor}
              mutedColor={mutedColor}
              fgColor={fgColor}
              colorFor={colorFor}
              surface={
                tokens["--surface-2"] || tokens["--surface"] || "#21252b"
              }
              radius={tokens["--radius-md"] || "6px"}
              borderWidth={tokens["--border-width"] || "1px"}
            />
          )
        }
      </ParentSize>
    </div>
  );
}

type ChartProps = Props & {
  width: number;
  height: number;
  fontFamily: string;
  lineColor: string;
  mutedColor: string;
  fgColor: string;
  colorFor: (color: string) => string;
  surface: string;
  radius: string;
  borderWidth: string;
};

function Chart({
  width,
  height,
  series,
  formatX,
  formatY,
  totalLabel,
  selected,
  onSelect,
  overlay,
  referenceLine,
  fontFamily,
  lineColor,
  mutedColor,
  fgColor,
  colorFor,
  surface,
  radius,
  borderWidth,
}: ChartProps) {
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  // Cumulative offsets per shared sample index, plus the x domain (the
  // discrete sample values, in order) and the tallest stack for the y scale.
  const { stacked, sortedXs, yDomain } = useMemo(() => {
    const stacked: StackedPoint[][] = [];
    const sampleCount = series.reduce(
      (max, s) => Math.max(max, s.points.length),
      0,
    );
    const offsets = new Array<number>(sampleCount).fill(0);
    let maxTotal = 0;
    const xs = new Set<number>();
    for (const s of series) {
      const band: StackedPoint[] = s.points.map((p, i) => {
        const y0 = offsets[i];
        const y1 = y0 + Math.max(0, p.y);
        offsets[i] = y1;
        if (y1 > maxTotal) maxTotal = y1;
        xs.add(p.x);
        return { x: p.x, y0, y1, own: p.y };
      });
      stacked.push(band);
    }
    // Let the overlay lift the ceiling — a rolling average can peak above the
    // tallest single bar, and it would otherwise clip at the top edge.
    if (overlay) {
      for (const p of overlay.points) {
        if (p.y > maxTotal) maxTotal = p.y;
      }
    }
    // The flat reference line lifts the ceiling too, so a high average
    // never sits above the plot.
    if (referenceLine && referenceLine.y > maxTotal) maxTotal = referenceLine.y;
    // Bars are anchored at 0; pad only the top so the tallest bar doesn't
    // graze the edge (and keep an all-zero chart from collapsing the scale).
    return {
      stacked,
      sortedXs: Array.from(xs).sort((a, b) => a - b),
      yDomain: [0, maxTotal * 1.08 || 1] as [number, number],
    };
  }, [series, overlay, referenceLine]);

  const yScale = useMemo(
    () => scaleLinear<number>({ domain: yDomain, range: [innerH, 0] }),
    [yDomain, innerH],
  );

  // Keep the horizontal gridlines sparse — a dense axis on an abbreviated
  // mobile format rounds adjacent ticks to duplicate labels.
  const numTicksY = Math.max(2, Math.min(5, Math.floor(innerH / 48)));

  // Size the left gutter to the widest Y-axis tick label so a fully
  // grouped figure ("1 234 567 kr") never clips at the SVG edge. The
  // Y scale doesn't depend on the left margin, so the ticks are stable
  // even though `innerW` (and the X scale) are derived from the result.
  const leftMargin = useMemo(() => {
    const widest = yScale
      .ticks(numTicksY)
      .reduce((max, v) => Math.max(max, formatY(Number(v)).length), 0);
    return Math.max(
      MARGIN.left,
      Math.ceil(widest * AXIS_CHAR_W) + AXIS_GUTTER_PAD,
    );
  }, [yScale, numTicksY, formatY]);

  const innerW = Math.max(0, width - leftMargin - MARGIN.right);
  const xScale = useMemo(
    () =>
      scaleBand<number>({
        domain: sortedXs,
        range: [0, innerW],
        paddingInner: 0.25,
        paddingOuter: 0.1,
      }),
    [sortedXs, innerW],
  );
  const barWidth = xScale.bandwidth();

  // A band scale ticks every domain value; thin the labels to roughly the
  // same density the linear-scale charts settle on, or month labels overlap
  // each other once the range spans a year or two.
  const tickValues = useMemo(() => {
    const maxTicks = Math.max(2, Math.min(8, Math.floor(innerW / 90)));
    const step = Math.max(1, Math.ceil(sortedXs.length / maxTicks));
    return sortedXs.filter((_, i) => i % step === 0);
  }, [sortedXs, innerW]);

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<Tooltip>();

  const handleMove = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      if (sortedXs.length === 0) return;
      const point = localPoint(event);
      if (!point) return;
      const px = point.x - leftMargin;
      // Snap to the bar whose centre is nearest the pointer.
      let nearest = sortedXs[0];
      let best = Infinity;
      for (const candidate of sortedXs) {
        const centre = (xScale(candidate) ?? 0) + barWidth / 2;
        const distance = Math.abs(centre - px);
        if (distance < best) {
          best = distance;
          nearest = candidate;
        }
      }
      const rows: Tooltip["rows"] = [];
      let total = 0;
      let topY = 0;
      // Top segment first so the tooltip reads in the same order as the bar.
      for (let k = series.length - 1; k >= 0; k--) {
        const match = stacked[k].find((p) => p.x === nearest);
        if (!match) continue;
        rows.push({ id: series[k].id, label: series[k].label, y: match.own });
        total += match.own;
        if (match.y1 > topY) topY = match.y1;
      }
      if (rows.length === 0) return;
      const overlayMatch = overlay?.points.find((p) => p.x === nearest);
      showTooltip({
        tooltipData: {
          x: nearest,
          rows,
          total,
          topY,
          overlay: overlayMatch
            ? { label: overlay!.label, y: overlayMatch.y }
            : undefined,
        },
        tooltipLeft: leftMargin + (xScale(nearest) ?? 0) + barWidth / 2,
        tooltipTop: MARGIN.top + yScale(topY),
      });
    },
    [
      sortedXs,
      series,
      stacked,
      overlay,
      xScale,
      yScale,
      leftMargin,
      barWidth,
      showTooltip,
    ],
  );

  // Press-to-select: resolve the pressed pixel to a specific segment (the
  // series whose stacked span contains the click, in the nearest bar's
  // band) and toggle it. Pressing an empty part of the plot — the gap
  // between bars or above the tallest stack — clears the selection, which
  // is the "press outside the section" gesture the caller relies on.
  const handleClick = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      if (!onSelect || sortedXs.length === 0) return;
      const point = localPoint(event);
      if (!point) return;
      const px = point.x - leftMargin;
      const py = point.y - MARGIN.top;
      let nearest = sortedXs[0];
      let best = Infinity;
      for (const candidate of sortedXs) {
        const centre = (xScale(candidate) ?? 0) + barWidth / 2;
        const distance = Math.abs(centre - px);
        if (distance < best) {
          best = distance;
          nearest = candidate;
        }
      }
      const bandX = xScale(nearest) ?? 0;
      // Outside the bar's own band horizontally — treat as pressing away.
      if (px < bandX || px > bandX + barWidth) {
        onSelect(null);
        return;
      }
      for (let k = 0; k < series.length; k++) {
        const match = stacked[k].find((p) => p.x === nearest);
        if (!match || match.y1 <= match.y0) continue;
        const top = yScale(match.y1);
        const bottom = yScale(match.y0);
        if (py >= top && py <= bottom) {
          const seriesId = series[k].id;
          const same =
            selected?.seriesId === seriesId && selected?.x === nearest;
          onSelect(same ? null : { seriesId, x: nearest });
          return;
        }
      }
      // Pressed inside the band but above/below every segment.
      onSelect(null);
    },
    [
      onSelect,
      sortedXs,
      series,
      stacked,
      xScale,
      yScale,
      leftMargin,
      barWidth,
      selected,
    ],
  );

  const axisLabelProps = {
    fill: mutedColor,
    fontFamily,
    fontSize: 11,
  };

  return (
    <>
      <svg width={width} height={height}>
        <Group left={leftMargin} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerW}
            numTicks={numTicksY}
            stroke={lineColor}
            strokeOpacity={0.4}
          />
          <AxisLeft
            scale={yScale}
            numTicks={numTicksY}
            stroke={lineColor}
            tickStroke={lineColor}
            tickFormat={(v) => formatY(Number(v))}
            tickLabelProps={() => ({
              ...axisLabelProps,
              textAnchor: "end",
              dx: -4,
              dy: 3,
            })}
          />
          <AxisBottom
            scale={xScale}
            top={innerH}
            tickValues={tickValues}
            stroke={lineColor}
            tickStroke={lineColor}
            tickFormat={(v) => formatX(Number(v))}
            tickLabelProps={() => ({
              ...axisLabelProps,
              textAnchor: "middle",
              dy: 2,
            })}
          />

          {series.map((s, k) =>
            stacked[k].map((p) => {
              const barH = yScale(p.y0) - yScale(p.y1);
              if (barH <= 0) return null;
              const isSelected =
                selected?.seriesId === s.id &&
                (selected.x === undefined || selected.x === p.x);
              const isHovered =
                tooltipOpen && tooltipData && tooltipData.x === p.x;
              return (
                <rect
                  key={`${s.id}-${p.x}`}
                  x={xScale(p.x)}
                  y={yScale(p.y1)}
                  width={barWidth}
                  height={barH}
                  fill={colorFor(s.color)}
                  fillOpacity={isSelected ? 1 : isHovered ? 0.95 : 0.75}
                  stroke={isSelected ? fgColor : undefined}
                  strokeWidth={isSelected ? 1.5 : undefined}
                  pointerEvents="none"
                />
              );
            }),
          )}

          {referenceLine && (
            <Line
              from={{ x: 0, y: yScale(referenceLine.y) }}
              to={{ x: innerW, y: yScale(referenceLine.y) }}
              stroke={colorFor(referenceLine.color)}
              strokeWidth={1.5}
              strokeDasharray="5,4"
              pointerEvents="none"
            />
          )}

          {overlay && overlay.points.length > 0 && (
            <LinePath<StackedChartPoint>
              data={overlay.points}
              x={(p) => (xScale(p.x) ?? 0) + barWidth / 2}
              y={(p) => yScale(p.y)}
              stroke={colorFor(overlay.color)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          )}

          {tooltipOpen && tooltipData && (
            <Line
              from={{
                x: (xScale(tooltipData.x) ?? 0) + barWidth / 2,
                y: 0,
              }}
              to={{
                x: (xScale(tooltipData.x) ?? 0) + barWidth / 2,
                y: yScale(tooltipData.topY),
              }}
              stroke={mutedColor}
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          )}

          {tooltipOpen && tooltipData?.overlay && overlay && (
            <circle
              cx={(xScale(tooltipData.x) ?? 0) + barWidth / 2}
              cy={yScale(tooltipData.overlay.y)}
              r={3.5}
              fill={colorFor(overlay.color)}
              stroke={surface}
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}

          <rect
            width={innerW}
            height={innerH}
            fill="transparent"
            style={onSelect ? { cursor: "pointer" } : undefined}
            onPointerMove={handleMove}
            onPointerLeave={hideTooltip}
            onClick={onSelect ? handleClick : undefined}
          />
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          key={tooltipData.x}
          left={tooltipLeft}
          top={tooltipTop}
          style={{
            position: "absolute",
            pointerEvents: "none",
            background: surface,
            color: fgColor,
            border: `${borderWidth} solid ${lineColor}`,
            borderRadius: radius,
            fontFamily,
            fontSize: 11,
            padding: "6px 8px",
            lineHeight: 1.5,
          }}
        >
          <div style={{ color: mutedColor, marginBottom: 2 }}>
            {formatX(tooltipData.x)}
          </div>
          {tooltipData.rows.map((row) => {
            const s = series.find((it) => it.id === row.id);
            return (
              <div
                key={row.id}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: s ? colorFor(s.color) : mutedColor,
                    flex: "0 0 auto",
                  }}
                />
                <span style={{ color: mutedColor }}>{row.label}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontVariantNumeric: "tabular-nums",
                    paddingLeft: 12,
                  }}
                >
                  {formatY(row.y)}
                </span>
              </div>
            );
          })}
          {tooltipData.rows.length > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
                fontWeight: 700,
              }}
            >
              <span style={{ width: 8, flex: "0 0 auto" }} />
              <span style={{ color: mutedColor }}>{totalLabel}</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  paddingLeft: 12,
                }}
              >
                {formatY(tooltipData.total)}
              </span>
            </div>
          )}
          {tooltipData.overlay && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 2,
                  borderRadius: 9999,
                  background: overlay ? colorFor(overlay.color) : mutedColor,
                  flex: "0 0 auto",
                }}
              />
              <span style={{ color: mutedColor }}>
                {tooltipData.overlay.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontVariantNumeric: "tabular-nums",
                  paddingLeft: 12,
                }}
              >
                {formatY(tooltipData.overlay.y)}
              </span>
            </div>
          )}
        </TooltipWithBounds>
      )}
    </>
  );
}
