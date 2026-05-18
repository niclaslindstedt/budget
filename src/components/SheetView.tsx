import { useEffect, useMemo, useRef, useState } from "react";

import {
  computeBalances,
  currentFiscalMonthKey,
  findColumnByType,
  fiscalMonthSeedIso,
  groupRowsByMonth,
  previousMonthKey,
  sortMonthKeys,
  sortRowsByDate,
  synthesizeHistoryRow,
  synthesizeTransactionRow,
  transactionsForAccount,
} from "../data/sheet";
import type {
  Account,
  AccountBudget,
  Category,
  CellValue,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Settings,
  Sheet,
  Transaction,
} from "../data/types";
import { formatNumber, formatBalance, withCurrency } from "../utils/format";
import { ActiveRowProvider } from "./ActiveRowProvider";
import { MonthTable } from "./MonthTable";

type Props = {
  sheet: Sheet;
  // The AccountBudget block to render. Currently the only SheetItem
  // variant, so a single block is always shown — pulled out as its own
  // prop so a future multi-block view drops in by mapping over
  // `sheet.items` and rendering one component per variant.
  item: AccountBudget;
  categories: Category[];
  types: readonly EntryType[];
  // All accounts in the workspace. Needed so the view can look up the
  // peer account name when synthesizing a transaction row, and so the
  // running balance can mirror what the Accounts dashboard shows.
  accounts: Account[];
  // Seeds the running balance for the budget. Reads `openingBalance`
  // on the budget's account so the per-row balance column lines up
  // with what the bank says after a history import. Optional and
  // defaults to 0.
  openingBalance?: number;
  // Every cross-account transaction in the workspace. The view filters
  // to the ones involving `item.accountId` and interleaves them into
  // the rows displayed in each month.
  transactions: Transaction[];
  // Imported bank-statement entries for `item.accountId`. Projected
  // into the budget view as read-only rows that the user can promote
  // to recurring later. Defaults to an empty array on accounts that
  // have never been seeded from a statement.
  history: readonly HistoryEntry[];
  // Merchant-hint store. When a history entry's normalised
  // description matches a hint, the synthesized row picks up the
  // hint's category, typeId, and user-typed description so past
  // entries display under the user's label.
  merchantHints: Readonly<Record<string, MerchantHint>>;
  // User-authored wildcard match rules. Layered on top of merchant
  // hints — a rule that matches an entry's raw description overrides
  // the hint's labels on the synthesized row.
  matchRules: readonly MatchRule[];
  settings: Settings;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  // Monotonic counter from the parent. Each tick triggers a one-shot
  // scroll to today's row (or the current fiscal month container if no
  // row falls on today). Initial value 0 is a no-op so the parent can
  // mount us without immediately overriding the first-mount auto-scroll.
  scrollToTodayTick: number;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (date: string) => void;
  onAddComplex: (date: string) => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onTransactionRequest: (row: Row) => void;
  onMatchRuleRequest: (row: Row) => void;
  onCorrectionDeleteRequest: (row: Row) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// History pagination: the view starts with the current fiscal month plus
// one previous month, and "Show more" reveals three additional months
// each click. Older months stay grouped behind the button so a long
// statement history doesn't bury the months the user actually edits.
const DEFAULT_HISTORY_MONTHS = 1;
const HISTORY_PAGE_SIZE = 3;

export function SheetView({
  sheet,
  item,
  categories,
  types,
  accounts,
  transactions,
  history,
  merchantHints,
  matchRules,
  openingBalance = 0,
  settings,
  selectMode,
  selectedIds,
  scrollToTodayTick,
  onUpdateCell,
  onCommitCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onTransactionRequest,
  onMatchRuleRequest,
  onCorrectionDeleteRequest,
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

  // Interleave synthesized transaction rows alongside the budget's own
  // rows so month grouping, running balance, and sort-by-date pick them
  // up without further special-casing. Only the transactions involving
  // this budget's account contribute. When the budget has no account
  // attached, no synthesis happens — there is no "this account" to
  // place the transactions against.
  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);
  const transactionRows = useMemo(() => {
    if (!item.accountId) return [] as Row[];
    const accountTxs = transactionsForAccount(transactions, item.accountId);
    return accountTxs.map((tx) =>
      synthesizeTransactionRow(
        tx,
        item.accountId as string,
        item.columns,
        accountsById,
      ),
    );
  }, [item.accountId, item.columns, transactions, accountsById]);

  // Project imported bank-statement entries the same way transactions
  // are projected: synthesized read-only rows the month grouping and
  // running balance handle uniformly. Hidden entries (user-shelved
  // noise) are filtered out so they don't clutter the budget view.
  const historyRows = useMemo(() => {
    if (!item.accountId) return [] as Row[];
    return history
      .filter((e) => !e.hidden)
      .map((e) =>
        synthesizeHistoryRow(e, item.columns, merchantHints, matchRules),
      );
  }, [item.accountId, item.columns, history, merchantHints, matchRules]);

  const mergedItem = useMemo<AccountBudget>(
    () => ({
      ...item,
      rows: [...item.rows, ...transactionRows, ...historyRows],
    }),
    [item, transactionRows, historyRows],
  );

  const balances = useMemo(
    () => computeBalances(mergedItem, openingBalance),
    [mergedItem, openingBalance],
  );

  // Each month renders as its own CSS grid, so amount/balance columns
  // sized with `max-content` end up different widths per month. Compute
  // the longest formatted value across the whole block here and pass it
  // down so every month aligns on the same column widths.
  const colWidths = useMemo(() => {
    const amountCol = findColumnByType(mergedItem.columns, "amount");
    const balanceCol = findColumnByType(mergedItem.columns, "balance");
    let amountChars = 0;
    let balanceChars = 0;
    if (amountCol) {
      for (const row of mergedItem.rows) {
        const v = row.cells[amountCol.id];
        if (typeof v !== "number") continue;
        const body = formatNumber(Math.abs(v), settings);
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
  }, [mergedItem.rows, mergedItem.columns, balances, settings]);

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(mergedItem.rows, dateCol.id, settings.startOfMonth);
  }, [mergedItem.rows, dateCol, settings.startOfMonth]);

  const currentMonth = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  const today = todayIso();

  // Number of extra historical months past the default 1-month window
  // the user has opted into via "Show more". Resets when the active
  // sheet changes so switching budgets starts each one collapsed.
  const [extraHistory, setExtraHistory] = useState(0);
  useEffect(() => {
    setExtraHistory(0);
  }, [sheet.id]);

  const oldestVisibleMonth = useMemo(() => {
    let key = currentMonth;
    for (let i = 0; i < DEFAULT_HISTORY_MONTHS + extraHistory; i += 1) {
      key = previousMonthKey(key);
    }
    return key;
  }, [currentMonth, extraHistory]);

  const visibleMonths = useMemo(() => {
    const keys = new Set<string>();
    // Always render the current fiscal month plus the configured
    // window of past months, even when those buckets have no rows
    // yet — the AddRowButton inside each table is how the user adds
    // entries to a fresh month.
    let cursor = currentMonth;
    keys.add(cursor);
    for (let i = 0; i < DEFAULT_HISTORY_MONTHS + extraHistory; i += 1) {
      cursor = previousMonthKey(cursor);
      keys.add(cursor);
    }
    // Months with rows that aren't reached by stepping back from
    // current — future-dated entries and the special "undated"
    // bucket — stay visible. Past months older than the window stay
    // hidden behind the "Show more" button.
    for (const key of monthGroups.keys()) {
      if (key === "undated") {
        keys.add(key);
        continue;
      }
      if (key >= cursor) keys.add(key);
    }
    return sortMonthKeys(keys);
  }, [monthGroups, currentMonth, extraHistory]);

  const hasMoreHistory = useMemo(() => {
    for (const key of monthGroups.keys()) {
      if (key === "undated") continue;
      if (key < oldestVisibleMonth) return true;
    }
    return false;
  }, [monthGroups, oldestVisibleMonth]);

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
    <ActiveRowProvider>
      <section ref={sectionRef} data-sheet-content>
        <header className="mb-4 flex items-center gap-2">
          <h2 className="m-0 text-base font-bold text-fg-bright">
            {sheet.name}
          </h2>
        </header>
        <div className="flex flex-col gap-3 md:gap-6">
          {hasMoreHistory && (
            <button
              type="button"
              onClick={() => setExtraHistory((n) => n + HISTORY_PAGE_SIZE)}
              className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-xs text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span aria-hidden className="h-px flex-1 bg-line" />
              <span className="whitespace-nowrap">
                Show {HISTORY_PAGE_SIZE} earlier months
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </button>
          )}
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
                  columns={mergedItem.columns}
                  balances={balances}
                  categories={categories}
                  types={types}
                  settings={settings}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  canTransfer={item.accountId !== null}
                  amountChars={colWidths.amountChars}
                  balanceChars={colWidths.balanceChars}
                  onUpdateCell={onUpdateCell}
                  onCommitCell={onCommitCell}
                  onAddRow={() => onAddRow(seedDate)}
                  onAddComplex={() => onAddComplex(seedDate)}
                  onDeleteRequest={onDeleteRequest}
                  onEditRequest={onEditRequest}
                  onTransactionRequest={onTransactionRequest}
                  onMatchRuleRequest={onMatchRuleRequest}
                  onCorrectionDeleteRequest={onCorrectionDeleteRequest}
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
    </ActiveRowProvider>
  );
}
