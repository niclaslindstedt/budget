import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Pencil,
  Tags,
} from "lucide-react";

import {
  buildSynthesizedRows,
  computeBalances,
  reverseRowsByDay,
  sortRowsByDate,
  type RowSortContext,
} from "../../data/budget/rows";
import {
  currentFiscalMonthKey,
  fiscalMonthSeedIso,
  getMonthKey,
  groupRowsByMonth,
  nextMonthKey,
  previousMonthKey,
  sortMonthKeys,
} from "../../data/fiscal-month";
import { findColumnByType } from "../../data/sheet";
import { coveredMonths } from "../../data/coverage";
import { findOrphans } from "../../data/reconciliation";
import { resolveEffectiveAmounts } from "../../data/budget/formula-resolve";
import { useT } from "../../i18n";
import type {
  Account,
  AccountBudget,
  Category,
  CellValue,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Settings,
  Sheet,
  Transfer,
  UserData,
} from "../../data/types";
import { suppressScrollHide } from "../../hooks";
import { widestFormattedAmount } from "../../utils/format";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { type BudgetContextValue } from "./BudgetContext";
import { BudgetContextProvider } from "./BudgetContextProvider";
import { useBudgetLayoutState } from "./hooks/useBudgetLayoutState";
import { BudgetMonthTable } from "./BudgetMonthTable";
import { SheetTitleMenu, type SheetTitleMenuItem } from "../SheetTitleMenu";
import { BudgetMetadataModal } from "./BudgetMetadataModal";
import { BudgetViewerModal } from "./BudgetViewerModal";
import {
  BudgetFindConflictsModal,
  type ConflictHistoryStamp,
  type ConflictUserRowPatch,
} from "./BudgetFindConflictsModal";

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
  // User-curated companies. Threaded through to the CompanyPicker in
  // the row-edit modal, the history-entry edit modal, and the
  // metadata mode walkthrough so the user can tag the merchant for
  // each entry. Lookup also feeds the description-cell fallback chain
  // on synthesized history rows.
  companies: readonly Company[];
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  // All accounts in the workspace. Needed so the view can look up the
  // peer account name when synthesizing a transfer row, and so the
  // running balance can mirror what the Accounts dashboard shows.
  accounts: Account[];
  // Seeds the running balance for the budget. Reads `openingBalance`
  // on the budget's account so the per-row balance column lines up
  // with what the bank says after a history import. Optional and
  // defaults to 0.
  openingBalance?: number;
  // Every cross-account transfer in the workspace. The view filters
  // to the ones involving `item.accountId` and interleaves them into
  // the rows displayed in each month.
  transfers: Transfer[];
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
  // One-shot scroll-to-row request issued by the transfer-search
  // modal when the user picks a result. The `tick` field is bumped on
  // every new request so the effect re-fires even if the same row is
  // picked twice in a row. `null` is the idle state. The view only
  // acts when `request.sheetId === sheet.id` so requests for other
  // sheets are ignored (the parent handles the sheet switch first;
  // the new BudgetPage mounts and picks up the request via prop). `iso`
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
  onTransferRequest: (row: Row) => void;
  // Flip the per-row `isTransfer` flag on a budget row. Used by the
  // eye-toggle action button to mark or unmark a one-off entry as an
  // inter-account transfer so the `hideTransfers` setting can suppress
  // it without converting it into a full Transfer.
  onToggleRowTransfer: (row: Row) => void;
  onMatchRuleRequest: (row: Row) => void;
  onEditHistoryRequest: (row: Row) => void;
  onCopyRequest: (row: Row) => void;
  onSetFiscalMonthShift: (row: Row, shift: -1 | 1 | null) => void;
  onCorrectionDeleteRequest: (row: Row) => void;
  // Inline per-cell write for a synthesized history row. Routed by
  // `BudgetPage` when the user edits the description or type cell on a
  // history row — `onUpdateCell` would no-op on the underlying
  // `UserData.history` map, so the cell handler dispatches this
  // instead, with the active `accountId` already attached.
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: {
      userDescription?: string;
      userTypeId?: string | null;
      userCompanyId?: string | null;
      noCompany?: boolean;
    },
  ) => void;
  // Row-level company writer surfaced by the description popover's
  // inline `CompanyPicker`. Defined at AppShell level so it can route
  // budget rows through `bulkUpdate` and history rows through
  // `updateHistoryEntry` (with `noCompany` cleared on assignment).
  onSetRowCompany: (row: Row, companyId: string | null) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
  onEditSheet: (sheetId: string) => void;
  onDownloadSheet: (sheetId: string) => void;
  // Find-conflicts modal callbacks. The history-winner path stamps
  // metadata onto a `HistoryEntry` and deletes the loser rows via
  // `applyReconciliation`; the user-winner path patches the winner's
  // blank fields and deletes the losers via `bulkUpdate` /
  // `updateCell` / `deleteRows`.
  onMergeConflictIntoHistory: (
    accountId: string,
    mergedRowIds: string[],
    overrides: readonly ConflictHistoryStamp[],
  ) => void;
  onMergeConflictUserRows: (
    winnerId: string,
    loserIds: string[],
    patch: ConflictUserRowPatch,
  ) => void;
  // Open the orphan-triage modal for the given fiscal month — fired
  // from each `BudgetMonthTable` footer when the month is fully covered by
  // bank history but still has manual user rows that need to be moved
  // or deleted. The handler in AppShell scopes the modal to this
  // sheet's `accountId` and feeds the modal the orphan list computed
  // against the same coverage rule the footer used.
  onTriageMonth: (monthKey: string) => void;
  // Full workspace state — needed by the formula resolver so
  // `sheet("<id>", <variable>)` references can look up other sheets'
  // running balances at this row's month.
  data: UserData;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Pick the row that should anchor a "scroll to today" jump.
