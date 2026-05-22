import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Eye, Pencil } from "lucide-react";

import {
  buildVisibleRows,
  computeBalances,
  currentFiscalMonthKey,
  findColumnByType,
  fiscalMonthSeedIso,
  getMonthKey,
  groupRowsByMonth,
  previousMonthKey,
  sortMonthKeys,
  sortRowsByDate,
  type RowSortContext,
} from "../data/sheet";
import { coveredMonths } from "../data/coverage";
import { resolveEffectiveAmounts } from "../data/formula-resolve";
import { useT } from "../i18n";
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
  UserData,
} from "../data/types";
import { formatNumber, withCurrency } from "../utils/format";
import { ActiveRowProvider } from "./ActiveRowProvider";
import { MonthTable } from "./MonthTable";
import { SheetViewerModal } from "./SheetViewerModal";

type Props = {
  sheet: Sheet;
  // The AccountBudget block to render. Currently the only SheetItem
  // variant, so a single block is always shown — pulled out as its own
  // prop so a future multi-block view drops in by mapping over
  // `sheet.items` and rendering one component per variant.
  item: AccountBudget;
  types: readonly EntryType[];
  // Categories (user + preset, merged) — threaded through to the
  // `type` column's picker for the inline creator and the tiered
  // category → type browse. Required because every new EntryType
  // belongs to a category.
  categories: readonly Category[];
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
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
  // One-shot scroll-to-row request issued by the transaction-search
  // modal when the user picks a result. The `tick` field is bumped on
  // every new request so the effect re-fires even if the same row is
  // picked twice in a row. `null` is the idle state. The view only
  // acts when `request.sheetId === sheet.id` so requests for other
  // sheets are ignored (the parent handles the sheet switch first;
  // the new SheetView mounts and picks up the request via prop). `iso`
  // is the target row's ISO date — used to expand `extraHistory` so the
  // target row is included in `visibleMonths` even when it sits older
  // than the default history window. Empty string for undated rows.
  scrollToRowRequest: {
    sheetId: string;
    rowId: string;
    iso: string;
    tick: number;
  } | null;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: (date: string) => void;
  onAddComplex: (date: string) => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onEditRowRequest: (row: Row) => void;
  onSplitRequest: (row: Row) => void;
  onTransactionRequest: (row: Row) => void;
  // Flip the per-row `isTransfer` flag on a budget row. Used by the
  // eye-toggle action button to mark or unmark a one-off entry as an
  // inter-account transfer so the `hideTransfers` setting can suppress
  // it without converting it into a full Transaction.
  onToggleRowTransfer: (row: Row) => void;
  onMatchRuleRequest: (row: Row) => void;
  onEditHistoryRequest: (row: Row) => void;
  onCopyRequest: (row: Row) => void;
  onCorrectionDeleteRequest: (row: Row) => void;
  // Inline per-cell write for a synthesized history row. Routed by
  // `SheetView` when the user edits the description or type cell on a
  // history row — `onUpdateCell` would no-op on the underlying
  // `UserData.history` map, so the cell handler dispatches this
  // instead, with the active `accountId` already attached.
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: { userDescription?: string; userTypeId?: string | null },
  ) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
  onEditSheet: (sheetId: string) => void;
  onDownloadSheet: (sheetId: string) => void;
  // Full workspace state — needed by the formula resolver so
  // `sheet("<id>", <variable>)` references can look up other sheets'
  // running balances at this row's month.
  data: UserData;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// When no row falls on today, prefer the first row dated on or after
// today — that keeps today's position at the top of the viewport with
// upcoming entries below it. When every dated row is in the past (today
// sits beyond the latest entry), fall back to the most recent past row
// so the user lands at the end of their data instead of at the start of
// the current fiscal month, which can be weeks behind today.
function findRowNearestToday(
  section: HTMLElement | null,
  today: string,
): HTMLElement | null {
  if (!section) return null;
  const candidates = section.querySelectorAll<HTMLElement>("[data-row-date]");
  let lastPast: HTMLElement | null = null;
  for (const el of candidates) {
    const d = el.getAttribute("data-row-date");
    if (!d) continue;
    if (d >= today) return el;
    lastPast = el;
  }
  return lastPast;
}

