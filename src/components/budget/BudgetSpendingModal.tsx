import { useMemo, useState } from "react";
import { ChevronLeft, PieChart } from "lucide-react";

import {
  collectSpendingFacts,
  computeCategoryShares,
  computeIncomeVsExpenses,
  computeMonthlyCategorySpending,
  computeTopMerchants,
  computeTypeShares,
  monthIndexToKey,
  monthKeyToIndex,
  type SpendingPeriod,
  type SpendingShare,
} from "../../data/budget/spending";
import { currentFiscalMonthKey } from "../../data/fiscal-month";
import type {
  Category,
  Column,
  Company,
  EntryType,
  Row,
  Settings,
} from "../../data/types";
import { useIsMobile, useResetOnOpen } from "../../hooks";
import { bcp47 } from "../../i18n/locale";
import { useLang, useT } from "../../i18n";
import { indexById } from "../../utils/indexById";
import {
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { Modal } from "../Modal";
import { DonutChart, type DonutChartSlice } from "../charts/DonutChart";
import { LineChart, type ChartSeries } from "../charts/LineChart";
import {
  StackedBarChart,
  type StackedBarChartSeries,
} from "../charts/StackedBarChart";

// "Visualize spending" for the budget sheet — a scrollable dashboard of
// how money actually moved: monthly spend stacked per category, a
// category donut (click a slice / legend row to drill into the entry
// types inside it), income vs expenses per month, and the top merchants
// for the window. Only rows representing real spending count — the
// completed ones plus imported bank history; transfers and balance
// corrections are excluded (see `isActualSpendingRow`). A trailing
// fiscal-month range row (3M / 6M / 12M / All) clips every section to
// the same window. The aggregation lives in the pure
// `src/data/budget/spending.ts` helpers; this modal only maps facts to
// themed, translated series and owns the period / drilldown state.
//
// Default (non-`centered`) modal mode: the dashboard is tall, so mobile
// gets the fullscreen treatment and desktop a wide scrollable card.

type Props = {
  open: boolean;
  onClose: () => void;
  // `decoratedItem.rows` / `.columns` from BudgetPage's
  // `computeBudgetState` — formula amounts already mirrored into the
  // amount cell, synthesized history / transfer rows interleaved.
  rows: readonly Row[];
  columns: readonly Column[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companies: readonly Company[];
  settings: Settings;
};

const PERIODS: {
  value: SpendingPeriod;
  labelKey:
    | "spendingRange3m"
    | "spendingRange6m"
    | "spendingRange12m"
    | "spendingRangeAll";
}[] = [
  { value: 3, labelKey: "spendingRange3m" },
  { value: 6, labelKey: "spendingRange6m" },
  { value: 12, labelKey: "spendingRange12m" },
  { value: "all", labelKey: "spendingRangeAll" },
];

const DEFAULT_PERIOD: SpendingPeriod = 6;

// Sentinel slice id for the null (uncategorised / typeless) bucket —
// donut slices and legend rows need a stable string key.
const UNCATEGORIZED = "uncategorized";

const TOP_MERCHANTS_LIMIT = 8;

// Drilldown state: `null` = category level; otherwise the category the
// donut is drilled into (`categoryId: null` = the uncategorised bucket).
type Drill = { categoryId: string | null } | null;

export function BudgetSpendingModal({
  open,
  onClose,
  rows,
  columns,
  types,
  categories,
  companies,
  settings,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [period, setPeriod] = useState<SpendingPeriod>(DEFAULT_PERIOD);
  const [drill, setDrill] = useState<Drill>(null);
  useResetOnOpen(open, undefined, () => {
    setPeriod(DEFAULT_PERIOD);
    setDrill(null);
  });

  const typesById = useMemo(() => indexById(types), [types]);
  const categoriesById = useMemo(() => indexById(categories), [categories]);
  const companiesById = useMemo(() => indexById(companies), [companies]);

  const currentMonthKey = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  const { facts, monthKeys } = useMemo(
    () =>
      collectSpendingFacts({
        rows,
        columns,
        typesById,
        startOfMonth: settings.startOfMonth,
        currentMonthKey,
        period,
      }),
    [rows, columns, typesById, settings.startOfMonth, currentMonthKey, period],
  );

  const monthly = useMemo(
    () => computeMonthlyCategorySpending(facts, monthKeys),
    [facts, monthKeys],
  );
  const shares = useMemo(
    () =>
      drill === null
        ? computeCategoryShares(facts)
        : computeTypeShares(facts, drill.categoryId),
    [facts, drill],
  );
  const incomeVsExpenses = useMemo(
    () => computeIncomeVsExpenses(facts, monthKeys),
    [facts, monthKeys],
  );
  const topMerchants = useMemo(
    () =>
      computeTopMerchants(facts, TOP_MERCHANTS_LIMIT).filter((m) =>
        companiesById.has(m.companyId),
      ),
    [facts, companiesById],
  );

  const formatPercent = useMemo(() => {
    const fmt = new Intl.NumberFormat(bcp47(lang), {
      style: "percent",
      maximumFractionDigits: 0,
    });
    return (share: number) => fmt.format(share);
  }, [lang]);

  if (!open) return null;

  const categoryName = (id: string | null) =>
    (id !== null ? categoriesById.get(id)?.name : undefined) ??
    t("budget.spendingUncategorized");
  const typeName = (id: string | null) =>
    (id !== null ? typesById.get(id)?.name : undefined) ??
    t("budget.spendingUncategorized");
  const categoryColor = (id: string | null) =>
    (id !== null ? categoriesById.get(id)?.color : undefined) ?? "--muted";
  const typeColor = (id: string | null) =>
    (id !== null ? typesById.get(id)?.color : undefined) ?? "--muted";

  const formatMonth = (x: number) =>
    formatMonthYearShort(monthIndexToKey(x), lang);
  // Desktop renders the full grouped figure (the charts size their left
  // gutter to fit); mobile is too narrow for that, so the Y axis always
  // abbreviates with one forced decimal — without it nearby ticks
  // collapse to an identical "100K kr".
  const formatY = (y: number) =>
    withCurrency(
      formatNumber(
        y,
        isMobile ? { ...settings, showDecimals: true } : settings,
        isMobile ? { forceAbbreviate: true } : {},
      ),
      settings,
    );
  const formatAmountFull = (n: number) =>
    withCurrency(formatNumber(n, settings), settings);

  const barSeries: StackedBarChartSeries[] = monthly.categories.map((c) => ({
    id: c.categoryId ?? UNCATEGORIZED,
    label: categoryName(c.categoryId),
    color: categoryColor(c.categoryId),
    points: monthly.monthKeys.map((key, i) => ({
      x: monthKeyToIndex(key),
      y: c.totalsByMonth[i],
    })),
  }));

  const slices: DonutChartSlice[] = shares.map((share: SpendingShare) => ({
    id: share.id ?? UNCATEGORIZED,
    label: drill === null ? categoryName(share.id) : typeName(share.id),
    color: drill === null ? categoryColor(share.id) : typeColor(share.id),
    value: share.value,
  }));

  const drillInto = (sliceId: string) =>
    setDrill({ categoryId: sliceId === UNCATEGORIZED ? null : sliceId });

  const lineSeries: ChartSeries[] = [
    {
      id: "income",
      label: t("budget.spendingIncome"),
      colorVar: "--positive",
      points: incomeVsExpenses.map((p) => ({
        x: monthKeyToIndex(p.monthKey),
        y: p.income,
      })),
    },
    {
      id: "expenses",
      label: t("budget.spendingExpenses"),
      colorVar: "--negative",
      points: incomeVsExpenses.map((p) => ({
        x: monthKeyToIndex(p.monthKey),
        y: p.expenses,
      })),
    },
    {
      id: "net",
      label: t("budget.spendingNet"),
      colorVar: "--accent",
      points: incomeVsExpenses.map((p) => ({
        x: monthKeyToIndex(p.monthKey),
        y: p.net,
      })),
    },
  ];

  const maxMerchantTotal = topMerchants.reduce(
    (max, m) => Math.max(max, m.total),
    0,
  );

  const sectionHeading =
    "text-xs font-bold tracking-wider uppercase text-muted";
  const emptyBox =
    "rounded border border-line bg-surface-2 px-4 py-8 text-center text-sm text-muted";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="budget-spending-title"
      size="max-w-4xl"
    >
      <Modal.Header
        icon={<PieChart size={14} aria-hidden focusable={false} />}
        title={t("budget.visualizeSpending")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-6">
          {/* Trailing-window range row — mirrors LoansChartModal; the
              global reduce-motion rule zeroes the slide transition. */}
          <div
            role="group"
            aria-label={t("budget.spendingRangeAria")}
            className="relative flex rounded border border-line bg-surface-3 text-sm"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 rounded bg-surface transition-transform"
              style={{
                width: `${100 / PERIODS.length}%`,
                transform: `translateX(${PERIODS.findIndex((p) => p.value === period) * 100}%)`,
              }}
            />
            {PERIODS.map((p) => (
              <button
                key={String(p.value)}
                type="button"
                onClick={() => {
                  setPeriod(p.value);
                  setDrill(null);
                }}
                aria-pressed={period === p.value}
                className={`relative z-10 flex-1 cursor-pointer border-0 bg-transparent px-2 py-1 transition-colors ${
                  period === p.value
                    ? "text-accent"
                    : "text-muted hover:text-fg"
                }`}
              >
                {t(`budget.${p.labelKey}`)}
              </button>
            ))}
          </div>

          {facts.length === 0 ? (
            <div className={emptyBox}>{t("budget.spendingEmpty")}</div>
          ) : (
            <>
              {barSeries.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className={`m-0 ${sectionHeading}`}>
                    {t("budget.spendingByCategoryTitle")}
                  </h3>
                  <StackedBarChart
                    series={barSeries}
                    formatX={formatMonth}
                    formatY={formatY}
                    totalLabel={t("budget.spendingTotal")}
                    height={isMobile ? 220 : 280}
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {barSeries.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            background: s.color.startsWith("--")
                              ? `var(${s.color})`
                              : s.color,
                          }}
                        />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {(slices.length > 0 || drill !== null) && (
                <section className="flex flex-col gap-2">
                  <h3 className={`m-0 ${sectionHeading}`}>
                    {t("budget.spendingShareTitle")}
                    {drill !== null && (
                      <span className="ml-2 normal-case tracking-normal text-fg">
                        {categoryName(drill.categoryId)}
                      </span>
                    )}
                  </h3>
                  {drill !== null && (
                    <button
                      type="button"
                      onClick={() => setDrill(null)}
                      className="inline-flex w-fit cursor-pointer items-center gap-1 rounded border-0 bg-transparent p-0 text-xs text-link hover:underline"
                    >
                      <ChevronLeft size={14} aria-hidden focusable={false} />
                      {t("budget.spendingAllCategories")}
                    </button>
                  )}
                  {slices.length === 0 ? (
                    <div className={emptyBox}>{t("budget.spendingEmpty")}</div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
                      <div className="w-full max-w-xs shrink-0 md:w-64">
                        <DonutChart
                          slices={slices}
                          formatValue={formatY}
                          formatShare={formatPercent}
                          totalLabel={t("budget.spendingTotal")}
                          onSliceClick={drill === null ? drillInto : undefined}
                          height={isMobile ? 200 : 240}
                        />
                      </div>
                      <ul className="m-0 flex w-full list-none flex-col gap-0.5 p-0 text-sm">
                        {slices.map((slice, i) => {
                          const rowBody = (
                            <>
                              <span
                                aria-hidden
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  background: slice.color.startsWith("--")
                                    ? `var(${slice.color})`
                                    : slice.color,
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate text-left">
                                {slice.label}
                              </span>
                              <span className="tabular-nums">
                                {formatAmountFull(slice.value)}
                              </span>
                              <span className="w-12 text-right text-xs text-muted tabular-nums">
                                {formatPercent(shares[i]?.share ?? 0)}
                              </span>
                            </>
                          );
                          return (
                            <li key={slice.id}>
                              {drill === null ? (
                                <button
                                  type="button"
                                  onClick={() => drillInto(slice.id)}
                                  aria-label={t("budget.spendingDrillAria", {
                                    name: slice.label,
                                  })}
                                  className="flex w-full cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-1 text-fg hover:bg-surface-2"
                                >
                                  {rowBody}
                                </button>
                              ) : (
                                <div className="flex w-full items-center gap-2 px-2 py-1">
                                  {rowBody}
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {monthKeys.length >= 2 && (
                <section className="flex flex-col gap-2">
                  <h3 className={`m-0 ${sectionHeading}`}>
                    {t("budget.spendingIncomeVsExpensesTitle")}
                  </h3>
                  <LineChart
                    series={lineSeries}
                    formatX={formatMonth}
                    formatY={formatY}
                    height={isMobile ? 220 : 260}
                  />
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {lineSeries.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: `var(${s.colorVar})` }}
                        />
                        {s.label}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {topMerchants.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className={`m-0 ${sectionHeading}`}>
                    {t("budget.spendingTopMerchantsTitle")}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                    {topMerchants.map((merchant) => (
                      <li
                        key={merchant.companyId}
                        className="flex flex-col gap-1"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {companiesById.get(merchant.companyId)?.name}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatAmountFull(merchant.total)}
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-surface-2">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{
                              width: `${
                                maxMerchantTotal > 0
                                  ? (merchant.total / maxMerchantTotal) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </Modal.Body>
    </Modal>
  );
}
