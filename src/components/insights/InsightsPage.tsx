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

// Breakdown rows in display order: assets first, liabilities last.
const BREAKDOWN_CATEGORIES: readonly NetWorthCategory[] = [
  "accounts",
  "savings",
  "items",
  "investments",
  "properties",
  "mortgages",
  "loans",
];

const CATEGORY_LABEL_KEY = {
  accounts: "insightsSheet.categoryAccounts",
  savings: "insightsSheet.categorySavings",
  items: "insightsSheet.categoryItems",
  investments: "insightsSheet.categoryInvestments",
  properties: "insightsSheet.categoryProperties",
  mortgages: "insightsSheet.categoryMortgages",
  loans: "insightsSheet.categoryLoans",
} as const;

// Band colour per category — distinct accent tokens for the assets that
// stack upward, two reds for the liabilities that stack below zero. The
// net-worth total line rides on top in `--fg-bright`.
const CATEGORY_COLOR: Record<NetWorthCategory, string> = {
  accounts: "--accent",
  savings: "--link",
  items: "--path",
  investments: "--pipe",
  properties: "--flag",
  mortgages: "--negative",
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
        BREAKDOWN_CATEGORIES,
      ),
    [data, view?.networth, today],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [range, setRange] = useState<ChartRange>(DEFAULT_CHART_RANGE);

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

  // Only categories with at least one entity behind them render a
  // breakdown row / chart band — a workspace without properties shouldn't
  // list a zero "Mortgages" line. Mortgages ride with properties.
  const presentCategories = BREAKDOWN_CATEGORIES.filter((category) =>
    snapshot.entities.some((e) =>
      category === "mortgages"
        ? e.category === "properties" && e.liabilityGross !== undefined
        : e.category === category,
    ),
  );

  // Stack one band per present category — assets first so they pile upward,
  // liabilities last so they hang below the zero baseline — and trace the
  // net total through them. Clip each band to the trailing window picked on
  // the shared range row (same buttons as the loans visualizer); the bands
  // share one x array so the same cutoff keeps them aligned. "chartable data
  // at all" vs. "the selected window holds ≥ 2 samples" are distinct gates.
  const cutoffMs = chartRangeCutoffMs(range, today);
  const presentSeries = categorySeries.filter((s) =>
    presentCategories.includes(s.category),
  );
  const sampleCount = presentSeries[0]?.points.length ?? 0;
  const chartSeries: StackedChartSeries[] = presentSeries.map((s) => ({
    id: s.category,
    label: t(CATEGORY_LABEL_KEY[s.category]),
    color: CATEGORY_COLOR[s.category],
    points:
      range === "all" ? s.points : s.points.filter((p) => p.x >= cutoffMs),
  }));
  const hasAnyData = sampleCount >= 2;
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
                      const value = snapshot.perCategory[category];
                      const liability =
                        category === "mortgages" || category === "loans";
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
                              liability && value !== 0
                                ? "text-negative"
                                : "text-fg-bright"
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
                    {hasChart ? (
                      <div className="flex flex-col gap-2">
                        <div className="rounded border border-line bg-surface p-2">
                          <StackedAreaChart
                            series={chartSeries}
                            formatX={formatX}
                            formatY={formatY}
                            totalLabel={t("insightsSheet.netWorthSeries")}
                            totalLine={{ color: "--fg-bright" }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full bg-fg-bright"
                            />
                            {t("insightsSheet.netWorthSeries")}
                          </span>
                          {chartSeries.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1.5"
                            >
                              <span
                                aria-hidden
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: `var(${s.color})` }}
                              />
                              {s.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted">
                        {t("insightsSheet.chartNoneInRange")}
                      </div>
                    )}
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
