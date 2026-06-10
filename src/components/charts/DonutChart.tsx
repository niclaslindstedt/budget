import { useCallback, useMemo } from "react";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { Pie } from "@visx/shape";
import { useTooltip, TooltipWithBounds } from "@visx/tooltip";

import { useThemeTokens } from "../../hooks";

// A theme-aware donut chart for part-of-whole breakdowns (e.g. spend
// share per category). Like the other chart primitives it owns no
// domain knowledge and ships no user-facing copy: the caller passes
// pre-sorted slices, value / share formatters, and the centre label.
// Every chrome colour, the font, and the tooltip surface read through
// `useThemeTokens`; no animation is introduced, so reduce-motion is
// respected by construction.
//
// Clicking a slice is a progressive enhancement (`onSliceClick`); the
// caller is responsible for providing an accessible equivalent (e.g.
// legend buttons) when a click drills somewhere.

export type DonutChartSlice = {
  // Stable key for React + tooltip lookups, echoed to `onSliceClick`.
  id: string;
  // Tooltip label (already translated by the caller).
  label: string;
  // Either a CSS custom property the slice's colour reads from
  // ("--accent") or a literal CSS colour ("#e06c75" — user-picked
  // category colours are stored as hexes). Disambiguated by the "--"
  // prefix.
  color: string;
  // Non-negative; slices render proportionally to their value.
  value: number;
};

type Props = {
  // Pre-sorted by the caller; rendered clockwise in array order.
  slices: DonutChartSlice[];
  // Formats a value for the tooltip rows and the centre total.
  formatValue: (value: number) => string;
  // Formats a 0..1 share for the tooltip's percent row.
  formatShare: (share: number) => string;
  // Muted caption above the centre total (already translated).
  totalLabel: string;
  // When set, slices render with a pointer cursor and clicks fire it.
  onSliceClick?: (id: string) => void;
  // Chart height in px (width fills the container).
  height?: number;
};

// Structural tokens the chart chrome reads, kept module-level so the hook key
// stays stable across renders. The slices' token colours append per render.
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

type Tooltip = { id: string };

export function DonutChart({
  slices,
  formatValue,
  formatShare,
  totalLabel,
  onSliceClick,
  height = 260,
}: Props) {
  const colorVars = useMemo(
    () =>
      Array.from(
        new Set(slices.map((s) => s.color).filter((c) => c.startsWith("--"))),
      ),
    [slices],
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
              slices={slices}
              formatValue={formatValue}
              formatShare={formatShare}
              totalLabel={totalLabel}
              onSliceClick={onSliceClick}
              fontFamily={fontFamily}
              mutedColor={mutedColor}
              fgColor={fgColor}
              colorFor={colorFor}
              surface={
                tokens["--surface-2"] || tokens["--surface"] || "#21252b"
              }
              lineColor={lineColor}
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
  mutedColor: string;
  fgColor: string;
  colorFor: (color: string) => string;
  surface: string;
  lineColor: string;
  radius: string;
  borderWidth: string;
};

function Chart({
  width,
  height,
  slices,
  formatValue,
  formatShare,
  totalLabel,
  onSliceClick,
  fontFamily,
  mutedColor,
  fgColor,
  colorFor,
  surface,
  lineColor,
  radius,
  borderWidth,
}: ChartProps) {
  const total = useMemo(
    () => slices.reduce((sum, s) => sum + Math.max(0, s.value), 0),
    [slices],
  );
  const outerRadius = Math.max(0, Math.min(width, height) / 2 - 4);
  const innerRadius = outerRadius * 0.62;
  const centerX = width / 2;
  const centerY = height / 2;

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<Tooltip>();

  const handleMove = useCallback(
    (event: React.PointerEvent<SVGPathElement>, id: string) => {
      const point = localPoint(event);
      if (!point) return;
      showTooltip({
        tooltipData: { id },
        tooltipLeft: point.x,
        tooltipTop: point.y,
      });
    },
    [showTooltip],
  );

  const hovered = tooltipOpen && tooltipData ? tooltipData.id : null;
  const hoveredSlice = hovered
    ? slices.find((s) => s.id === hovered)
    : undefined;

  return (
    <>
      <svg width={width} height={height}>
        <Group left={centerX} top={centerY}>
          <Pie
            data={slices}
            pieValue={(s) => Math.max(0, s.value)}
            pieSortValues={null}
            outerRadius={outerRadius}
            innerRadius={innerRadius}
            padAngle={0.012}
          >
            {(pie) =>
              pie.arcs.map((arc) => (
                <path
                  key={arc.data.id}
                  d={pie.path(arc) ?? ""}
                  fill={colorFor(arc.data.color)}
                  fillOpacity={hovered === arc.data.id ? 0.95 : 0.75}
                  style={onSliceClick ? { cursor: "pointer" } : undefined}
                  onPointerMove={(event) => handleMove(event, arc.data.id)}
                  onPointerLeave={hideTooltip}
                  onClick={
                    onSliceClick ? () => onSliceClick(arc.data.id) : undefined
                  }
                />
              ))
            }
          </Pie>
          <text
            textAnchor="middle"
            y={-6}
            fill={mutedColor}
            fontFamily={fontFamily}
            fontSize={11}
            pointerEvents="none"
          >
            {totalLabel}
          </text>
          <text
            textAnchor="middle"
            y={14}
            fill={fgColor}
            fontFamily={fontFamily}
            fontSize={15}
            fontWeight={700}
            style={{ fontVariantNumeric: "tabular-nums" }}
            pointerEvents="none"
          >
            {formatValue(total)}
          </text>
        </Group>
      </svg>

      {tooltipOpen && hoveredSlice && (
        <TooltipWithBounds
          key={hoveredSlice.id}
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: colorFor(hoveredSlice.color),
                flex: "0 0 auto",
              }}
            />
            <span style={{ color: mutedColor }}>{hoveredSlice.label}</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{formatValue(hoveredSlice.value)}</span>
            <span style={{ marginLeft: "auto", color: mutedColor }}>
              {formatShare(total > 0 ? hoveredSlice.value / total : 0)}
            </span>
          </div>
        </TooltipWithBounds>
      )}
    </>
  );
}
