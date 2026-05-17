import { useEffect, useMemo, useRef } from "react";

import {
  computeBalances,
  currentFiscalMonthKey,
  findColumnByType,
  fiscalMonthSeedIso,
  groupRowsByMonth,
  sortMonthKeys,
  sortRowsByDate,
} from "../data/sheet";
import type {
  AccountBudget,
  Category,
  CellValue,
  Row,
  Settings,
  Sheet,
} from "../data/types";
import {
  formatAmountForInput,
  formatBalance,
  withCurrency,
} from "../utils/format";
import { MonthTable } from "./MonthTable";

type Props = {
  sheet: Sheet;
  // The AccountBudget block to render. Currently the only SheetItem
  // variant, so a single block is always shown — pulled out as its own
  // prop so a future multi-block view drops in by mapping over
  // `sheet.items` and rendering one component per variant.
  item: AccountBudget;
  categories: Category[];
  settings: Settings;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  // Monotonic counter from the parent. Each tick triggers a one-shot
  // scroll to today's row (or the current fiscal month container if no
  // row falls on today). Initial value 0 is a no-op so the parent can
  // mount us without immediately overriding the first-mount auto-scroll.
  scrollToTodayTick: number;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (date: string) => void;
  onAddComplex: (date: string) => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SheetView({
  sheet,
  item,
  categories,
  settings,
  selectMode,
  selectedIds,
  scrollToTodayTick,
  onUpdateCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onCreateCategory,
}: Props) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const dateCol = useMemo(
    () => findColumnByType(item.columns, "date"),
    [item.columns],
  );

  const balances = useMemo(() => computeBalances(item), [item]);

  // Each month renders as its own CSS grid, so amount/balance columns
  // sized with `max-content` end up different widths per month. Compute
  // the longest formatted value across the whole block here and pass it
  // down so every month aligns on the same column widths.
  const colWidths = useMemo(() => {
    const amountCol = findColumnByType(item.columns, "amount");
    const balanceCol = findColumnByType(item.columns, "balance");
    let amountChars = 0;
    let balanceChars = 0;
    if (amountCol) {
      for (const row of item.rows) {
        const v = row.cells[amountCol.id];
        if (typeof v !== "number") continue;
        const body = formatAmountForInput(Math.abs(v), settings);
        const full = withCurrency(body, settings);
        if (full.length > amountChars) amountChars = full.length;
      }
    }
    if (balanceCol) {
      for (const b of balances.values()) {
        const text = formatBalance(b, settings);
        if (text.length > balanceChars) balanceChars = text.length;
      }
    }
    return { amountChars, balanceChars };
  }, [item.rows, item.columns, balances, settings]);

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(item.rows, dateCol.id, settings.startOfMonth);
  }, [item.rows, dateCol, settings.startOfMonth]);

  const currentMonth = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  const today = todayIso();

  const visibleMonths = useMemo(() => {
    const keys = new Set(monthGroups.keys());
    keys.add(currentMonth);
    return sortMonthKeys(keys);
  }, [monthGroups, currentMonth]);

  // Scroll the current fiscal month into view on first mount and any time
  // the user changes `startOfMonth` (which shifts which month "current"
  // resolves to). The ref guards against re-running after the user has
  // scrolled away on their own — we only auto-scroll for sheet+month
  // identity changes, not on every render.
  const scrollTargetRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${sheet.id}:${currentMonth}`;
    if (lastScrolledKey.current === key) return;
    lastScrolledKey.current = key;
    // Defer to the next frame so layout has settled (tables render
    // synchronously but the sticky month headers establish their height
    // on commit, which can offset the calculated scroll position).
    requestAnimationFrame(() => {
      scrollTargetRef.current?.scrollIntoView({
        behavior: "auto",
        block: "start",
      });
    });
  }, [sheet.id, currentMonth]);

  // User-triggered scroll-to-today (parent bumps the tick when the
  // budget icon/title is pressed). Initial 0 is skipped so the first
  // mount only fires the auto-scroll above. Prefers a row that lands
  // exactly on today's ISO; falls back to the current fiscal month
  // container when today has no entry yet.
  useEffect(() => {
    if (scrollToTodayTick === 0) return;
    requestAnimationFrame(() => {
      const row = sectionRef.current?.querySelector<HTMLElement>(
        `[data-row-date="${today}"]`,
      );
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      scrollTargetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [scrollToTodayTick, today]);

  return (
    <section ref={sectionRef}>
      <header className="mb-4 flex items-center gap-2">
        <h2 className="m-0 text-base font-bold text-fg-bright">{sheet.name}</h2>
      </header>
      <div className="flex flex-col gap-3 md:gap-6">
        {visibleMonths.map((monthKey) => {
          const monthRows = dateCol
            ? sortRowsByDate(monthGroups.get(monthKey) ?? [], dateCol.id)
            : [];
          const isCurrent = monthKey === currentMonth;
          const seedDate =
            monthKey === "undated"
              ? ""
              : isCurrent
                ? today
                : fiscalMonthSeedIso(monthKey, settings.startOfMonth);
          return (
            <div
              key={monthKey}
              ref={isCurrent ? scrollTargetRef : null}
              data-month-key={monthKey}
            >
              <MonthTable
                monthKey={monthKey}
                rows={monthRows}
                columns={item.columns}
                balances={balances}
                categories={categories}
                settings={settings}
                selectMode={selectMode}
                selectedIds={selectedIds}
                amountChars={colWidths.amountChars}
                balanceChars={colWidths.balanceChars}
                onUpdateCell={onUpdateCell}
                onAddRow={() => onAddRow(seedDate)}
                onAddComplex={() => onAddComplex(seedDate)}
                onDeleteRequest={onDeleteRequest}
                onEditRequest={onEditRequest}
                onReorderColumns={onReorderColumns}
                onToggleSelect={onToggleSelect}
                onToggleSelectMonth={onToggleSelectMonth}
                onCreateCategory={onCreateCategory}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
