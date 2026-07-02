import { useMemo, useRef, useState } from "react";
import { ChevronLeft, PieChart, Settings2 } from "lucide-react";

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
  Item,
  Row,
  Settings,
} from "../../data/types";
import {
  useIsMobile,
  useResetOnOpen,
  type FloatingPlacement,
} from "../../hooks";
import { bcp47 } from "../../i18n/locale";
import { useLang, useT } from "../../i18n";
import { indexById } from "../../utils/indexById";
import {
  formatMonthYearShort,
  formatNumber,
  withCurrency,
} from "../../utils/format";
import { FloatingPanel } from "../FloatingPanel";
import { Checkbox } from "../form";
import { Modal } from "../Modal";
import { DonutChart, type DonutChartSlice } from "../charts/DonutChart";
import { LineChart, type ChartSeries } from "../charts/LineChart";
import {
  StackedBarChart,
  type StackedBarChartSeries,
  type StackedBarSelection,
} from "../charts/StackedBarChart";
import { tintBorder, tintFill } from "../../utils/tint";

// "Visualize spending" for the budget sheet — a scrollable dashboard of
// how money actually moved: monthly spend stacked per category, a
// category donut (click a slice / legend row to drill into the entry
// types inside it), income vs expenses per month, and the top merchants
// for the window. Only rows representing real spending count — the
// completed ones plus imported bank history; transfers and balance
// corrections are excluded (see `isActualSpendingRow`). A trailing
// fiscal-month range row (3M / 6M / 12M / All) clips every section to
// the same window; a cogwheel dropdown to its right (shown only when
// the items catalog has something to spread) toggles "spread item
// costs", which de-spikes big purchases by re-allocating each linked
// item's cost evenly across its lifetime (see
// `SpendingInputs.spreadItemCosts`). The aggregation lives in the pure
// `src/data/budget/spending.ts` helpers; this modal only maps facts to
// themed, translated series and owns the period / options / drilldown
// state.
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
  // The owned-items catalog — consulted by the "spread item costs"
  // option to find each linked item's price and lifetime.
  items: readonly Item[];
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

// The cogwheel options panel anchors to its trigger at the modal's top
// right; growing leftward keeps it inside the viewport (the modal body
// scrolls, so viewport space like the in-modal pickers).
const OPTIONS_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 260 },
  anchor: "right",
  coordinateSpace: "viewport",
};

