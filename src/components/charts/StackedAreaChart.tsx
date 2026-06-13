import { useCallback, useMemo } from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { Area, Line, LinePath } from "@visx/shape";
import { useTooltip, TooltipWithBounds } from "@visx/tooltip";

import { useThemeTokens } from "../../hooks";

// A theme-aware stacked area chart — `LineChart`'s sibling for "how does
// each part contribute to the total" questions. Like `LineChart` it owns no
// domain knowledge and ships no user-facing copy: the caller passes the
// series, tick formatters, and the tooltip's total-row label. Every chrome
// colour, the font, and the tooltip surface read through `useThemeTokens`;
// no animation is introduced, so reduce-motion is respected by construction.
//
// Bands stack around zero per sample: a positive value stacks upward on the
// running positive offset, a negative value downward on the running negative
// offset. With all-positive data this collapses to a plain bottom-up stack
// anchored at 0 (the top edge is the total). With mixed signs the stack
// diverges — assets above the baseline, liabilities below — and the optional
// `totalLine` traces the algebraic sum (e.g. net worth). A zero baseline is
// drawn whenever any band dips negative.
//
// Every series MUST share one ascending x array (a band that doesn't exist
// yet at some x contributes y = 0 there) — stacking offsets are computed
// per sample index, and monotone smoothing then interpolates band k's top
// and band k+1's bottom from the same array, so adjacent bands tile with no
// gaps or overshoot.

export type StackedChartPoint = { x: number; y: number };

export type StackedChartSeries = {
  // Stable key for React + tooltip lookups.
  id: string;
  // Legend / tooltip label (already translated by the caller).
  label: string;
  // Either a CSS custom property the band's colour reads from ("--accent")
  // or a literal CSS colour ("#e06c75" — user-picked sheet colours are
  // stored as hexes). Disambiguated by the "--" prefix.
  color: string;
  // Ascending-x points, identical x values across every series.
  points: StackedChartPoint[];
};

