import { useCallback, useMemo } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { Line, LinePath } from "@visx/shape";
import { useTooltip, TooltipWithBounds } from "@visx/tooltip";

import { useThemeTokens } from "../../hooks";

// The app's first chart primitive: a reusable, theme-aware multi-series line
// chart. It owns no domain knowledge and ships no user-facing copy — the
// caller passes data series (each pointing at a CSS colour token), tick
// formatters, and labels, so every page can drive it. All colours, the font,
// the grid weight, and the tooltip's surface / radius read through
// `useThemeTokens`, so the chart follows the active theme (presets and the
// Custom theme's colour / radius / border-width / density choices) the same
// way the rest of the app does. No animation is introduced, so the
// reduce-motion preference is respected by construction.

export type ChartPoint = { x: number; y: number };

export type ChartSeries = {
  // Stable key for React + tooltip lookups.
  id: string;
  // Legend / tooltip label (already translated by the caller).
  label: string;
  // The CSS custom property the line's colour reads from, e.g. "--accent".
  colorVar: string;
  // Ascending-x points. Fewer than two points draws no visible line.
  points: ChartPoint[];
  // Draw the line dashed rather than solid — for reference lines (e.g. a
  // purchase-value baseline) that read as secondary to the data series.
  dashed?: boolean;
  // Keep the series out of the hover tooltip (and its marker dot). For flat
  // reference lines (e.g. the purchase-value baseline) whose value is constant
  // and already labelled on the chart, so the tooltip names only the data.
  omitFromTooltip?: boolean;
};

type Props = {
  series: ChartSeries[];
  // Formats an x value for the bottom axis ticks and the tooltip heading.
  formatX: (x: number) => string;
  // Formats a y value for the left axis ticks and the tooltip rows.
  formatY: (y: number) => string;
  // Chart height in px (width fills the container).
  height?: number;
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
// stays stable across renders. The series colours are appended per render.
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

type Tooltip = { x: number; rows: { id: string; label: string; y: number }[] };

export function LineChart({ series, formatX, formatY, height = 280 }: Props) {
  const colorVars = useMemo(
    () => Array.from(new Set(series.map((s) => s.colorVar))),
    [series],
  );
  const tokens = useThemeTokens([...CHROME_TOKENS, ...colorVars]);
  const fontFamily = tokens["--app-font-family"] || "monospace";
  const lineColor = tokens["--line"] || "#3a3f4b";
  const mutedColor = tokens["--muted"] || "#7f848e";
  const fgColor = tokens["--fg-bright"] || tokens["--fg"] || "#dcdfe4";
  const colorFor = useCallback(
    (colorVar: string) => tokens[colorVar] || mutedColor,
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
  colorFor: (colorVar: string) => string;
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

  const { xDomain, yDomain, sortedXs } = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const xs = new Set<number>();
    for (const s of series) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        xs.add(p.x);
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 1;
    }
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 1;
    }
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    // Pad the y-range by 8% so lines don't graze the top/bottom edges, and
    // never let a flat series collapse to a zero-height band.
    const pad = (maxY - minY) * 0.08 || Math.abs(maxY) * 0.08 || 1;
    return {
      xDomain: [minX, maxX] as [number, number],
      yDomain: [minY - pad, maxY + pad] as [number, number],
      sortedXs: Array.from(xs).sort((a, b) => a - b),
    };
  }, [series]);

  const yScale = useMemo(
    () => scaleLinear<number>({ domain: yDomain, range: [innerH, 0] }),
    [yDomain, innerH],
  );

  // Keep the horizontal gridlines sparse: a denser axis on a narrow,
  // high-magnitude range (a property worth 2.95M–3.3M across snapshots)
  // forces d3 onto a 50K step that the abbreviated mobile labels round to
  // duplicate "3,2M / 3,2M" pairs. ~4 ticks lands on a clean 0.1M step.
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
    () => scaleLinear<number>({ domain: xDomain, range: [0, innerW] }),
    [xDomain, innerW],
  );

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
      const xValue = xScale.invert(point.x - leftMargin);
      // Snap to the nearest x at which we have samples (the value snapshots).
      let nearest = sortedXs[0];
      for (const candidate of sortedXs) {
        if (Math.abs(candidate - xValue) < Math.abs(nearest - xValue))
          nearest = candidate;
      }
      const rows: Tooltip["rows"] = [];
      for (const s of series) {
        if (s.omitFromTooltip) continue;
        const match = s.points.find((p) => p.x === nearest);
        if (match) rows.push({ id: s.id, label: s.label, y: match.y });
      }
      if (rows.length === 0) return;
      showTooltip({
        tooltipData: { x: nearest, rows },
        tooltipLeft: leftMargin + xScale(nearest),
        tooltipTop: MARGIN.top + yScale(rows[0].y),
      });
    },
    [sortedXs, series, xScale, yScale, leftMargin, showTooltip],
  );

  const numTicksX = Math.max(2, Math.min(8, Math.floor(innerW / 90)));
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
            numTicks={numTicksX}
            stroke={lineColor}
            tickStroke={lineColor}
            tickFormat={(v) => formatX(Number(v))}
            tickLabelProps={() => ({
              ...axisLabelProps,
              textAnchor: "middle",
              dy: 2,
            })}
          />

          {series.map((s) => (
            <LinePath<ChartPoint>
              key={s.id}
              data={s.points}
              x={(p) => xScale(p.x)}
              y={(p) => yScale(p.y)}
              // Monotone-in-x smoothing rounds the line without overshooting
              // past the samples, so the curve never dips below a trough the
              // data never hit.
              curve={curveMonotoneX}
              stroke={colorFor(s.colorVar)}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4,4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {tooltipOpen && tooltipData && (
            <>
              <Line
                from={{ x: xScale(tooltipData.x), y: 0 }}
                to={{ x: xScale(tooltipData.x), y: innerH }}
                stroke={mutedColor}
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
              {tooltipData.rows.map((row) => {
                const s = series.find((it) => it.id === row.id);
                return (
                  <circle
                    key={row.id}
                    cx={xScale(tooltipData.x)}
                    cy={yScale(row.y)}
                    r={3.5}
                    fill={s ? colorFor(s.colorVar) : mutedColor}
                    stroke={surface}
                    strokeWidth={1.5}
                    pointerEvents="none"
                  />
                );
              })}
            </>
          )}

          <rect
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={hideTooltip}
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
                    background: s ? colorFor(s.colorVar) : mutedColor,
                    flex: "0 0 auto",
                  }}
                />
                <span style={{ color: mutedColor }}>{row.label}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatY(row.y)}
                </span>
              </div>
            );
          })}
        </TooltipWithBounds>
      )}
    </>
  );
}
