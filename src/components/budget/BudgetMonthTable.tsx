import { Fragment, memo, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";

import {
  collectHiddenTransfersByAnchor,
  isTransferRow,
} from "../../data/budget/synthesis";
import { findColumnByType } from "../../data/sheet";
import type { CellValue, Column, Row, Settings } from "../../data/types";
import { useActionsCompaction, useNearViewport } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatMonthKey, formatNumber, withCurrency } from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { ActionsCompactContext } from "../ActionsCompactContext";
import { useModalDispatch } from "../modal-dispatch";
import { BudgetAddEntryButton } from "./BudgetAddEntryButton";
import { useBudgetContext } from "./BudgetContext";
import { BudgetColumnHeader } from "./BudgetColumnHeader";
import { BudgetRow } from "./BudgetRow";
import { OrphanIndicator } from "./OrphanIndicator";

type Props = {
  monthKey: string;
  rows: Row[];
  columns: Column[];
  balances: Map<string, number>;
  // Row-level company writer — see `BudgetRow.Props.onSetRowCompany`.
  // BudgetMonthTable is the only path that mounts rows, so the prop is
  // pure-passthrough here.
  onSetRowCompany: (row: Row, companyId: string | null) => void;
  // Row-level "omit company" writer — see `BudgetRow.Props.onSetRowNoCompany`.
  onSetRowNoCompany: (row: Row, next: boolean) => void;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  canTransfer: boolean;
  amountChars: number;
  balanceChars: number;
  collapsed: boolean;
  // True when this month is fully covered by imported bank history.
  // The footer's "+ Add row" button is hidden in covered months — the
  // bank has authoritative data there, so a user-added row would
  // double-count.
  covered: boolean;
  // Count of manual (non-history, non-correction, non-transfer) rows
  // that sit in this covered month — the orphans the reconciliation
  // matcher would flag. Used by the footer: a covered month with zero
  // orphans shows a green "all clear" indicator; one with N orphans
  // surfaces an orange pressable button that calls `onTriage` to open
  // the same triage modal the import flow uses.
  orphanCount: number;
  // Opens the orphan-triage modal for this month's manual rows. Wired
  // through from AppShell when `covered && orphanCount > 0`; otherwise
  // undefined (the green "all clear" indicator is not pressable).
  onTriage?: () => void;
  // True when the user has opted into hiding inter-account transfers
  // (a `Settings.hideTransfers` mirror). Rows flagged as transfers are
  // filtered out of the rendered tbody when this is on; the running
  // balance still includes their amounts because `computeBalances`
  // ran on the unfiltered set upstream. Each visible row whose
  // balance step crossed at least one hidden transfer surfaces a
  // small ↔ icon on its balance cell that toggles inline-expansion
  // via `onToggleTransferAnchor`.
  hideTransfers: boolean;
  // Anchor rows the user has expanded — their immediately preceding
  // hidden transfers render inline above the anchor. Lifted into
  // BudgetPage so a future "collapse all on sheet switch" stays a
  // single source of truth; BudgetMonthTable just reads-and-renders.
  expandedTransferAnchors: ReadonlySet<string>;
  onToggleTransferAnchor: (rowId: string) => void;
  onToggleRowTransfer: (row: Row) => void;
  onToggleRowIgnored: (row: Row) => void;
  onToggleCollapsed: () => void;
  // Bypass the viewport-proximity gate so the row tree always renders.
  // Used by BudgetPage when a scroll-to-row request targets this month —
  // the row only exists in the DOM (and so can be `querySelector`ed for
  // scrollIntoView) when it's actually been rendered. Defaults to false:
  // a far-from-viewport month with no forceMount renders only its
  // header + a height-preserving placeholder until the user scrolls
  // close enough that `useNearViewport` flips on.
  forceMount?: boolean;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddComplex: () => void;
  onSetFiscalMonthShift?: (row: Row, shift: -1 | 1 | null) => void;
  onReorderColumns: (fromId: string, toId: string) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
};

// Cold-start fallback for the placeholder height when a month has
// never been mounted (so we have no measured value yet). Roughly the
// typical line-height of a single row plus its cell padding. Used
// only on the very first placeholder render for any given section;
// once the rows mount once, `MonthTableImpl` caches the real tbody
// height and uses that instead — so a wrong estimate here can shift
// the layout exactly once per session-per-month, not on every
// IntersectionObserver toggle as it used to.
const ESTIMATED_ROW_HEIGHT_PX = 40;