type Props = {
  // Bands, stacked bottom-up in array order.
  series: StackedChartSeries[];
  // Formats an x value for the bottom axis ticks and the tooltip heading.
  formatX: (x: number) => string;
  // Formats a y value for the left axis ticks and the tooltip rows.
  formatY: (y: number) => string;
  // Label for the tooltip's bold total row (already translated).
  totalLabel: string;
  // When set, overlay a line tracing the algebraic sum of every band at
  // each sample (assets minus liabilities) in the given colour — a "—"
  // prefixed CSS custom property or a literal colour, like a band's
  // `color`. Use it when the stack diverges around zero so the net figure
  // (e.g. net worth) reads as one line through the bands.
  totalLine?: { color: string };
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

// One band's stacked geometry: its own value plus the cumulative bottom /
// top edges at each shared sample.
type StackedPoint = { x: number; y0: number; y1: number; own: number };

// The algebraic per-sample sum traced by `totalLine`.
type TotalPoint = { x: number; y: number };

type Tooltip = {
  x: number;
  // Top band first (matching the visual stacking), each row carrying the
  // band's own un-stacked value.
  rows: { id: string; label: string; y: number }[];
  total: number;
  topY: number;
};

export function StackedAreaChart({
  series,
  formatX,
  formatY,
  totalLabel,
  totalLine,
  height = 280,
}: Props) {
  const colorVars = useMemo(
    () =>
      Array.from(
        new Set(
          [...series.map((s) => s.color), totalLine?.color]
            .filter((c): c is string => c !== undefined)
            .filter((c) => c.startsWith("--")),
        ),
      ),
    [series, totalLine],
  );
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
              totalLine={totalLine}
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
  totalLine,
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

  // Diverging offsets per shared sample index: a positive value stacks on
  // the running positive offset (upward), a negative on the running negative
  // offset (downward). Also the x domain, the per-x stack extents the scale
  // spans, and the algebraic per-sample totals `totalLine` traces.
  const { stacked, totals, xDomain, yDomain, sortedXs } = useMemo(() => {
    const stacked: StackedPoint[][] = [];
    const sampleCount = series.reduce(
      (max, s) => Math.max(max, s.points.length),
      0,
    );
    const posOffsets = new Array<number>(sampleCount).fill(0);
    const negOffsets = new Array<number>(sampleCount).fill(0);
    const algebraic = new Array<number>(sampleCount).fill(0);
    const xByIndex = new Array<number | undefined>(sampleCount).fill(undefined);
    let minX = Infinity;
    let maxX = -Infinity;
    let maxTotal = 0;
    let minTotal = 0;
    const xs = new Set<number>();
    for (const s of series) {
      const band: StackedPoint[] = s.points.map((p, i) => {
        let y0: number;
        let y1: number;
        if (p.y >= 0) {
          y0 = posOffsets[i];
          y1 = y0 + p.y;
          posOffsets[i] = y1;
        } else {
          y1 = negOffsets[i];
          y0 = y1 + p.y;
          negOffsets[i] = y0;
        }
        algebraic[i] += p.y;
        xByIndex[i] = p.x;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (y1 > maxTotal) maxTotal = y1;
        if (y0 < minTotal) minTotal = y0;
        xs.add(p.x);
        return { x: p.x, y0, y1, own: p.y };
      });
      stacked.push(band);
    }
    const totals: TotalPoint[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const x = xByIndex[i];
      if (x !== undefined) totals.push({ x, y: algebraic[i] });
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      maxX = 1;
    }
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    // Pad the occupied side(s) so the tallest / deepest point doesn't graze
    // the edge; keep the zero baseline pinned and don't let an all-zero
    // stack collapse the scale.
    return {
      stacked,
      totals,
      xDomain: [minX, maxX] as [number, number],
      yDomain: [
        minTotal < 0 ? minTotal * 1.08 : 0,
        maxTotal > 0 ? maxTotal * 1.08 : minTotal < 0 ? 0 : 1,
      ] as [number, number],
      sortedXs: Array.from(xs).sort((a, b) => a - b),
    };
  }, [series]);

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
      // Snap to the nearest shared sample x.
      let nearest = sortedXs[0];
      for (const candidate of sortedXs) {
        if (Math.abs(candidate - xValue) < Math.abs(nearest - xValue))
          nearest = candidate;
      }
      const rows: Tooltip["rows"] = [];
      let total = 0;
      let topY = 0;
      // Top band first so the tooltip reads in the same order as the stack.
      for (let k = series.length - 1; k >= 0; k--) {
        const match = stacked[k].find((p) => p.x === nearest);
        if (!match) continue;
        rows.push({ id: series[k].id, label: series[k].label, y: match.own });
        total += match.own;
        if (match.y1 > topY) topY = match.y1;
      }
      if (rows.length === 0) return;
      showTooltip({
        tooltipData: { x: nearest, rows, total, topY },
        tooltipLeft: leftMargin + xScale(nearest),
        tooltipTop: MARGIN.top + yScale(topY),
      });
    },
    [sortedXs, series, stacked, xScale, yScale, leftMargin, showTooltip],
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

          {series.map((s, k) => (
            <Area<StackedPoint>
              key={s.id}
              data={stacked[k]}
              x={(p) => xScale(p.x)}
              y0={(p) => yScale(p.y0)}
              y1={(p) => yScale(p.y1)}
              // Monotone-in-x smoothing rounds the edges without
              // overshooting past the samples; band k's top and band k+1's
              // bottom interpolate the same array, so the bands tile.
              curve={curveMonotoneX}
              fill={colorFor(s.color)}
              fillOpacity={0.55}
            />
          ))}
          {series.map((s, k) => (
            <LinePath<StackedPoint>
              key={s.id}
              data={stacked[k]}
              x={(p) => xScale(p.x)}
              y={(p) => yScale(p.y1)}
              curve={curveMonotoneX}
              stroke={colorFor(s.color)}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Zero baseline — only when the stack dips below it, so the
              all-positive case is visually unchanged. */}
          {yDomain[0] < 0 && (
            <Line
              from={{ x: 0, y: yScale(0) }}
              to={{ x: innerW, y: yScale(0) }}
              stroke={lineColor}
              strokeWidth={1}
            />
          )}

          {/* Net total traced through the diverging bands. */}
          {totalLine && (
            <LinePath<TotalPoint>
              data={totals}
              x={(p) => xScale(p.x)}
              y={(p) => yScale(p.y)}
              curve={curveMonotoneX}
              stroke={colorFor(totalLine.color)}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

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
              {series.map((s, k) => {
                const match = stacked[k].find((p) => p.x === tooltipData.x);
                if (!match) return null;
                return (
                  <circle
                    key={s.id}
                    cx={xScale(tooltipData.x)}
                    cy={yScale(match.y1)}
                    r={3.5}
                    fill={colorFor(s.color)}
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
        </TooltipWithBounds>
      )}
    </>
  );
}