// Scroll a row to the top of the viewport, accounting for the three
// stacked sticky bands above it (app header → month header → column
// header thead). `scrollIntoView({ block: "start" })` would land the
// row underneath all three; offsetting by their combined height pulls
// it just below them so today's date is the first thing the user sees.
function scrollRowToTop(row: HTMLElement, behavior: ScrollBehavior) {
  const thead = row.closest("table")?.querySelector("thead");
  const theadH = thead?.getBoundingClientRect().height ?? 0;
  const rootStyle = getComputedStyle(document.documentElement);
  const appH = parseFloat(rootStyle.getPropertyValue("--app-header-h")) || 0;
  const monthH =
    parseFloat(rootStyle.getPropertyValue("--month-header-h")) || 0;
  const top =
    row.getBoundingClientRect().top + window.scrollY - appH - monthH - theadH;
  window.scrollTo({ top: Math.max(0, top), behavior });
}

// History pagination: the view starts with the current fiscal month plus
// one previous month, and "Show more" reveals three additional months
// each click. Older months stay grouped behind the button so a long
// statement history doesn't bury the months the user actually edits.
const DEFAULT_HISTORY_MONTHS = 1;
const HISTORY_PAGE_SIZE = 3;

// Module-level stable empty array. Used as the fallback rows reference
// for months with no entries so MonthTable's React.memo sees the same
// reference across renders instead of a fresh `[]` each time.
const EMPTY_ROWS: Row[] = [];

