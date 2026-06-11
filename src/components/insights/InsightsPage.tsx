import { useEffect, useMemo, useState } from "react";
import { Pencil, Settings2 } from "lucide-react";

import type { Action } from "../../data/reducer";
import {
  buildNetWorthSeries,
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
import { LineChart, type ChartSeries } from "../charts/LineChart";
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
  "properties",
  "mortgages",
  "loans",
];

const CATEGORY_LABEL_KEY = {
  accounts: "insightsSheet.categoryAccounts",
  savings: "insightsSheet.categorySavings",
  items: "insightsSheet.categoryItems",
  properties: "insightsSheet.categoryProperties",
  mortgages: "insightsSheet.categoryMortgages",
  loans: "insightsSheet.categoryLoans",
} as const;

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
  const seriesPoints = useMemo(
    () => buildNetWorthSeries(data, view?.networth, today),
    [data, view?.networth, today],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const hasChart = seriesPoints.length >= 2;
  const chartSeries: ChartSeries[] = [
    {
      id: "total",
      label: t("insightsSheet.netWorthSeries"),
      colorVar: "--accent",
      points: seriesPoints,
    },
  ];
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

  // Only categories with at least one entity behind them render a
  // breakdown row — a workspace without properties shouldn't list a
  // zero "Mortgages" line. Mortgages ride with properties.
  const presentCategories = BREAKDOWN_CATEGORIES.filter((category) =>
    snapshot.entities.some((e) =>
      category === "mortgages"
        ? e.category === "properties" && e.liabilityGross !== undefined
        : e.category === category,
    ),
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
                {hasChart ? (
                  <div className="rounded border border-line bg-surface p-2">
                    <LineChart
                      series={chartSeries}
                      formatX={formatX}
                      formatY={formatY}
                    />
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
