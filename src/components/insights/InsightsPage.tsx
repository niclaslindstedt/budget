import { useEffect, useMemo, useState } from "react";
import { Pencil, Settings2 } from "lucide-react";

import type { Action } from "../../data/reducer";
import {
  buildNetWorthCategorySeries,
  computeNetWorthSnapshot,
  type NetWorthCategory,
} from "../../data/insights/networth";
import type {
  InsightsMode,
  InsightsView,
  Settings,
  Sheet,
  UserData,
} from "../../data/types";
import { useIsMobile } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import {
  formatBalance,
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import {
  ChartRangeRow,
  chartRangeCutoffMs,
  DEFAULT_CHART_RANGE,
  type ChartRange,
} from "../charts/ChartRangeRow";
import {
  StackedAreaChart,
  type StackedChartSeries,
} from "../charts/StackedAreaChart";
import { Checkbox } from "../form";
import { useModalDispatch } from "../modal-dispatch";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { InsightsSettingsModal } from "./InsightsSettingsModal";

// The Insights page renders cross-cutting analyses over everything the
// workspace tracks. It is organised around insight modes; with only
// "networth" implemented the mode toggle is hidden by design — it lands
// (as a segmented control under the title) together with the second
// `InsightsMode` literal.

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// Categories fetched from the data layer — the full set, with mortgages as
// their own liability. The display below folds mortgages into the properties
// band, so the page asks for both and merges them.
const SERIES_CATEGORIES: readonly NetWorthCategory[] = [
  "accounts",
  "savings",
  "items",
  "investments",
  "properties",
  "mortgages",
  "loans",
];

// Display bands in stacking order: assets first, the (net) properties band,
// liabilities last. Properties and mortgages — the two figures that dwarf
// everything else — fold into one net-equity band so they read as a single
// breakdown line, chart band, and visibility toggle; un-ticking it drops both
// at once, which is what makes the smaller bands legible.
const DISPLAY_CATEGORIES = [
  "accounts",
  "savings",
  "items",
  "investments",
  "properties",
  "loans",
] as const;

type DisplayCategory = (typeof DISPLAY_CATEGORIES)[number];

const CATEGORY_LABEL_KEY = {
  accounts: "insightsSheet.categoryAccounts",
  savings: "insightsSheet.categorySavings",
  items: "insightsSheet.categoryItems",
  investments: "insightsSheet.categoryInvestments",
  properties: "insightsSheet.categoryPropertiesNet",
  loans: "insightsSheet.categoryLoans",
} as const;

// Band colour per display category — distinct accent tokens for the assets
// that stack upward, a single red for the liabilities that stack below zero.
// The net-worth total line rides on top in `--fg-bright`.
const CATEGORY_COLOR: Record<DisplayCategory, string> = {
  accounts: "--accent",
  savings: "--link",
  items: "--path",
  investments: "--pipe",
  properties: "--flag",
  loans: "--danger",
};

export function InsightsPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();
  const dispatchModal = useModalDispatch();

  const view = sheet.items.find(
    (item): item is InsightsView => item.type === "insightsView",
  );
  const mode: InsightsMode = view?.mode ?? "networth";

  const today = todayIso();
  const snapshot = useMemo(
    () => computeNetWorthSnapshot(data, view?.networth, today),
    [data, view?.networth, today],
  );
  const categorySeries = useMemo(
    () =>
      buildNetWorthCategorySeries(
        data,
        view?.networth,
        today,
        SERIES_CATEGORIES,
      ),
    [data, view?.networth, today],
  );

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);
  // Per-band chart visibility. A hidden band drops from the stack and the
  // axis rescales to the bands that remain — the way to read the smaller
  // bands when properties dwarf them. Chart-only; the breakdown list always
  // shows every present category.
  const [hidden, setHidden] = useState<ReadonlySet<DisplayCategory>>(
    () => new Set<DisplayCategory>(),
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setHidden(new Set<DisplayCategory>());
  }, [sheet.id]);

  const toggleCategory = (category: DisplayCategory) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    {
      key: "networth-settings",
      icon: <Settings2 size={16} aria-hidden focusable={false} />,
      label: t("insightsSheet.settingsAction"),
      onClick: () => setSettingsOpen(true),
    },
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  // Only categories with at least one entity behind them render a breakdown
  // row / chart band — a workspace without properties shouldn't list a zero
  // line. Mortgages have no entities of their own (they ride with a
  // property), so they never gate a band: the properties band carries them.
  const presentCategories = DISPLAY_CATEGORIES.filter((category) =>
    snapshot.entities.some((e) => e.category === category),
  );

  // The (net) properties band folds in mortgages: property value minus
  // mortgage debt, summed per sample. Properties and mortgages share one x
  // array (both walk the same monthly samples), so the index-aligned add
  // keeps the band's points lined up. Every other category passes through.
  const seriesByCategory = useMemo(
    () => new Map(categorySeries.map((s) => [s.category, s])),
    [categorySeries],
  );
  const displaySeries = useMemo(
    () =>
      DISPLAY_CATEGORIES.map((category) => {
        if (category === "properties") {
          const property = seriesByCategory.get("properties")?.points ?? [];
          const mortgages = seriesByCategory.get("mortgages")?.points ?? [];
          return {
            category,
            points: property.map((p, i) => ({
              x: p.x,
              y: p.y + (mortgages[i]?.y ?? 0),
            })),
          };
        }
        return {
          category,
          points: seriesByCategory.get(category)?.points ?? [],
        };
      }),
    [seriesByCategory],
  );

  // Net contribution per display category for the breakdown list — the
  // properties row nets its mortgage debt in, so it matches the band.
  const categoryValue = (category: DisplayCategory): number =>
    category === "properties"
      ? snapshot.perCategory.properties + snapshot.perCategory.mortgages
      : snapshot.perCategory[category];

  // Stack one band per present, non-hidden category — assets first so they
  // pile upward, the net properties band among them, other loans last so they
  // hang below the zero baseline — and trace the net total through them. Clip
  // each band to the trailing window picked on the shared range row (same
  // buttons as the loans visualizer); the bands share one x array so the same
  // cutoff keeps them aligned. "chartable data at all" vs. "the selected
  // window holds ≥ 2 samples" are distinct gates, and both are independent of
  // the per-band toggles so hiding a band never reads as missing data.
  const cutoffMs = chartRangeCutoffMs(range, today);
  const presentSeries = displaySeries.filter((s) =>
    presentCategories.includes(s.category),
  );
  const sampleCount = presentSeries[0]?.points.length ?? 0;
  const chartSeries: StackedChartSeries[] = presentSeries
    .filter((s) => !hidden.has(s.category))
    .map((s) => ({
      id: s.category,
      label: t(CATEGORY_LABEL_KEY[s.category]),
      color: CATEGORY_COLOR[s.category],
      points:
        range === "all" ? s.points : s.points.filter((p) => p.x >= cutoffMs),
    }));
  const hasAnyData = sampleCount >= 2;
  const allHidden =
    presentCategories.length > 0 &&
    presentCategories.every((category) => hidden.has(category));
  const hasChart = (chartSeries[0]?.points.length ?? 0) >= 2;
  const formatX = (x: number) =>
    formatMonthYearShort(new Date(x).toISOString().slice(0, 10), lang);
  // Mirrors `SavingsValueChartModal`: desktop renders the full grouped
  // figure (the chart sizes its left gutter to fit); mobile is too
  // narrow, so the Y axis always abbreviates with one decimal.
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
    <section>
      <header className="mb-2 flex items-center justify-center md:mb-6">
        <h2 className="m-0">
          <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
        </h2>
      </header>

      {/* The mode toggle (a segmented control) lands here once a second
          `InsightsMode` exists — with one mode it is hidden by design. */}

      {mode === "networth" && (
        <section className="mb-6" data-sheet-content>
          {snapshot.entities.length === 0 ? (
            <div className="rounded border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
              {t("insightsSheet.noData")}
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-1 rounded border border-line bg-surface px-4 py-6">
                <span className="text-xs font-bold tracking-wider uppercase text-muted">
                  {t("insightsSheet.netWorthTitle")}
                </span>
                <span
                  className={`font-mono text-3xl font-bold tabular-nums ${
                    snapshot.total < 0 ? "text-negative" : "text-fg-bright"
                  }`}
                >
                  {formatBalance(snapshot.total, settings)}
                </span>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
                  {t("insightsSheet.breakdownTitle")}
                </h3>
                <div className="overflow-clip rounded border border-line bg-surface">
                  <ul className="m-0 flex list-none flex-col p-0">
                    {presentCategories.map((category) => {
                      const value = categoryValue(category);
                      return (
                        <li
                          key={category}
                          className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0"
                        >
                          <span className="text-muted">
                            {t(CATEGORY_LABEL_KEY[category])}
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              value < 0 ? "text-negative" : "text-fg-bright"
                            }`}
                          >
                            {formatBalance(value, settings)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
                  {t("insightsSheet.chartTitle")}
                </h3>
                {hasAnyData ? (
                  <div className="flex flex-col gap-3">
                    {allHidden ? (
                      <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
                        {t("insightsSheet.chartAllHidden")}
                      </div>
                    ) : hasChart ? (
                      <div className="rounded border border-line bg-surface p-2">
                        <StackedAreaChart
                          series={chartSeries}
                          formatX={formatX}
                          formatY={formatY}
                          totalLabel={t("insightsSheet.netWorthSeries")}
                          totalLine={{ color: "--fg-bright" }}
                        />
                      </div>
                    ) : (
                      <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
                        {t("insightsSheet.chartNoneInRange")}
                      </div>
                    )}

                    {/* Legend doubles as per-band visibility toggles, like
                        the loans chart's include/exclude checkboxes:
                        un-tick a band to drop it from the stack and rescale
                        the axis to what remains. Rendered outside the chart
                        branch so a hidden band can always be ticked back on.
                        The net-worth total line is the algebraic sum of the
                        visible bands, so it has no toggle. */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-fg-bright">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full bg-fg-bright"
                        />
                        {t("insightsSheet.netWorthSeries")}
                      </span>
                      {presentCategories.map((category) => (
                        <Checkbox
                          key={category}
                          align="center"
                          checked={!hidden.has(category)}
                          onChange={() => toggleCategory(category)}
                          label={
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  background: `var(${CATEGORY_COLOR[category]})`,
                                }}
                              />
                              {t(CATEGORY_LABEL_KEY[category])}
                            </span>
                          }
                        />
                      ))}
                    </div>

                    <ChartRangeRow value={range} onChange={setRange} />
                  </div>
                ) : (
                  <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
                    {t("insightsSheet.chartEmpty")}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {view && (
        <InsightsSettingsModal
          open={settingsOpen}
          entities={snapshot.entities}
          // Linked-mortgage loans get no settings row (their property
          // governs) — surface the note whenever any exist.
          hasLinkedLoans={
            data.loans.length >
            snapshot.entities.filter((e) => e.category === "loans").length
          }
          settings={settings}
          initial={view.networth}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            dispatch({
              type: "setInsightsNetWorthSettings",
              sheetId: sheet.id,
              itemId: view.id,
              settings: next,
            });
            setSettingsOpen(false);
          }}
        />
      )}
    </section>
  );
}