// How far above and below the viewport the row tree should stay
// mounted. One viewport-height-ish keeps the rows the user is about to
// see ready without ballooning the DOM. A larger margin would render
// more rows at rest (defeating the optimization); a smaller one risks
// the placeholder still being there when the user scrolls past it.
const MONTH_VIEWPORT_MARGIN_PX = 1200;

function MonthTableImpl({
  monthKey,
  rows,
  columns,
  balances,
  onSetRowCompany,
  onSetRowNoCompany,
  selectMode,
  selectedIds,
  canTransfer,
  amountChars,
  balanceChars,
  collapsed,
  covered,
  orphanCount,
  onTriage,
  hideTransfers,
  expandedTransferAnchors,
  onToggleTransferAnchor,
  onToggleRowTransfer,
  onToggleRowIgnored,
  onToggleCollapsed,
  forceMount = false,
  onUpdateCell,
  onCommitCell,
  onAddRow,
  onAddComplex,
  onSetFiscalMonthShift,
  onReorderColumns,
  onToggleSelect,
  onToggleSelectMonth,
}: Props) {
  const t = useT();
  const lang = useLang();
  const dispatchModal = useModalDispatch();
  const { settings } = useBudgetContext();
  // Track whether this month's wrapper is near the viewport. When it
  // isn't, the tbody renders a single height-matched placeholder row
  // instead of the full row tree — that keeps the DOM small even after
  // a search jump pulls 60+ months of history into view.
  const sectionRef = useRef<HTMLElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  // Collapse the trailing action column to a lone ⋯ when the table would
  // otherwise overflow this month's wrapper on the desktop layout. The
  // flag both tags the table (CSS hides the inline pen / trash + header
  // label) and rides ActionsCompactContext into the row action menus so
  // they grow the Edit / Delete entries the strip no longer shows.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const actionsCompact = useActionsCompaction(wrapperRef);
  // Cached actual height of the tbody while rows are mounted. Used as
  // the placeholder height when the section next unmounts, so the
  // toggle is pixel-stable — without this, the placeholder fell back
  // on a 40px-per-row estimate that mismatched real row heights and
  // produced a 20-30px vertical scroll jump every time the viewport-
  // proximity gate flipped (#339).
  const measuredHeightRef = useRef<number | null>(null);
  const nearViewport = useNearViewport(sectionRef, MONTH_VIEWPORT_MARGIN_PX);
  // When the hide-transfers setting is on, group every run of hidden
  // transfer rows under the next visible anchor row's id. The map
  // powers the balance-cell ↔ icon: a non-empty run on an anchor
  // means at least one hidden transfer contributed to its running-
  // balance step, and clicking the icon reveals that run inline.
  const hiddenBefore = useMemo(
    () => collectHiddenTransfersByAnchor(rows, hideTransfers),
    [rows, hideTransfers],
  );
  // Synthesized transfer rows live in `rows` (the parent merges them
  // in) but they are not selectable for bulk operations — they aren't
  // real budget rows, so a delete or move that targets them would do
  // nothing. Correction rows render as a divider line rather than a
  // columned row, so a bulk-edit selection on one would have nothing to
  // act on either; both are filtered out of selection helpers.
  // Hidden transfer rows are also excluded from the bulk-select pool
  // even when revealed via the expand toggle — the user expressed an
  // explicit intent to suppress them, so they shouldn't be roped into
  // mass operations from the month header's "select all" checkbox.
  //
  // Single-pass over `rows` so a typical month (30+ rows) doesn't get
  // walked four times per render — once each for filter, map,
  // every, and some. Also derives `renderedRowCount` here so the
  // placeholder math below doesn't take another pass.
  const { selectableRowIds, allSelected, someSelected, renderedRowCount } =
    useMemo(() => {
      const ids: string[] = [];
      let selectedCount = 0;
      let visibleCount = 0;
      for (const r of rows) {
        const isTx = r.kind !== "correction" && isTransferRow(r);
        if (!(hideTransfers && isTx)) visibleCount++;
        if (r.kind === "transfer" || r.kind === "correction") continue;
        // Attributed cover itemizations are read-only — not selectable.
        if (r.coverRole === "attributed") continue;
        if (hideTransfers && isTx) continue;
        ids.push(r.id);
        if (selectedIds.has(r.id)) selectedCount++;
      }
      const total = ids.length;
      return {
        selectableRowIds: ids,
        allSelected: total > 0 && selectedCount === total,
        someSelected: selectedCount > 0 && selectedCount < total,
        renderedRowCount: visibleCount,
      };
    }, [rows, hideTransfers, selectedIds]);
  const amountCol = findColumnByType(columns, "amount");
  // Columns + action cell + (optional) select cell = total td count any
  // full-width row spans: the correction divider line, the lazy placeholder
  // stand-in, and the tfoot orphan indicator.
  const fullWidthColSpan = columns.length + 1 + (selectMode ? 1 : 0);
  // Tint the sticky header with the month's pastel — `undated` has no
  // calendar month so it stays on the neutral `fg-bright` colour.
  const headerMonthNum = monthNumberFromKey(monthKey);
  const headerColor =
    headerMonthNum !== null ? monthColorVar(headerMonthNum) : undefined;

  const monthLabel = formatMonthKey(monthKey, lang, t("budget.undated"));
  // `renderedRowCount` (number of rows that would actually render after
  // the hide-transfers filter) is computed in the single-pass useMemo
  // above so the placeholder math doesn't take another walk over `rows`.
  // Prefer the cached measured height — every previous mount of this
  // section has stamped its actual tbody height into the ref, so the
  // placeholder size matches the rows it replaces to the pixel. Fall
  // back to the row-count × per-row estimate only on the very first
  // unmount, before the section has had a chance to be measured.
  const placeholderHeight =
    measuredHeightRef.current ?? renderedRowCount * ESTIMATED_ROW_HEIGHT_PX;
  // Skip building the row tree when the month is collapsed (the
  // existing optimization) OR when the month is far from viewport
  // and no force-mount override is in play. `forceMount` wins so a
  // scroll-to-row request always materializes its target.
  const renderRows = !collapsed && (forceMount || nearViewport);
  // Observe the tbody only while real rows are mounted, and stamp its
  // latest height into `measuredHeightRef`. The observer fires once
  // on attach (initial size) and again whenever a content edit, a
  // density / font-scale change, or a hide-transfers toggle changes
  // the layout — so the cache stays fresh for whatever the next
  // unmount needs to substitute. useLayoutEffect (not useEffect): the
  // cleanup must disconnect the observer between commit and layout
  // when `renderRows` flips false; otherwise the observer would fire
  // once more for the placeholder's own height — overwriting the
  // cached real-row height with the placeholder's (and breaking the
  // pixel-stable swap on the next toggle).
  useLayoutEffect(() => {
    if (!renderRows) return;
    const el = tbodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const h = e.contentRect.height;
        if (h > 0) measuredHeightRef.current = h;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [renderRows]);
  return (
    <section ref={sectionRef}>
      <h3
        className={`sticky top-[var(--app-header-h)] z-20 bg-page-bg text-xs font-bold tracking-wider uppercase ${
          headerColor ? "" : "text-fg-bright"
        }`}
        style={headerColor ? { color: headerColor } : undefined}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t("budget.expandMonth", { month: monthLabel })
              : t("budget.collapseMonth", { month: monthLabel })
          }
          className="flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent pt-1 pb-1 pl-2 text-left text-[inherit] font-bold tracking-wider uppercase hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:pt-2 md:pb-2 md:pl-3"
        >
          {collapsed ? (
            <ChevronRight size={14} aria-hidden focusable={false} />
          ) : (
            <ChevronDown size={14} aria-hidden focusable={false} />
          )}
          <span>{monthLabel}</span>
        </button>
      </h3>
      <div
        ref={wrapperRef}
        hidden={collapsed}
        className={`overflow-clip rounded border border-line bg-surface ${
          selectMode ? "budget-table-selecting" : ""
        }`}
        style={
          {
            "--amount-col-ch": amountChars,
            "--balance-col-ch": balanceChars,
            // Mobile amount column buffer. Currency-after swaps the
            // input's right padding from px-2.5 (0.625rem) to pr-8
            // (2rem) so the currency overlay has room at right-2;
            // widen the buffer to match. Otherwise the default
            // 2.125rem from styles.css mirrors the mirror's natural
            // pl-6 + px-2.5_right so the column hugs its text.
            "--amount-col-buffer":
              settings.showCurrency && settings.currencyPosition === "after"
                ? "3rem"
                : undefined,
            // Mobile balance column buffer. Currency-before renders the
            // symbol absolute-positioned at the cell's left edge while
            // the number stays right-aligned, so a tight column collapses
            // the visual gap between the two. Widen the buffer in that
            // mode to keep the symbol and the number from hugging each
            // other; currency-after (and no-currency) keep the tighter
            // 1.5rem default sized in styles.css.
            "--balance-col-buffer":
              settings.showCurrency && settings.currencyPosition === "before"
                ? "3rem"
                : undefined,
          } as React.CSSProperties
        }
      >
        <ActionsCompactContext.Provider value={actionsCompact}>
          <table
            className={`swipe-table budget-table w-full border-collapse text-sm md:text-[13px] ${
              selectMode ? "is-selecting" : ""
            } ${actionsCompact ? "actions-compact" : ""}`}
          >
            <thead>
              <tr>
                {selectMode && (
                  <th
                    scope="col"
                    className="select-cell bg-surface-3 text-center"
                    aria-label={t("budget.selectAllInMonth")}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onToggleSelectMonth(selectableRowIds, !allSelected)
                      }
                      disabled={selectableRowIds.length === 0}
                      className="flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-1.5 text-muted disabled:opacity-30"
                      aria-label={
                        allSelected
                          ? t("budget.deselectAllInMonth")
                          : t("budget.selectAllRowsInMonth")
                      }
                      aria-pressed={allSelected}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded border text-xs ${
                          allSelected
                            ? "border-accent bg-accent text-page-bg"
                            : someSelected
                              ? "border-accent text-accent"
                              : "border-muted"
                        }`}
                      >
                        {allSelected ? "✓" : someSelected ? "–" : ""}
                      </span>
                    </button>
                  </th>
                )}
                {columns.map((col) => (
                  <BudgetColumnHeader
                    key={col.id}
                    column={col}
                    onReorder={onReorderColumns}
                  />
                ))}
                <th
                  scope="col"
                  className="swipe-action-cell action-cell w-8 border-b border-line bg-surface-3 text-xs font-bold tracking-wider text-muted uppercase whitespace-nowrap"
                  aria-label={t("budget.rowActions")}
                >
                  <span className="column-header-cell flex items-center justify-center gap-1.5 px-[var(--table-cell-px)] py-[var(--table-cell-py)] md:gap-2">
                    <Wrench
                      size={16}
                      className="shrink-0 text-accent"
                      aria-hidden
                      focusable={false}
                    />
                    <span className="column-header-label action-header-label hidden md:inline">
                      {t("budget.actions")}
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody ref={tbodyRef}>
              {/* Skip building the row tree entirely when the month is
               collapsed, OR when it sits far enough from the viewport
               that the user can't see it. The container above is
               `hidden` for collapsed; the placeholder branch below
               keeps the section height stable for the viewport-lazy
               case so scrolling doesn't jump as months load and
               unload. Building 1000s of cells worth of vnodes for a
               month nobody can see is pure overhead and used to
               dominate the work when many years of history were
               revealed via "Show more" or a search jump. */}
              {!renderRows && !collapsed && (
                <tr aria-hidden="true">
                  <td
                    colSpan={fullWidthColSpan}
                    style={{ height: placeholderHeight }}
                    className="border-b border-line p-0"
                  />
                </tr>
              )}
              {renderRows &&
                rows.map((row) => {
                  // Skip hidden transfers — they're rendered inline above
                  // their anchor when the anchor's expand toggle is on.
                  if (
                    hideTransfers &&
                    row.kind !== "correction" &&
                    isTransferRow(row)
                  ) {
                    return null;
                  }
                  if (row.kind === "correction") {
                    const amount =
                      amountCol && typeof row.cells[amountCol.id] === "number"
                        ? (row.cells[amountCol.id] as number)
                        : 0;
                    return (
                      <CorrectionLine
                        key={row.id}
                        colSpan={fullWidthColSpan}
                        amount={amount}
                        settings={settings}
                        onClick={() =>
                          dispatchModal({ kind: "open-correction-delete", row })
                        }
                      />
                    );
                  }
                  const hiddenRun = hiddenBefore.get(row.id);
                  const expanded =
                    hiddenRun !== undefined &&
                    expandedTransferAnchors.has(row.id);
                  return (
                    <Fragment key={row.id}>
                      {expanded &&
                        hiddenRun !== undefined &&
                        hiddenRun.map((hidden) => (
                          <BudgetRow
                            key={hidden.id}
                            row={hidden}
                            columns={columns}
                            balances={balances}
                            onSetRowCompany={onSetRowCompany}
                            onSetRowNoCompany={onSetRowNoCompany}
                            selectMode={selectMode}
                            selected={selectedIds.has(hidden.id)}
                            canTransfer={canTransfer}
                            revealedTransfer
                            onUpdateCell={onUpdateCell}
                            onCommitCell={onCommitCell}
                            onToggleRowTransfer={onToggleRowTransfer}
                            onToggleRowIgnored={onToggleRowIgnored}
                            onSetFiscalMonthShift={onSetFiscalMonthShift}
                            onToggleSelect={onToggleSelect}
                          />
                        ))}
                      <BudgetRow
                        row={row}
                        columns={columns}
                        balances={balances}
                        onSetRowCompany={onSetRowCompany}
                        onSetRowNoCompany={onSetRowNoCompany}
                        selectMode={selectMode}
                        selected={selectedIds.has(row.id)}
                        canTransfer={canTransfer}
                        hiddenTransferCount={hiddenRun?.length ?? 0}
                        transferExpanded={expanded}
                        onToggleTransferAnchor={() =>
                          onToggleTransferAnchor(row.id)
                        }
                        onUpdateCell={onUpdateCell}
                        onCommitCell={onCommitCell}
                        onToggleRowTransfer={onToggleRowTransfer}
                        onToggleRowIgnored={onToggleRowIgnored}
                        onSetFiscalMonthShift={onSetFiscalMonthShift}
                        onToggleSelect={onToggleSelect}
                      />
                    </Fragment>
                  );
                })}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={fullWidthColSpan}
                  className="border-r-0 bg-surface-3 p-0"
                >
                  {covered ? (
                    <OrphanIndicator
                      orphanCount={orphanCount}
                      onTriage={onTriage}
                    />
                  ) : (
                    <BudgetAddEntryButton
                      onAdd={onAddRow}
                      onComplex={onAddComplex}
                    />
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </ActionsCompactContext.Provider>
      </div>
    </section>
  );
}

// Memoized so BudgetPage re-renders (driven by other months, by typing
// in a single cell, or by a state flip elsewhere in the app) don't
// rebuild every month's row tree. Shallow compare suffices — BudgetPage
// memoizes the per-month `rows` array (via `sortedMonthGroups`) and the
// other props are stable references coming from the workspace data.
export const BudgetMonthTable = memo(MonthTableImpl);

// One-row stand-in for a balance-correction Row. Renders as a single
// full-width <td> showing "——— balance correction ±X kr ———" — no
// columns, no action buttons. The whole line is a button so clicking
// it opens the delete-confirmation prompt (the parent handler shows a
// ConfirmDialog and dispatches the actual deletion).
function CorrectionLine({
  colSpan,
  amount,
  settings,
  onClick,
}: {
  colSpan: number;
  amount: number;
  settings: Settings;
  onClick: () => void;
}) {
  const t = useT();
  const sign = amount >= 0 ? "+" : "−";
  const magnitude = withCurrency(
    formatNumber(Math.abs(amount), settings),
    settings,
  );
  const amountClass = amount >= 0 ? "text-positive" : "text-negative";
  return (
    <tr className="correction-row">
      <td colSpan={colSpan} className="border-b border-line bg-surface p-0">
        <button
          type="button"
          onClick={onClick}
          aria-label={t("budget.correctionRemoveAria", {
            amount: `${sign}${magnitude}`,
          })}
          title={t("app.removeBalanceCorrection")}
          className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-xs text-muted hover:text-fg-bright focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="whitespace-nowrap">
            {t("budget.correctionLine")}{" "}
            <span className={`font-mono tabular-nums ${amountClass}`}>
              {sign}
              {magnitude}
            </span>
          </span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </button>
      </td>
    </tr>
  );
}