export function BudgetSpendingModal({
  open,
  onClose,
  rows,
  columns,
  types,
  categories,
  companies,
  items,
  settings,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isMobile = useIsMobile();

  const [period, setPeriod] = useState<SpendingPeriod>(DEFAULT_PERIOD);
  const [drill, setDrill] = useState<Drill>(null);
  const [spreadItemCosts, setSpreadItemCosts] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The pressed segment of the monthly bar chart (a category within one
  // month), or null. Highlights the bar section, turns the matching legend
  // entry into a filled pill, and surfaces the section's real amount.
  const [barSelection, setBarSelection] = useState<StackedBarSelection | null>(
    null,
  );
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  useResetOnOpen(open, undefined, () => {
    setPeriod(DEFAULT_PERIOD);
    setDrill(null);
    setSpreadItemCosts(false);
    setOptionsOpen(false);
    setBarSelection(null);
  });

  const typesById = useMemo(() => indexById(types), [types]);
  const categoriesById = useMemo(() => indexById(categories), [categories]);
  const companiesById = useMemo(() => indexById(companies), [companies]);
  const itemsById = useMemo(() => indexById(items), [items]);

  // The cogwheel only appears when toggling the option could change the
  // charts — i.e. at least one item carries both inputs the spread needs.
  const hasSpreadableItems = useMemo(
    () =>
      items.some(
        (item) =>
          item.lifetimeYears !== undefined &&
          item.lifetimeYears > 0 &&
          item.purchasePrice !== undefined &&
          item.purchasePrice > 0,
      ),
    [items],
  );

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
        itemsById,
        spreadItemCosts: spreadItemCosts && hasSpreadableItems,
      }),
    [
      rows,
      columns,
      typesById,
      settings.startOfMonth,
      currentMonthKey,
      period,
      itemsById,
      spreadItemCosts,
      hasSpreadableItems,
    ],
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

  // Resolve a stored colour (a "--token" or a hex) to a CSS colour string.
  const cssColor = (color: string) =>
    color.startsWith("--") ? `var(${color})` : color;

  const barSeries: StackedBarChartSeries[] = monthly.categories.map((c) => ({
    id: c.categoryId ?? UNCATEGORIZED,
    label: categoryName(c.categoryId),
    color: categoryColor(c.categoryId),
    points: monthly.monthKeys.map((key, i) => ({
      x: monthKeyToIndex(key),
      y: c.totalsByMonth[i],
    })),
  }));

  // Total spending across every category and month in the window — the
  // denominator for a whole-category selection's share.
  const barGrandTotal = barSeries.reduce(
    (sum, b) => sum + b.points.reduce((s, p) => s + Math.max(0, p.y), 0),
    0,
  );

  // The active selection resolved to its category, value, and share. Two
  // shapes feed one highlight: pressing a single bar section
  // (`barSelection.x` set) pins to that month — value is the section's real
  // amount and the caption reads it against that month's bar; clicking a
  // legend entry (`barSelection.x` omitted) selects the whole category —
  // value is its total across the window and the caption reads it against
  // total spending.
  const selectedSection = (() => {
    if (!barSelection) return null;
    const s = barSeries.find((b) => b.id === barSelection.seriesId);
    if (!s) return null;
    if (barSelection.x === undefined) {
      const value = s.points.reduce((sum, p) => sum + Math.max(0, p.y), 0);
      if (value <= 0) return null;
      return {
        mode: "category" as const,
        seriesId: s.id,
        label: s.label,
        color: s.color,
        value,
        share: barGrandTotal > 0 ? value / barGrandTotal : 0,
      };
    }
    const point = s.points.find((p) => p.x === barSelection.x);
    if (!point || point.y <= 0) return null;
    const monthTotal = barSeries.reduce(
      (sum, b) => sum + (b.points.find((p) => p.x === barSelection.x)?.y ?? 0),
      0,
    );
    return {
      mode: "section" as const,
      seriesId: s.id,
      label: s.label,
      color: s.color,
      value: point.y,
      monthTotal,
      share: monthTotal > 0 ? point.y / monthTotal : 0,
      month: formatMonth(barSelection.x),
    };
  })();

  // Toggle a whole-category highlight from a legend entry: clear it if this
  // category is already the active category selection, otherwise select it.
  const toggleCategorySelection = (seriesId: string) =>
    setBarSelection((cur) =>
      cur && cur.seriesId === seriesId && cur.x === undefined
        ? null
        : { seriesId },
    );

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
              global reduce-motion rule zeroes the slide transition. The
              cogwheel to its right holds chart options (item-cost
              spreading) and only renders when there is something to
              spread. */}
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label={t("budget.spendingRangeAria")}
              className="relative flex flex-1 rounded border border-line bg-surface-3 text-sm"
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
                    setBarSelection(null);
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
            {hasSpreadableItems && (
              <>
                <button
                  ref={optionsTriggerRef}
                  type="button"
                  onClick={() => setOptionsOpen((v) => !v)}
                  aria-haspopup="true"
                  aria-expanded={optionsOpen}
                  aria-label={t("budget.spendingOptionsAria")}
                  title={t("budget.spendingOptionsAria")}
                  className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-surface-3 p-1.5 hover:text-fg ${
                    spreadItemCosts ? "text-accent" : "text-muted"
                  }`}
                >
                  <Settings2 size={16} aria-hidden focusable={false} />
                </button>
                <FloatingPanel
                  open={optionsOpen}
                  onClose={() => setOptionsOpen(false)}
                  triggerRef={optionsTriggerRef}
                  placement={OPTIONS_PLACEMENT}
                >
                  <div className="p-3">
                    <Checkbox
                      checked={spreadItemCosts}
                      onChange={(next) => {
                        setSpreadItemCosts(next);
                        setBarSelection(null);
                      }}
                      label={t("budget.spendingSpreadItemCosts")}
                      description={t("budget.spendingSpreadItemCostsHint")}
                    />
                  </div>
                </FloatingPanel>
              </>
            )}
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
                    selected={barSelection}
                    onSelect={setBarSelection}
                  />
                  {/* Legend doubles as a control: clicking an entry highlights
                      that whole category across every month, the same
                      selection pressing a single bar section produces (pinned
                      to one month). */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
                    {barSeries.map((s) => {
                      const isSelected = selectedSection?.seriesId === s.id;
                      if (isSelected && selectedSection) {
                        // The selected category, as a filled pill in its own
                        // colour, trailing the selection's amount.
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleCategorySelection(s.id)}
                            aria-pressed
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium"
                            style={{
                              backgroundColor: tintFill(cssColor(s.color)),
                              borderColor: tintBorder(cssColor(s.color)),
                              color: cssColor(s.color),
                            }}
                          >
                            <span className="truncate">{s.label}</span>
                            <span className="tabular-nums">
                              {formatAmountFull(selectedSection.value)}
                            </span>
                          </button>
                        );
                      }
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleCategorySelection(s.id)}
                          aria-pressed={false}
                          aria-label={t("budget.spendingSelectCategoryAria", {
                            name: s.label,
                          })}
                          className={`inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-muted hover:text-fg ${
                            selectedSection ? "opacity-45" : ""
                          }`}
                        >
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: cssColor(s.color) }}
                          />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {selectedSection && (
                    <p className="m-0 text-xs text-muted">
                      {selectedSection.mode === "section"
                        ? t("budget.spendingSectionShare", {
                            percent: formatPercent(selectedSection.share),
                            month: selectedSection.month,
                            total: formatAmountFull(selectedSection.monthTotal),
                          })
                        : t("budget.spendingCategoryShare", {
                            percent: formatPercent(selectedSection.share),
                            total: formatAmountFull(barGrandTotal),
                          })}
                    </p>
                  )}
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
