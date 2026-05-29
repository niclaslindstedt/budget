import { useMemo, useRef } from "react";
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

import { unlock } from "../../data/achievements";
import { computeBudgetState } from "../../data/budget/computed-state";
import { buildSynthesizedRows } from "../../data/budget/rows";
import {
  currentFiscalMonthKey,
  fiscalMonthSeedIso,
  nextMonthKey,
  previousMonthKey,
  sortMonthKeys,
} from "../../data/fiscal-month";
import { findColumnByType } from "../../data/sheet";
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
  Tag,
  Transfer,
  UserData,
} from "../../data/types";
import { todayIso } from "../../utils/date";
import { indexById } from "../../utils/indexById";
import { ActiveRowProvider } from "../ActiveRowProvider";
import { type BudgetContextValue } from "./BudgetContext";
import { BudgetContextProvider } from "./BudgetContextProvider";
import { useBudgetLayoutState } from "./hooks/useBudgetLayoutState";
import { useRevealAnchorPreservation } from "./useRevealAnchorPreservation";
import { useRowFlashing } from "./useRowFlashing";
import { useScrollToRowRequest } from "./useScrollToRowRequest";
import { useScrollToToday } from "./useScrollToToday";
import { useVisibleMonthRange } from "./useVisibleMonthRange";
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
  // companyId → suggested typeId for the auto-fill. Forwarded to the
  // `BudgetMetadataModal` so picking a company there auto-fills the
  // type on entries that don't have one. The description popover's
  // inline picker routes through `onSetRowCompany` (defined in
  // AppShell) which applies the same rule directly.
  companyTypeSuggestions: ReadonlyMap<string, string>;
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
      userTagIds?: string[];
      isTransfer?: boolean;
      noCompany?: boolean;
    },
  ) => void;
  // Metadata-mode bulk apply — stamp the labels the user gave one
  // history entry onto its lookalikes (same account, raw description
  // matches the derived pattern). Fills blank fields only; tags union.
  onApplyMetadataToMatchingHistory: (
    accountId: string,
    pattern: string,
    excludeEntryId: string,
    patch: {
      userDescription?: string;
      userTypeId?: string;
      userCompanyId?: string;
      userTagIds?: readonly string[];
    },
  ) => void;
  // Tag catalog + creator, threaded to the metadata modal so the user
  // can tag entries during the metadata walk.
  tags: readonly Tag[];
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  // Row-level company writer surfaced by the description popover's
  // inline `CompanyPicker`. Defined at AppShell level so it can route
  // budget rows through `bulkUpdate` and history rows through
  // `updateHistoryEntry` (with `noCompany` cleared on assignment).
  onSetRowCompany: (row: Row, companyId: string | null) => void;
  // Row-level "omit company" writer; only meaningful for synthesized
  // history rows (the only shape carrying `entry.noCompany`).
  onSetRowNoCompany: (row: Row, next: boolean) => void;
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
  companyTypeSuggestions,
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
  onApplyMetadataToMatchingHistory,
  tags,
  onCreateTag,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
  onEditSheet,
  onDownloadSheet,
  onMergeConflictIntoHistory,
  onMergeConflictUserRows,
  onTriageMonth,
  onSetRowCompany,
  onSetRowNoCompany,
  data,
}: Props) {
  const t = useT();
  const sectionRef = useRef<HTMLElement | null>(null);
  // Id-indexed types / companies / accounts maps. Kept as their own
  // memos (instead of folded into the consolidated row pipeline below)
  // so their identity only flips when the underlying list changes —
  // `budgetContextValue` reads them through and any row edit would
  // otherwise force a fresh context reference, re-rendering every
  // memoised descendant.
  const typesById = useMemo(() => indexById(types), [types]);
  const companiesById = useMemo(() => indexById(companies), [companies]);
  const accountsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);

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

  // Synthesized transfer + history rows are derived from inputs that
  // don't flip on a cell-edit keystroke — column shape, the budget's
  // account, every workspace transfer, the account's full history, the
  // hints + rules that label history rows, plus the companies / types
  // those labels resolve through. Hoisting the walk into its own memo
  // lets cell edits reuse the cached array; without this, the consolidated
  // `computed` memo below invalidates on `item` per keystroke and pays
  // for an O(H) re-synthesis + per-entry rule-cache rebuild — the
  // dominant cost of typing in a cell on accounts with a few thousand
  // history entries.
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

  // The remaining pure derivations — merge → decorate → sort → balance →
  // bucket — collapsed onto one memo. `synthesizedRows` rides in as a
  // prebuilt input so the synthesis walk stays cached across keystrokes
  // even though this memo invalidates on `item`. The helper lives in
  // `src/data/budget/computed-state.ts` so future sheet types (savings,
  // loans) can reuse the same pipeline.
  const computed = useMemo(
    () =>
      computeBudgetState({
        item,
        openingBalance,
        data,
        settings,
        history,
        typesById,
        synthesizedRows,
      }),
    [item, openingBalance, data, settings, history, typesById, synthesizedRows],
  );
  const {
    decoratedItem,
    balances,
    coveredSet,
    orphanCountByMonth,
    colWidths,
    sortedMonthGroups,
    monthGroups,
  } = computed;

  // `item.columns` is what the cell handlers look up to route history-
  // row writes to the right field. Closing over `item.columns` (rather
  // than `decoratedItem.columns`) keeps the handlers stable across row
  // edits — the synthesis pipeline only ever replaces `rows`, but the
  // rebuilt `computed` would still force a fresh `decoratedItem`
  // reference on every keystroke.
  const {
    handleUpdateCell,
    handleCommitCell,
    handleSetRowCompany,
    handleSetRowNoCompany,
  } = useRowFlashing({
    accountId: item.accountId,
    columns: item.columns,
    rows: item.rows,
    onUpdateCell,
    onUpdateHistoryEntry,
    onCommitCell,
    onSetRowCompany,
    onSetRowNoCompany,
  });

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

  const { scrollTargetRef, scrollToToday } = useScrollToToday({
    sheetId: sheet.id,
    today,
    currentMonth,
    sectionRef,
  });

  const { onShowMoreFutureClick, onShowMoreHistoryClick } =
    useRevealAnchorPreservation({
      extraHistory,
      extraFuture,
      historyPageSize: HISTORY_PAGE_SIZE,
      futurePageSize: FUTURE_PAGE_SIZE,
      setExtraHistory,
      setExtraFuture,
      scrollTargetRef,
    });

  const { todayButtonDirection, showTodayButton } = useVisibleMonthRange({
    sectionRef,
    visibleMonths,
    currentMonth,
    transactionSortOrder: settings.transactionSortOrder,
  });

  const { forceMountMonthKey } = useScrollToRowRequest({
    scrollToRowRequest,
    sheetId: sheet.id,
    currentMonth,
    startOfMonth: settings.startOfMonth,
    defaultHistoryMonths: DEFAULT_HISTORY_MONTHS,
    setExtraHistory,
  });

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
                    onSetRowCompany={handleSetRowCompany}
                    onSetRowNoCompany={handleSetRowNoCompany}
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
                    onCommitCell={handleCommitCell}
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
            companies={companies}
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
            tags={tags}
            companyTypeSuggestions={companyTypeSuggestions}
            settings={settings}
            onCreateType={onCreateType}
            onCreateCategory={onCreateCategory}
            onCreateCompany={onCreateCompany}
            onCreateTag={onCreateTag}
            onUpdateHistoryEntry={onUpdateHistoryEntry}
            onApplyMetadataToMatchingHistory={onApplyMetadataToMatchingHistory}
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
                onClick={() => {
                  unlock("timeTraveller");
                  scrollToToday("smooth");
                }}
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