//
// The Today button asks the sheet to return the user to the current
// fiscal month, so rows IN the current month win over rows in adjacent
// months even when an adjacent-month row is closer to today by date —
// otherwise a recurring bill dated a day or two into next month yanks
// the viewport into that next month instead of showing the user's
// in-progress current month. Within the chosen month (or, as a last
// resort, across all mounted months) prefer the earliest row dated on
// or after today so today's position sits at the top of the viewport
// with upcoming entries below; fall back to the most recent past row
// when everything is behind today.
//
// Pick by date and month, not DOM order, so the result stays correct
// under both oldest-first and newest-first transaction sort orders.
function findRowNearestToday(
  section: HTMLElement | null,
  today: string,
  currentMonth: string,
): HTMLElement | null {
  if (!section) return null;
  const candidates = section.querySelectorAll<HTMLElement>("[data-row-date]");
  let inCurrentFuture: HTMLElement | null = null;
  let inCurrentFutureDate: string | null = null;
  let inCurrentPast: HTMLElement | null = null;
  let inCurrentPastDate: string | null = null;
  let anyFuture: HTMLElement | null = null;
  let anyFutureDate: string | null = null;
  let anyPast: HTMLElement | null = null;
  let anyPastDate: string | null = null;
  for (const el of candidates) {
    const d = el.getAttribute("data-row-date");
    if (!d) continue;
    const monthEl = el.closest<HTMLElement>("[data-month-key]");
    const monthKey = monthEl?.getAttribute("data-month-key") ?? null;
    if (monthKey === "undated") continue;
    const inCurrent = monthKey === currentMonth;
    if (d >= today) {
      if (anyFutureDate === null || d < anyFutureDate) {
        anyFuture = el;
        anyFutureDate = d;
      }
      if (
        inCurrent &&
        (inCurrentFutureDate === null || d < inCurrentFutureDate)
      ) {
        inCurrentFuture = el;
        inCurrentFutureDate = d;
      }
    } else {
      if (anyPastDate === null || d > anyPastDate) {
        anyPast = el;
        anyPastDate = d;
      }
      if (inCurrent && (inCurrentPastDate === null || d > inCurrentPastDate)) {
        inCurrentPast = el;
        inCurrentPastDate = d;
      }
    }
  }
  return inCurrentFuture ?? inCurrentPast ?? anyFuture ?? anyPast;
}

// Scroll a row to the top of the viewport, accounting for the three
// stacked sticky bands above it (app header → month header → column
// header thead). `scrollIntoView({ block: "start" })` would land the
// row underneath all three; offsetting by their combined height pulls
// it just below them so today's date is the first thing the user sees.
// Measure the app header off the live element instead of parsing
// `--app-header-h` — in standalone mode that variable resolves to a
// `calc(... + env(safe-area-inset-top))` whose literal string
// parseFloat can't decode.
function scrollRowToTop(row: HTMLElement, behavior: ScrollBehavior) {
  const thead = row.closest("table")?.querySelector("thead");
  const theadH = thead?.getBoundingClientRect().height ?? 0;
  const appHeader = document.querySelector<HTMLElement>("[data-app-header]");
  const appH = appHeader?.getBoundingClientRect().height ?? 0;
  const monthH =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--month-header-h",
      ),
    ) || 0;
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
const FUTURE_PAGE_SIZE = 3;

// Module-level stable empty array. Used as the fallback rows reference
// for months with no entries so BudgetMonthTable's React.memo sees the same
// reference across renders instead of a fresh `[]` each time.
const EMPTY_ROWS: Row[] = [];