export function SheetView({
  sheet,
  item,
  types,
  categories,
  onCreateType,
  onCreateCategory,
  accounts,
  transactions,
  history,
  merchantHints,
  matchRules,
  openingBalance = 0,
  settings,
  selectMode,
  selectedIds,
  scrollToRowRequest,
  onUpdateCell,
  onCommitCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onEditRowRequest,
  onSplitRequest,
  onTransactionRequest,
  onToggleRowTransfer,
  onMatchRuleRequest,
  onEditHistoryRequest,
  onCopyRequest,
  onCorrectionDeleteRequest,
  onUpdateHistoryEntry,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onEditSheet,
  onDownloadSheet,
  data,
}: Props) {
  const t = useT();
  const sectionRef = useRef<HTMLElement | null>(null);
  const dateCol = useMemo(
    () => findColumnByType(item.columns, "date"),
    [item.columns],
  );
  // Built once per (columns, types) tick so every sort within this
  // render — month-grouped display order, computeBalances, the formula
  // engine's running-balance lookup — agrees on income/category/amount
  // ordering. Without a shared context the running balance column
  // would drift from the visible row order on dates with multiple
  // entries.
  const sortContext = useMemo<RowSortContext | undefined>(() => {
    const descCol = findColumnByType(item.columns, "description");
    const amountCol = findColumnByType(item.columns, "amount");
    if (!descCol || !amountCol) return undefined;
    const typesById = new Map<string, EntryType>();
    for (const t of types) typesById.set(t.id, t);
    return {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById,
    };
  }, [item.columns, types]);

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
  const mergedItem = useMemo<AccountBudget>(
    () => ({
      ...item,
      rows: buildVisibleRows(
        item,
        transactions,
        history,
        accountsById,
        merchantHints,
        matchRules,
      ),
    }),
    [item, transactions, history, accountsById, merchantHints, matchRules],
  );

  // Each imported bank entry's stored balance is the truth: it pins
  // the running total at that row so an off-by-one opening balance
  // or a hand-edited authored row can't drag the column away from
  // what the bank says. Credit-card exports (no per-row balance) and
  // hidden entries fall through to the amount-based computation.
  // Split entries pin the balance at the LAST split row (after all
  // pieces have applied) so the on-screen total matches what the
  // bank reported for the original entry.
  const balanceOverrides = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of history) {
      if (e.hidden) continue;
      if (e.balance === undefined) continue;
      const anchorId =
        e.splits && e.splits.length > 0
          ? `hist:${e.id}:${e.splits.length - 1}`
          : `hist:${e.id}`;
      m.set(anchorId, e.balance);
    }
    return m;
  }, [history]);

  // Calendar months fully covered by imported history. Computed once
  // per render; passed down so each `MonthTable` can hide its
  // `+ Add row` footer.
  const coveredSet = useMemo(
    () => coveredMonths(history, item.rows, item.columns),
    [history, item.rows, item.columns],
  );

  // Evaluate every formula row's amount against the merged view (so
  // synthesized transactions and history rows count toward
  // `endOfMonthBalance`, `income`, etc.) — then mirror the resolved
  // value into each formula row's amount cell so the existing
  // MonthTable / Cell rendering chain shows the evaluated number
  // without any per-component plumbing. The same map is fed into
  // `computeBalances` so the running balance column lines up.
  const { effectiveAmounts, decoratedItem } = useMemo(() => {
    const resolved = resolveEffectiveAmounts(
      mergedItem,
      openingBalance,
      data,
      settings.startOfMonth,
    );
    const amountCol = findColumnByType(mergedItem.columns, "amount");
    if (!amountCol) {
      return { effectiveAmounts: resolved.amounts, decoratedItem: mergedItem };
    }
    const decoratedRows = mergedItem.rows.map((row) => {
      if (!row.amountFormula) return row;
      const v = resolved.amounts.get(row.id) ?? 0;
      return { ...row, cells: { ...row.cells, [amountCol.id]: v } };
    });
    return {
      effectiveAmounts: resolved.amounts,
      decoratedItem: { ...mergedItem, rows: decoratedRows },
    };
  }, [mergedItem, openingBalance, data, settings.startOfMonth]);

  const balances = useMemo(
    () =>
      computeBalances(
        decoratedItem,
        openingBalance,
        effectiveAmounts,
        balanceOverrides,
        sortContext,
      ),
    [
      decoratedItem,
      openingBalance,
      effectiveAmounts,
      balanceOverrides,
      sortContext,
    ],
  );

  // History rows are synthesized — their cells don't exist in
  // `item.rows[]`, so the generic `onUpdateCell` reducer would no-op.
  // Intercept writes to history rows here and route description /
  // type edits to `onUpdateHistoryEntry` instead so the override
  // lands on the underlying `HistoryEntry`. Other columns are
  // bank-authoritative and ignored. `onCommitCell` already
  // short-circuits for synthesized rows (no `seriesId`), so it
  // doesn't need a parallel intercept.
  const accountId = item.accountId;
  const handleUpdateCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      if (!rowId.startsWith("hist:") || !accountId) {
        onUpdateCell(rowId, columnId, value);
        return;
      }
      const entryId = rowId.slice("hist:".length);
      const col = decoratedItem.columns.find((c) => c.id === columnId);
      if (col?.type === "description") {
        onUpdateHistoryEntry(accountId, entryId, {
          userDescription: typeof value === "string" ? value : "",
        });
        return;
      }
      if (col?.type === "type") {
        onUpdateHistoryEntry(accountId, entryId, {
          userTypeId: typeof value === "string" && value !== "" ? value : null,
        });
      }
    },
    [accountId, decoratedItem.columns, onUpdateCell, onUpdateHistoryEntry],
  );

  // Each month renders as its own CSS grid, so amount/balance columns
  // sized with `max-content` end up different widths per month. Compute
  // the longest formatted value across the whole block here and pass it
  // down so every month aligns on the same column widths.
  const colWidths = useMemo(() => {
    const amountCol = findColumnByType(decoratedItem.columns, "amount");
    const balanceCol = findColumnByType(decoratedItem.columns, "balance");
    let amountChars = 0;
    let balanceChars = 0;
    if (amountCol) {
      for (const row of decoratedItem.rows) {
        const v = row.cells[amountCol.id];
        if (typeof v !== "number") continue;
        const body = formatNumber(Math.abs(v), settings);
        const full = withCurrency(body, settings);
        if (full.length > amountChars) amountChars = full.length;
      }
    }
    if (balanceCol) {
      for (const b of balances.values()) {
        const body = formatNumber(Math.abs(b), settings, {
          alwaysTwoFractionDigits: true,
          alwaysAbbreviate: settings.alwaysAbbreviateBalance,
        });
        const full = withCurrency(body, settings);
        if (full.length > balanceChars) balanceChars = full.length;
      }
    }
    return { amountChars, balanceChars };
  }, [decoratedItem.rows, decoratedItem.columns, balances, settings]);

  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(
      decoratedItem.rows,
      dateCol.id,
      settings.startOfMonth,
    );
  }, [decoratedItem.rows, dateCol, settings.startOfMonth]);

  // Pre-sort each month's rows once per data change. Sorting inline in
  // the render path (one .sort() call per visible month) cost ~O(N log
  // N) on every parent re-render and produced a fresh array reference
  // each time — defeating React.memo on MonthTable. The memoized map
  // lets each MonthTable receive a stable rows array, so memo's shallow
  // compare can skip the months that didn't change.
  const sortedMonthGroups = useMemo(() => {
    if (!dateCol) return monthGroups;
    const out = new Map<string, Row[]>();
    for (const [key, rows] of monthGroups) {
      out.set(key, sortRowsByDate(rows, dateCol.id, sortContext));
    }
    return out;
  }, [monthGroups, dateCol, sortContext]);

  const currentMonth = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  // `todayIso()` returns a fresh string each call, but the value only
  // changes at midnight. Memoize so closures derived from it (the
  // current-month seed date threaded into MonthTable) keep stable
  // references across renders.
  const today = useMemo(() => todayIso(), []);

  // Read-only viewer modal, opened from the Eye button next to the
  // sheet title. Local state — closing wipes it, no need to persist.
  const [viewerOpen, setViewerOpen] = useState(false);

  // Number of extra historical months past the default 1-month window
  // the user has opted into via "Show more". Resets when the active
  // sheet changes so switching budgets starts each one collapsed.
  const [extraHistory, setExtraHistory] = useState(0);
  useEffect(() => {
    setExtraHistory(0);
  }, [sheet.id]);

  // Per-month collapsed state. Local to the component so it stays
  // session-only — collapsing a month is a quick navigation aid, not a
  // persistent preference. Resets when the active sheet changes.
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    setCollapsedMonths(new Set());
  }, [sheet.id]);
  const toggleCollapsed = useCallback((monthKey: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }, []);

  // Per-row expansion state for the "show hidden transfers" affordance
  // on balance cells. Keyed by the *anchor* row id (the visible row
  // whose balance icon was clicked) so each balance step controls its
  // own reveal. Session-only — closing and re-opening the sheet
  // collapses every expansion. Resets when the active sheet changes.
  const [expandedTransferAnchors, setExpandedTransferAnchors] = useState<
    Set<string>
  >(() => new Set());
  useEffect(() => {
    setExpandedTransferAnchors(new Set());
  }, [sheet.id]);
  const toggleTransferAnchor = useCallback((rowId: string) => {
    setExpandedTransferAnchors((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);
  // When the hide-transfers setting flips off, the expansion state has
  // nothing to act on; clear it so re-enabling later starts clean.
  useEffect(() => {
    if (!settings.hideTransfers) setExpandedTransferAnchors(new Set());
  }, [settings.hideTransfers]);

  const oldestVisibleMonth = useMemo(() => {
    let key = currentMonth;
    for (let i = 0; i < DEFAULT_HISTORY_MONTHS + extraHistory; i += 1) {
      key = previousMonthKey(key);
    }
    return key;
  }, [currentMonth, extraHistory]);

  const visibleMonths = useMemo(() => {
    const keys = new Set<string>();
    // Always render the current fiscal month — even when empty, the
    // AddRowButton inside it is how the user adds the first entry.
    // Past months in the default-history window only appear when they
    // contain rows, so a freshly created budget shows a single empty
    // current month instead of a stack of empty placeholders.
    let cursor = currentMonth;
    keys.add(cursor);
    for (let i = 0; i < DEFAULT_HISTORY_MONTHS + extraHistory; i += 1) {
      cursor = previousMonthKey(cursor);
      const rows = monthGroups.get(cursor);
      if (rows && rows.length > 0) keys.add(cursor);
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

  // Scroll today's row to the top of the viewport on first mount and any
  // time the user changes `startOfMonth` (which shifts which month
  // "current" resolves to). The ref guards against re-running after the
  // user has scrolled away on their own — we only auto-scroll for
  // sheet+month identity changes, not on every render.
  const scrollTargetRef = useRef<HTMLDivElement | null>(null);
  const lastScrolledKey = useRef<string | null>(null);
  const scrollToToday = (behavior: ScrollBehavior) => {
    requestAnimationFrame(() => {
      const section = sectionRef.current;
      const row = findRowNearestToday(section, today);
      if (row) {
        scrollRowToTop(row, behavior);
        return;
      }
      scrollTargetRef.current?.scrollIntoView({ behavior, block: "start" });
    });
  };
  useEffect(() => {
    const key = `${sheet.id}:${currentMonth}`;
    if (lastScrolledKey.current === key) return;
    lastScrolledKey.current = key;
    scrollToToday("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id, currentMonth]);

  // Track which rendered month containers are currently intersecting
  // the viewport so the floating "Today" button below can decide when
  // the user has scrolled far enough back in history to surface it.
  // Stable join key avoids re-creating the observer on every keystroke
  // (visibleMonths is memoized against monthGroups, which changes on
  // every cell edit — the array reference flips even when its
  // contents don't). Sentinel month keys like "undated" are ignored.
  const [newestVisibleMonth, setNewestVisibleMonth] = useState<string | null>(
    null,
  );
  const visibleMonthsKey = visibleMonths.join(",");
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const monthEls = section.querySelectorAll<HTMLElement>("[data-month-key]");
    if (monthEls.length === 0) return;
    const intersecting = new Set<string>();
    const recompute = () => {
      let newest: string | null = null;
      for (const key of intersecting) {
        if (key === "undated") continue;
        if (!newest || key > newest) newest = key;
      }
      setNewestVisibleMonth(newest);
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const key = entry.target.getAttribute("data-month-key");
        if (!key) continue;
        if (entry.isIntersecting) intersecting.add(key);
        else intersecting.delete(key);
      }
      recompute();
    });
    for (const el of monthEls) observer.observe(el);
    return () => observer.disconnect();
  }, [visibleMonthsKey]);

  // Surface the floating "Today" button once the newest month
  // intersecting the viewport sits more than three fiscal months
  // before the current month. Three was picked to mirror
  // HISTORY_PAGE_SIZE — once the user has scrolled past a full
  // "Show earlier months" page, jumping back to today via a chrome
  // affordance is meaningfully faster than scrolling.
  const showTodayButton = useMemo(() => {
    if (!newestVisibleMonth) return false;
    if (newestVisibleMonth >= currentMonth) return false;
    let cursor = currentMonth;
    for (let i = 0; i < 3; i += 1) {
      cursor = previousMonthKey(cursor);
    }
    return newestVisibleMonth < cursor;
  }, [newestVisibleMonth, currentMonth]);

  // Honour a one-shot scroll-to-row request from the transaction-search
  // modal. When the row's month falls outside the default history
  // window, grow `extraHistory` enough to include it before scrolling —
  // otherwise the row is filtered out of `visibleMonths` and the
  // `[data-row-id]` query finds nothing. The pulse animation is driven
  // by a CSS attribute on the row element: `[data-row-pulse]` flashes
  // the row background once via `--accent` for ~1500ms, then the
  // attribute is removed so the same row can pulse again on a future
  // pick.
  useEffect(() => {
    if (!scrollToRowRequest) return;
    if (scrollToRowRequest.sheetId !== sheet.id) return;
    const { rowId, iso } = scrollToRowRequest;
    if (iso) {
      const targetKey = getMonthKey(iso, settings.startOfMonth);
      if (/^\d{4}-\d{2}$/.test(targetKey) && targetKey < currentMonth) {
        let cursor = currentMonth;
        let stepsBack = 0;
        while (cursor > targetKey) {
          cursor = previousMonthKey(cursor);
          stepsBack += 1;
        }
        const needed = stepsBack - DEFAULT_HISTORY_MONTHS;
        if (needed > 0) {
          setExtraHistory((n) => (n < needed ? needed : n));
        }
      }
    }
    let pulsedRow: HTMLElement | null = null;
    const pulseHandle = window.setTimeout(() => {
      const selector = `[data-row-id="${CSS.escape(rowId)}"]`;
      const row = document.querySelector<HTMLElement>(selector);
      if (!row) return;
      const reduceMotion =
        document.documentElement.dataset.reduceMotion === "true";
      row.scrollIntoView({
        block: "center",
        behavior: reduceMotion ? "auto" : "smooth",
      });
      row.setAttribute("data-row-pulse", "true");
      pulsedRow = row;
    }, 50);
    const clearHandle = window.setTimeout(() => {
      pulsedRow?.removeAttribute("data-row-pulse");
    }, 1700);
    return () => {
      window.clearTimeout(pulseHandle);
      window.clearTimeout(clearHandle);
      pulsedRow?.removeAttribute("data-row-pulse");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToRowRequest?.tick, sheet.id]);

  // Stable per-month closure bundles, keyed by monthKey. Without this
  // each visible MonthTable receives fresh `onAddRow` / `onAddComplex` /
  // `onToggleCollapsed` arrow functions every parent render, defeating
  // `React.memo` on MonthTable — and with a few years of history
  // visible that means rebuilding every row tree on every keystroke.
  // Memo'd against the inputs the closures close over, so a typed
  // amount or a clicked cell elsewhere never invalidates them.
  const monthSlots = useMemo(() => {
    const map = new Map<
      string,
      {
        seedDate: string;
        onAddRow: () => void;
        onAddComplex: () => void;
        onToggleCollapsed: () => void;
      }
    >();
    for (const monthKey of visibleMonths) {
      const isCurrent = monthKey === currentMonth;
      const seedDate =
        monthKey === "undated"
          ? ""
          : isCurrent
            ? today
            : fiscalMonthSeedIso(monthKey, settings.startOfMonth);
      map.set(monthKey, {
        seedDate,
        onAddRow: () => onAddRow(seedDate),
        onAddComplex: () => onAddComplex(seedDate),
        onToggleCollapsed: () => toggleCollapsed(monthKey),
      });
    }
    return map;
  }, [
    visibleMonths,
    currentMonth,
    today,
    settings.startOfMonth,
    onAddRow,
    onAddComplex,
    toggleCollapsed,
  ]);

  // The month key MonthTable should force-mount its rows for, bypassing
  // its viewport-proximity gate. Set whenever a `scrollToRowRequest`
  // targets this sheet — without it the search-jump effect below would
  // `querySelector` for a row that hasn't been rendered yet (every
  // off-screen month renders only a placeholder by default) and the
  // scroll-into-view would silently no-op. Cleared back to `null`
  // between requests so the gate re-engages once the user has finished
  // navigating.
  const forceMountMonthKey = useMemo<string | null>(() => {
    if (!scrollToRowRequest) return null;
    if (scrollToRowRequest.sheetId !== sheet.id) return null;
    const { iso } = scrollToRowRequest;
    if (!iso) return null;
    const key = getMonthKey(iso, settings.startOfMonth);
    return /^\d{4}-\d{2}$/.test(key) ? key : null;
  }, [scrollToRowRequest, sheet.id, settings.startOfMonth]);

  const canTransfer = item.accountId !== null;

  return (
    <ActiveRowProvider>
      <section ref={sectionRef} data-sheet-content>
        <header className="mb-4 flex items-center justify-center gap-2">
          <h2 className="m-0 text-base font-bold text-fg-bright">
            {sheet.name}
          </h2>
          <button
            type="button"
            onClick={() => onEditSheet(sheet.id)}
            aria-label={t("sheet.edit", { name: sheet.name })}
            title={t("sheet.editSheet")}
            className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <Pencil size={14} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            aria-label={t("sheet.viewMode", { name: sheet.name })}
            title={t("sheet.viewModeTitle")}
            className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <Eye size={14} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={() => onDownloadSheet(sheet.id)}
            aria-label={t("download.downloadSheet")}
            title={t("download.downloadSheetTitle")}
            className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-muted opacity-70 hover:bg-surface-2 hover:text-fg-bright hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <Download size={14} aria-hidden focusable={false} />
          </button>
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
                {t("sheet.showEarlierMonths", { n: HISTORY_PAGE_SIZE })}
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </button>
          )}
          {visibleMonths.map((monthKey) => {
            const slot = monthSlots.get(monthKey);
            if (!slot) return null;
            const {
              seedDate,
              onAddRow: slotAdd,
              onAddComplex: slotAddComplex,
              onToggleCollapsed: slotToggle,
            } = slot;
            const isCurrent = monthKey === currentMonth;
            const monthRows = sortedMonthGroups.get(monthKey) ?? EMPTY_ROWS;
            return (
              <div
                key={monthKey}
                ref={isCurrent ? scrollTargetRef : null}
                data-month-key={monthKey}
              >
                <MonthTable
                  monthKey={monthKey}
                  rows={monthRows}
                  columns={decoratedItem.columns}
                  balances={balances}
                  types={types}
                  categories={categories}
                  onCreateType={onCreateType}
                  onCreateCategory={onCreateCategory}
                  settings={settings}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  canTransfer={canTransfer}
                  amountChars={colWidths.amountChars}
                  balanceChars={colWidths.balanceChars}
                  collapsed={collapsedMonths.has(monthKey)}
                  covered={
                    // Gate by the seed date's calendar month. The
                    // `+` button defaults a new row to `seedDate`,
                    // so if that date sits in a covered window
                    // (history is authoritative there) the button
                    // is pointless. Fiscal-month keys may straddle
                    // two calendar months when `startOfMonth ≠ 1`,
                    // so we check the seed rather than the key.
                    seedDate.length >= 7 && coveredSet.has(seedDate.slice(0, 7))
                  }
                  onToggleCollapsed={slotToggle}
                  forceMount={monthKey === forceMountMonthKey}
                  hideTransfers={settings.hideTransfers}
                  expandedTransferAnchors={expandedTransferAnchors}
                  onToggleTransferAnchor={toggleTransferAnchor}
                  onToggleRowTransfer={onToggleRowTransfer}
                  onUpdateCell={handleUpdateCell}
                  onCommitCell={onCommitCell}
                  onAddRow={slotAdd}
                  onAddComplex={slotAddComplex}
                  onDeleteRequest={onDeleteRequest}
                  onEditRequest={onEditRequest}
                  onEditRowRequest={onEditRowRequest}
                  onSplitRequest={onSplitRequest}
                  onTransactionRequest={onTransactionRequest}
                  onMatchRuleRequest={onMatchRuleRequest}
                  onEditHistoryRequest={onEditHistoryRequest}
                  onCopyRequest={onCopyRequest}
                  onCorrectionDeleteRequest={onCorrectionDeleteRequest}
                  onReorderColumns={onReorderColumns}
                  onToggleSelect={onToggleSelect}
                  onToggleSelectMonth={onToggleSelectMonth}
                />
              </div>
            );
          })}
        </div>
        <SheetViewerModal
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          sheet={sheet}
          item={decoratedItem}
          balances={balances}
          types={types}
          settings={settings}
        />
      </section>
      {showTodayButton && (
        // Floating pill anchored above the BottomBar (z-30) — z-40 keeps
        // it above the sheet content but below any modal backdrop
        // (z-50+). `pointer-events-none` on the wrapper lets the rows
        // underneath stay tappable in the gutter; the button itself
        // re-enables them.
        <div
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
          data-floating-chrome
        >
          <button
            type="button"
            onClick={() => scrollToToday("smooth")}
            aria-label={t("app.scrollToToday")}
            title={t("app.scrollToToday")}
            className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-bold tracking-wider text-fg-bright uppercase shadow-md hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
          >
            <ChevronDown size={14} aria-hidden focusable={false} />
            {t("common.today")}
          </button>
        </div>
      )}
    </ActiveRowProvider>
  );
}