export function BudgetPage({
  sheet,
  item,
  types,
  categories,
  companies,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  accounts,
  transfers,
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
  onTransferRequest,
  onToggleRowTransfer,
  onMatchRuleRequest,
  onEditHistoryRequest,
  onCopyRequest,
  onSetFiscalMonthShift,
  onCorrectionDeleteRequest,
  onUpdateHistoryEntry,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onEditSheet,
  onDownloadSheet,
  onMergeConflictIntoHistory,
  onMergeConflictUserRows,
  onTriageMonth,
  onSetRowCompany,
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
  // Id-indexed types map, used both by the secondary-sort context and
  // by every `BudgetRow` to look up `row.typeId` in O(1). Lifted to
  // page level so each row gets a stable map reference — having every
  // row run `types.find()` in a per-row `useMemo` invalidates every
  // row's memo whenever `types` changes (e.g. adding a single new
  // type), turning a one-cell edit into N row recomputes.
  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const t of types) m.set(t.id, t);
    return m;
  }, [types]);
  // Id-indexed companies map, threaded through to every `BudgetRow` so
  // the description cell can resolve `row.companyId` in O(1) and render
  // an outlined pill (Building2 + company name) when the row has no
  // user-authored description. Same lift rationale as `typesById`.
  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);
  const sortContext = useMemo<RowSortContext | undefined>(() => {
    const descCol = findColumnByType(item.columns, "description");
    const amountCol = findColumnByType(item.columns, "amount");
    if (!descCol || !amountCol) return undefined;
    return {
      descriptionColumnId: descCol.id,
      amountColumnId: amountCol.id,
      typesById,
    };
  }, [item.columns, typesById]);

  // Bundle the cross-cutting taxonomy + settings the budget subtree
  // reaches for in every row. Memoised once per change to any input so
  // every memoised descendant sees a stable context reference across
  // ordinary edits — only a real taxonomy / settings change forces a
  // re-render of the row tree.
  const budgetContextValue = useMemo<BudgetContextValue>(
    () => ({
      types,
      typesById,
      categories,
      companies,
      companiesById,
      onCreateType,
      onCreateCategory,
      onCreateCompany,
      settings,
    }),
    [
      types,
      typesById,
      categories,
      companies,
      companiesById,
      onCreateType,
      onCreateCategory,
      onCreateCompany,
      settings,
    ],
  );

  // Interleave synthesized transfer rows alongside the budget's own
  // rows so month grouping, running balance, and sort-by-date pick them
  // up without further special-casing. Only the transfers involving
  // this budget's account contribute. When the budget has no account
  // attached, no synthesis happens — there is no "this account" to
  // place the transfers against.
  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);
  // Synthesize transfer + history rows once per change to the inputs
  // those rows depend on — column shape, the budget's account, every
  // workspace transfer, the account's full history, the hints + rules
  // that label history rows, plus the companies / types those labels
  // resolve through. None of those flip when the user types in a
  // budget cell (`item.columns` and `item.accountId` are carried
  // forward by the updateCell reducer), so the synthesis result is
  // reused across keystrokes — skipping ~500 history-entry label
  // resolutions and the matching rule walks they trigger on every
  // edit. The merge below is a cheap array concat.
  const synthesizedRows = useMemo(
    () =>
      buildSynthesizedRows(
        item.columns,
        item.accountId,
        transfers,
        history,
        accountsById,
        merchantHints,
        matchRules,
        companies,
        types,
      ),
    [
      item.columns,
      item.accountId,
      transfers,
      history,
      accountsById,
      merchantHints,
      matchRules,
      companies,
      types,
    ],
  );
  const mergedItem = useMemo<AccountBudget>(
    () => ({
      ...item,
      rows:
        synthesizedRows.length === 0
          ? item.rows
          : [...item.rows, ...synthesizedRows],
    }),
    [item, synthesizedRows],
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

  // Fiscal months fully covered by imported history. Computed once
  // per render; passed down so each `BudgetMonthTable` can hide its
  // `+ Add row` footer. Uses `settings.startOfMonth` so the coverage
  // window matches the column the rows are grouped under — with
  // startOfMonth=25, fiscal "2026-04" only flips covered once
  // history extends past May 24, not April 30.
  const coveredSet = useMemo(
    () =>
      coveredMonths(history, item.rows, item.columns, settings.startOfMonth),
    [history, item.rows, item.columns, settings.startOfMonth],
  );

  // Per-month count of manual rows sitting inside a covered fiscal
  // month — those are orphans the bank statement contradicts. Reuses
  // the same `findOrphans` walk the import-triage flow does so the
  // footer's count agrees with what the modal will surface. Treats
  // every covered month as "newly covered" since the budget-page CTA
  // is always retrospective (no import in flight).
  const orphanCountByMonth = useMemo(() => {
    const out = new Map<string, number>();
    if (coveredSet.size === 0) return out;
    const orphans = findOrphans(
      item.rows,
      item.columns,
      coveredSet,
      new Set(),
      settings.startOfMonth,
    );
    for (const o of orphans) {
      out.set(o.monthKey, (out.get(o.monthKey) ?? 0) + 1);
    }
    return out;
  }, [coveredSet, item.rows, item.columns, settings.startOfMonth]);

  // Evaluate every formula row's amount against the merged view (so
  // synthesized transfers and history rows count toward
  // `endOfMonthBalance`, `income`, etc.) — then mirror the resolved
  // value into each formula row's amount cell so the existing
  // BudgetMonthTable / Cell rendering chain shows the evaluated number
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

  // Sort the full rows array once. Both the running-balance pass below
  // and the per-month display path consume this view — previously each
  // call site sorted independently (`computeBalances` did its own sort
  // and `sortedMonthGroups` sorted each month bucket again with the same
  // comparator). `groupRowsByMonth` preserves input order within each
  // bucket, so feeding it a globally date-sorted array delivers
  // per-month sorted buckets for free. Trades two O(N log N) sorts per
  // keystroke for one.
  const sortedRows = useMemo(() => {
    if (!dateCol) return decoratedItem.rows;
    return sortRowsByDate(decoratedItem.rows, dateCol.id, sortContext);
  }, [decoratedItem.rows, dateCol, sortContext]);

  const balances = useMemo(
    () =>
      computeBalances(
        decoratedItem,
        openingBalance,
        effectiveAmounts,
        balanceOverrides,
        sortContext,
        sortedRows,
      ),
    [
      decoratedItem,
      openingBalance,
      effectiveAmounts,
      balanceOverrides,
      sortContext,
      sortedRows,
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
  //
  // `widestFormattedAmount` bucketizes by formatter tier and formats
  // at most one candidate per bucket, so the only per-row cost left is
  // a `Math.abs` + comparison — orders of magnitude cheaper than the
  // prior "format every row" walk when the budget has thousands of
  // rows and balances.
  const colWidths = useMemo(() => {
    const amountCol = findColumnByType(decoratedItem.columns, "amount");
    const balanceCol = findColumnByType(decoratedItem.columns, "balance");
    let amountChars = 0;
    let balanceChars = 0;
    if (amountCol) {
      function* amountValues() {
        for (const row of decoratedItem.rows) {
          const v = row.cells[amountCol!.id];
          if (typeof v === "number") yield v;
        }
      }
      amountChars = widestFormattedAmount(amountValues(), settings);
    }
    if (balanceCol) {
      balanceChars = widestFormattedAmount(balances.values(), settings, {
        alwaysTwoFractionDigits: true,
        alwaysAbbreviate: settings.alwaysAbbreviateBalance,
      });
    }
    return { amountChars, balanceChars };
  }, [decoratedItem.rows, decoratedItem.columns, balances, settings]);

  // Bucket the already-sorted rows by fiscal month. Because
  // `groupRowsByMonth` preserves input order, each bucket comes out
  // in the same date order the global sort produced — so the per-month
  // sort the next memo used to do collapses to a no-op (or just a
  // reversal for the newest-first preference).
  const monthGroups = useMemo(() => {
    if (!dateCol) return new Map<string, Row[]>();
    return groupRowsByMonth(sortedRows, dateCol.id, settings.startOfMonth);
  }, [sortedRows, dateCol, settings.startOfMonth]);

  // Each bucket is already date-sorted thanks to `sortedRows` above;
  // only the newest-first preference needs an extra reverse pass.
  // Stable array refs per month so React.memo on BudgetMonthTable can
  // skip months whose rows didn't change.
  const sortedMonthGroups = useMemo(() => {
    if (!dateCol) return monthGroups;
    if (settings.transactionSortOrder !== "newestFirst") return monthGroups;
    const out = new Map<string, Row[]>();
    for (const [key, rows] of monthGroups) {
      out.set(key, reverseRowsByDay(rows, dateCol.id));
    }
    return out;
  }, [monthGroups, dateCol, settings.transactionSortOrder]);

  const currentMonth = useMemo(
    () => currentFiscalMonthKey(settings.startOfMonth),
    [settings.startOfMonth],
  );

  // `todayIso()` returns a fresh string each call, but the value only
  // changes at midnight. Memoize so closures derived from it (the
  // current-month seed date threaded into BudgetMonthTable) keep stable
  // references across renders.
  const today = useMemo(() => todayIso(), []);

  const {
    viewerOpen,
    setViewerOpen,
    conflictsOpen,
    setConflictsOpen,
    metadataOpen,
    setMetadataOpen,
    extraHistory,
    setExtraHistory,
    extraFuture,
    setExtraFuture,
    collapsedMonths,
    toggleCollapsed,
    expandedTransferAnchors,
    toggleTransferAnchor,
  } = useBudgetLayoutState({
    sheetId: sheet.id,
    hideTransfers: settings.hideTransfers,
  });

  const oldestVisibleMonth = useMemo(() => {
    let key = currentMonth;
    for (let i = 0; i < DEFAULT_HISTORY_MONTHS + extraHistory; i += 1) {
      key = previousMonthKey(key);
    }
    return key;
  }, [currentMonth, extraHistory]);

  // Last future fiscal month rendered by default. With `showFutureEntries`
  // off the baseline is `currentMonth` (zero look-ahead); with it on we
  // step forward by `futureEntryMonths` so the user sees their planned
  // entries straight away. Each click on the in-sheet
  // "Show 3 future months" toggle steps the cutoff another
  // `FUTURE_PAGE_SIZE` months forward.
  const futureCutoff = useMemo(() => {
    const baseAhead = settings.showFutureEntries
      ? settings.futureEntryMonths
      : 0;
    let key = currentMonth;
    for (let i = 0; i < baseAhead + extraFuture; i += 1) {
      key = nextMonthKey(key);
    }
    return key;
  }, [
    currentMonth,
    settings.showFutureEntries,
    settings.futureEntryMonths,
    extraFuture,
  ]);

  const visibleMonths = useMemo(() => {
    const keys = new Set<string>();
    // Always render the current fiscal month — even when empty, the
    // BudgetAddEntryButton inside it is how the user adds the first entry.
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
    // hidden behind the "Show more" button; future months past
    // `futureCutoff` stay hidden behind the "Show 3 future months"
    // button until the user steps the cutoff forward.
    for (const key of monthGroups.keys()) {
      if (key === "undated") {
        keys.add(key);
        continue;
      }
      if (key < cursor) continue;
      if (key > futureCutoff) continue;
      keys.add(key);
    }
    const sorted = sortMonthKeys(keys);
    // When the user prefers newest-first, flip the month list too so
    // the in-month row order and the month-stack order agree.
    // `sortMonthKeys` parks "undated" at the end, so reversing slides
    // it to the top — matching `BudgetViewerModal`'s long-standing
    // descending layout.
    return settings.transactionSortOrder === "newestFirst"
      ? sorted.reverse()
      : sorted;
  }, [
    monthGroups,
    currentMonth,
    extraHistory,
    futureCutoff,
    settings.transactionSortOrder,
  ]);

  const hasHiddenFuture = useMemo(() => {
    for (const key of monthGroups.keys()) {
      if (key === "undated") continue;
      if (key > futureCutoff) return true;
    }
    return false;
  }, [monthGroups, futureCutoff]);

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
    // Tell the BottomBar's hide-on-scroll hook to ignore the scroll
    // events we're about to fire — without this the initial jump to
    // today reads as a fast user scroll-down and the bar slides off
    // for a beat before the polling refine settles. AccountsPage's
    // mount-time scroll lands at the TOP_BAND so it never hit this.
    suppressScrollHide();
    const target = scrollTargetRef.current;
    // First pass: today's row may already be mounted (the user is on
    // or near the current month). Trust it only when its month is
    // current or later AND the current month's own rows are mounted —
    // when the user is scrolled deep into history, BudgetMonthTable's near-
    // viewport gate replaces the current-month row tree with a
    // placeholder, so `findRowNearestToday` returns the latest *past*
    // row (already on-screen) and scrolling to it would be a no-op.
    // When the user is scrolled deep into the future the same gate
    // hides earlier rows, so `findRowNearestToday` returns the first
    // mounted row ≥ today (e.g. a Sept row when today is in May) — not
    // the actual next-row-after-today. In both cases fall through to
    // the container scroll, which mounts the current month and lets
    // refine find the true target on the second pass.
    const refine = (): boolean => {
      const section = sectionRef.current;
      const row = findRowNearestToday(section, today, currentMonth);
      if (!row) return false;
      const rowMonthEl = row.closest<HTMLElement>("[data-month-key]");
      const rowMonth = rowMonthEl?.getAttribute("data-month-key") ?? null;
      if (rowMonth === "undated") return false;
      if (rowMonth !== null && rowMonth < currentMonth) return false;
      if (rowMonth !== null && rowMonth > currentMonth) {
        const currentMonthEl = scrollTargetRef.current;
        if (!currentMonthEl?.querySelector("[data-row-date]")) return false;
      }
      scrollRowToTop(row, behavior);
      return true;
    };
    requestAnimationFrame(() => {
      if (refine()) return;
      // Today's row isn't in the DOM. Scroll to the current-month
      // container (always rendered, even when its rows are lazy-
      // unmounted) — that brings the section under the viewport so
      // BudgetMonthTable's IntersectionObserver flips and the row tree
      // mounts. Refine to today's row once the smooth-scroll tail
      // and lazy-mount commit have landed.
      //
      // `scrollIntoView({ behavior: "smooth" })` has no fixed
      // duration — Chrome interpolates roughly with distance, so a
      // jump from deep-future months to today can run well past a
      // second. A single deadline (we used to wait 450 ms) silently
      // misses long jumps: the current-month container isn't yet in
      // BudgetMonthTable's intersection-observer margin, its rows are
      // still unmounted, `refine` returns false, and the user is
      // parked short of today — they had to click Today several
      // times to step closer. Poll every frame until the row mounts
      // and refine commits, capped at 3 s so we never spin forever.
      if (!target) return;
      target.scrollIntoView({ behavior, block: "start" });
      const deadline = performance.now() + 3000;
      const poll = () => {
        if (refine()) return;
        if (performance.now() > deadline) return;
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  };
  useEffect(() => {
    const key = `${sheet.id}:${currentMonth}`;
    if (lastScrolledKey.current === key) return;
    lastScrolledKey.current = key;
    scrollToToday("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id, currentMonth]);

  // Preserve the user's visual position when either reveal toggle
  // ("Show 3 future months" / "Show 3 earlier months") steps its cutoff.
  // Whichever direction the revealed months land relative to the
  // viewport, browser scroll anchoring can't shift past scrollY=0, so
  // expansions above the current scroll position leave the user looking
  // at the newly-revealed slab instead of the rows they were editing.
  // Capture the current-month anchor's top before the state change and
  // scroll by the delta after layout so the view stays put — clicking
  // either toggle just expands the list. When the revealed months land
  // below the anchor (oldest-first future, newest-first earlier) the
  // delta is ~0 and the layout effect is a no-op.
  const revealAnchorRef = useRef<number | null>(null);
  const captureRevealAnchor = useCallback(() => {
    const anchor = scrollTargetRef.current;
    revealAnchorRef.current = anchor
      ? anchor.getBoundingClientRect().top
      : null;
  }, []);
  const onShowMoreFutureClick = useCallback(() => {
    captureRevealAnchor();
    setExtraFuture((n) => n + FUTURE_PAGE_SIZE);
  }, [captureRevealAnchor]);
  const onShowMoreHistoryClick = useCallback(() => {
    captureRevealAnchor();
    setExtraHistory((n) => n + HISTORY_PAGE_SIZE);
  }, [captureRevealAnchor]);
  useLayoutEffect(() => {
    const before = revealAnchorRef.current;
    if (before === null) return;
    revealAnchorRef.current = null;
    const apply = () => {
      const anchor = scrollTargetRef.current;
      if (!anchor) return;
      const delta = anchor.getBoundingClientRect().top - before;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy({ top: delta, behavior: "auto" });
      }
    };
    apply();
    // Newly-revealed `BudgetMonthTable`s render as a height-estimated
    // placeholder for one frame (`useNearViewport` starts false and
    // only flips to true via its own layout effect), then re-render
    // with the real row tree on the next frame. The placeholder's
    // 40px-per-row estimate rarely matches the real stack, so the
    // anchor shifts a second time after our initial compensation —
    // and a third / fourth if any of the revealed months sit just
    // outside the 1200px near-viewport margin and need the row tree
    // measured before their cached height settles. Re-apply across
    // the next handful of frames until the layout above the anchor
    // stops moving.
    let frames = 0;
    let raf = 0;
    const loop = () => {
      apply();
      frames += 1;
      if (frames < 8) {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [extraFuture, extraHistory]);

  // Track which rendered month containers are currently intersecting
  // the viewport so the floating "Today" button below can decide when
  // the current fiscal month is no longer on screen.
  // Stable join key avoids re-creating the observer on every keystroke
  // (visibleMonths is memoized against monthGroups, which changes on
  // every cell edit — the array reference flips even when its
  // contents don't). Sentinel month keys like "undated" are ignored.
  const [visibleMonthRange, setVisibleMonthRange] = useState<{
    oldest: string | null;
    newest: string | null;
  }>({ oldest: null, newest: null });
  const visibleMonthsKey = visibleMonths.join(",");
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const monthEls = section.querySelectorAll<HTMLElement>("[data-month-key]");
    if (monthEls.length === 0) return;
    const intersecting = new Set<string>();
    const recompute = () => {
      let newest: string | null = null;
      let oldest: string | null = null;
      for (const key of intersecting) {
        if (key === "undated") continue;
        if (!newest || key > newest) newest = key;
        if (!oldest || key < oldest) oldest = key;
      }
      setVisibleMonthRange((prev) =>
        prev.newest === newest && prev.oldest === oldest
          ? prev
          : { oldest, newest },
      );
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

  // Surface the floating "Today" button whenever the current fiscal
  // month is scrolled off-screen — in either direction. Anchoring to
  // the current fiscal month (not today's calendar date) keeps the
  // button hidden while the user is editing the active budget, even
  // late in the month when today's row sits near the bottom of the
  // current month. The pill's direction tracks the scroll the user
  // needs to make to reach current, which depends on where current
  // sits in the DOM relative to the visible range — and that flips
  // with `transactionSortOrder`. Oldest-first stacks past above
  // current and future below; newest-first inverts both.
  const todayButtonDirection = useMemo<"down" | "up" | null>(() => {
    const { newest, oldest } = visibleMonthRange;
    if (!newest || !oldest) return null;
    const newestFirst = settings.transactionSortOrder === "newestFirst";
    if (newest < currentMonth) {
      // Visible range is entirely in the past. Past sits above
      // current in oldest-first (scroll down) and below current in
      // newest-first (scroll up).
      return newestFirst ? "up" : "down";
    }
    if (oldest > currentMonth) {
      // Visible range is entirely in the future. Future sits below
      // current in oldest-first (scroll up) and above current in
      // newest-first (scroll down).
      return newestFirst ? "down" : "up";
    }
    return null;
  }, [visibleMonthRange, currentMonth, settings.transactionSortOrder]);
  const showTodayButton = todayButtonDirection !== null;

  // Honour a one-shot scroll-to-row request from the transfer-search
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
      // Same rationale as `scrollToToday`: the BottomBar's
      // hide-on-scroll hook would otherwise read this programmatic
      // scroll-into-view as a user fling.
      suppressScrollHide();
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
  // each visible BudgetMonthTable receives fresh `onAddRow` / `onAddComplex` /
  // `onToggleCollapsed` arrow functions every parent render, defeating
  // `React.memo` on BudgetMonthTable — and with a few years of history
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

  // The month key BudgetMonthTable should force-mount its rows for, bypassing
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

  const titleMenuItems: SheetTitleMenuItem[] = [
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () => onEditSheet(sheet.id),
    },
    {
      key: "view",
      icon: <Eye size={16} aria-hidden focusable={false} />,
      label: t("sheet.viewBudget"),
      onClick: () => setViewerOpen(true),
    },
    {
      key: "metadata",
      icon: <Tags size={16} aria-hidden focusable={false} />,
      label: t("sheet.metadataMode"),
      onClick: () => setMetadataOpen(true),
    },
    {
      key: "conflicts",
      icon: <AlertTriangle size={16} aria-hidden focusable={false} />,
      label: t("sheet.findConflicts"),
      onClick: () => setConflictsOpen(true),
    },
    {
      key: "download",
      icon: <Download size={16} aria-hidden focusable={false} />,
      label: t("download.downloadBudget"),
      onClick: () => onDownloadSheet(sheet.id),
    },
  ];

  return (
    <ActiveRowProvider>
      <BudgetContextProvider value={budgetContextValue}>
        <section ref={sectionRef} data-sheet-content>
          <header className="mb-2 flex items-center justify-center gap-2 md:mb-6">
            <h2 className="m-0 text-base font-bold text-fg-bright">
              {sheet.name}
            </h2>
            <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
          </header>
          <div className="flex flex-col gap-3 md:gap-6">
            {hasMoreHistory &&
              settings.transactionSortOrder === "oldestFirst" && (
                <BudgetMonthSectionToggle
                  label={t("budget.showEarlierMonths", {
                    n: HISTORY_PAGE_SIZE,
                  })}
                  onClick={onShowMoreHistoryClick}
                />
              )}
            {hasHiddenFuture &&
              settings.transactionSortOrder === "newestFirst" && (
                <BudgetMonthSectionToggle
                  label={t("budget.showFutureMonths", { n: FUTURE_PAGE_SIZE })}
                  onClick={onShowMoreFutureClick}
                />
              )}
            {visibleMonths.map((monthKey) => {
              const slot = monthSlots.get(monthKey);
              if (!slot) return null;
              const {
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
                  <BudgetMonthTable
                    monthKey={monthKey}
                    rows={monthRows}
                    columns={decoratedItem.columns}
                    balances={balances}
                    onSetRowCompany={onSetRowCompany}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                    canTransfer={canTransfer}
                    amountChars={colWidths.amountChars}
                    balanceChars={colWidths.balanceChars}
                    collapsed={collapsedMonths.has(monthKey)}
                    covered={
                      // `coveredSet` keys are fiscal months — same
                      // basis as `monthKey` — so straight membership
                      // is the right check. The `+` button hides only
                      // when history is authoritative across the entire
                      // fiscal window the section represents.
                      coveredSet.has(monthKey)
                    }
                    orphanCount={orphanCountByMonth.get(monthKey) ?? 0}
                    onTriage={
                      coveredSet.has(monthKey) &&
                      (orphanCountByMonth.get(monthKey) ?? 0) > 0
                        ? () => onTriageMonth(monthKey)
                        : undefined
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
                    onTransferRequest={onTransferRequest}
                    onMatchRuleRequest={onMatchRuleRequest}
                    onEditHistoryRequest={onEditHistoryRequest}
                    onCopyRequest={onCopyRequest}
                    onSetFiscalMonthShift={onSetFiscalMonthShift}
                    onCorrectionDeleteRequest={onCorrectionDeleteRequest}
                    onReorderColumns={onReorderColumns}
                    onToggleSelect={onToggleSelect}
                    onToggleSelectMonth={onToggleSelectMonth}
                  />
                </div>
              );
            })}
            {hasHiddenFuture &&
              settings.transactionSortOrder === "oldestFirst" && (
                <BudgetMonthSectionToggle
                  label={t("budget.showFutureMonths", { n: FUTURE_PAGE_SIZE })}
                  onClick={onShowMoreFutureClick}
                />
              )}
            {hasMoreHistory &&
              settings.transactionSortOrder === "newestFirst" && (
                <BudgetMonthSectionToggle
                  label={t("budget.showEarlierMonths", {
                    n: HISTORY_PAGE_SIZE,
                  })}
                  onClick={onShowMoreHistoryClick}
                />
              )}
          </div>
          <BudgetViewerModal
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            sheet={sheet}
            item={decoratedItem}
            balances={balances}
            types={types}
            settings={settings}
          />
          <BudgetFindConflictsModal
            open={conflictsOpen}
            onClose={() => setConflictsOpen(false)}
            rows={decoratedItem.rows}
            columns={decoratedItem.columns}
            types={types}
            categories={categories}
            settings={settings}
            accountId={item.accountId}
            descriptionColumnId={
              findColumnByType(decoratedItem.columns, "description")?.id ?? null
            }
            onMergeIntoHistory={onMergeConflictIntoHistory}
            onMergeUserRows={onMergeConflictUserRows}
          />
          <BudgetMetadataModal
            open={metadataOpen}
            onClose={() => setMetadataOpen(false)}
            accountId={item.accountId}
            entries={history}
            merchantHints={merchantHints}
            matchRules={matchRules}
            types={types}
            categories={categories}
            companies={companies}
            settings={settings}
            onCreateType={onCreateType}
            onCreateCategory={onCreateCategory}
            onCreateCompany={onCreateCompany}
            onUpdateHistoryEntry={onUpdateHistoryEntry}
          />
        </section>
        {showTodayButton &&
          // Floating pill anchored above the BottomBar (z-30) when the
          // user has scrolled into the past, or below the sticky page
          // header when they've scrolled into the future — z-40 keeps it
          // above the sheet content but below any modal backdrop
          // (z-50+). `pointer-events-none` on the wrapper lets the rows
          // underneath stay tappable in the gutter; the button itself
          // re-enables them.
          //
          // Portalled to `document.body` so `position: fixed` resolves
          // against the layout viewport. The sheet-panel wrapper in
          // AppShell carries `will-change: transform` (for the
          // swipe-between-sheets perf hint), and the CSS spec says any
          // element with `will-change` set to a property that creates a
          // stacking context — `transform` included — also creates a
          // containing block for fixed-position descendants. Without
          // the portal, the pill rendered at `top: 61px` relative to
          // that wrapper and slid out of view as soon as the user
          // scrolled.
          createPortal(
            <div
              className={
                todayButtonDirection === "up"
                  ? "pointer-events-none fixed inset-x-0 z-40 flex justify-center top-[calc(var(--app-header-h)+var(--month-header-h)+var(--column-header-h)+0.5rem)]"
                  : "pointer-events-none fixed inset-x-0 z-40 flex justify-center bottom-[calc(var(--bottom-bar-h)+0.5rem)]"
              }
              data-floating-chrome
              data-toast-stack={
                todayButtonDirection === "down" ? "" : undefined
              }
            >
              <button
                type="button"
                onClick={() => scrollToToday("smooth")}
                aria-label={t("app.scrollToToday")}
                title={t("app.scrollToToday")}
                className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-bold tracking-wider text-fg-bright uppercase shadow-md hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
              >
                {todayButtonDirection === "up" ? (
                  <ChevronUp size={14} aria-hidden focusable={false} />
                ) : (
                  <ChevronDown size={14} aria-hidden focusable={false} />
                )}
                {t("common.today")}
              </button>
            </div>,
            document.body,
          )}
      </BudgetContextProvider>
    </ActiveRowProvider>
  );
}

// Pill-less divider button reused by the "Show earlier months" and
// "Show future months" affordances. Renders as a horizontal line
// with a centred label so the row reads as a section break rather
// than a button.
function BudgetMonthSectionToggle({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-xs text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="whitespace-nowrap">{label}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </button>
  );
}
