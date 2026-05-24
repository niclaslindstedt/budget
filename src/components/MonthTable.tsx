import { Fragment, memo, useLayoutEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { findColumnByType, isTransferRow } from "../data/sheet";
import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Row,
  Settings,
} from "../data/types";
import { useNearViewport } from "../hooks";
import { type TFunction, useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import { formatNumber, withCurrency } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { AddRowButton } from "./AddRowButton";
import { SheetRow } from "./SheetRow";

type Props = {
  monthKey: string;
  rows: Row[];
  columns: Column[];
  balances: Map<string, number>;
  types: readonly EntryType[];
  categories: readonly Category[];
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  settings: Settings;
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  canTransfer: boolean;
  // Total cells in the data row, used as `colSpan` for the month-
  // header / placeholder / footer rows so a colSpan'd `<tr>` spans
  // the whole table width. Includes the leading select cell when
  // `selectMode` is on and the trailing action cell.
  totalCols: number;
  collapsed: boolean;
  // True when this month is fully covered by imported bank history.
  // The footer's "+ Add row" button is hidden in covered months — the
  // bank has authoritative data there, so a user-added row would
  // double-count.
  covered: boolean;
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
  // SheetView so a future "collapse all on sheet switch" stays a
  // single source of truth; MonthTable just reads-and-renders.
  expandedTransferAnchors: ReadonlySet<string>;
  onToggleTransferAnchor: (rowId: string) => void;
  onToggleRowTransfer: (row: Row) => void;
  onToggleCollapsed: () => void;
  // Bypass the viewport-proximity gate so the row tree always renders.
  // Used by SheetView when a scroll-to-row request targets this month —
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
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  onEditRowRequest: (row: Row) => void;
  onSplitRequest: (row: Row) => void;
  onTransactionRequest: (row: Row) => void;
  onMatchRuleRequest: (row: Row) => void;
  onEditHistoryRequest: (row: Row) => void;
  onCopyRequest: (row: Row) => void;
  onCorrectionDeleteRequest: (row: Row) => void;
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], targetSelected: boolean) => void;
};

const monthFormatCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFormatFor(lang: Lang): Intl.DateTimeFormat {
  let fmt = monthFormatCache.get(lang);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    monthFormatCache.set(lang, fmt);
  }
  return fmt;
}

function formatMonth(key: string, lang: Lang, t: TFunction): string {
  if (key === "undated") return t("sheet.undated");
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return monthFormatFor(lang).format(new Date(y, m - 1, 1));
}

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
  types,
  categories,
  onCreateType,
  onCreateCategory,
  settings,
  selectMode,
  selectedIds,
  canTransfer,
  totalCols,
  collapsed,
  covered,
  hideTransfers,
  expandedTransferAnchors,
  onToggleTransferAnchor,
  onToggleRowTransfer,
  onToggleCollapsed,
  forceMount = false,
  onUpdateCell,
  onCommitCell,
  onAddRow,
  onAddComplex,
  onDeleteRequest,
  onEditRequest,
  onEditRowRequest,
  onSplitRequest,
  onTransactionRequest,
  onMatchRuleRequest,
  onEditHistoryRequest,
  onCopyRequest,
  onCorrectionDeleteRequest,
  onToggleSelect,
  onToggleSelectMonth,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Track whether this month's tbody is near the viewport. When it
  // isn't, the data section renders a single height-matched
  // placeholder row instead of the full row tree — that keeps the DOM
  // small even after a search jump pulls 60+ months of history into
  // view.
  const headerTbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const dataTbodyRef = useRef<HTMLTableSectionElement | null>(null);
  // Cached actual height of the data tbody while rows are mounted.
  // Used as the placeholder height when the section next unmounts, so
  // the toggle is pixel-stable.
  const measuredHeightRef = useRef<number | null>(null);
  // Observe the always-mounted header tbody for viewport proximity so
  // collapsed / lazy-unmounted months can still flip back on without a
  // missing observation target.
  const nearViewport = useNearViewport(
    headerTbodyRef,
    MONTH_VIEWPORT_MARGIN_PX,
  );
  // When the hide-transfers setting is on, partition the month's
  // chronologically-sorted rows into the visible set (rendered as
  // normal SheetRows) and a map from each visible anchor to the
  // contiguous run of hidden transfer rows immediately preceding it.
  const { hiddenBefore } = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (!hideTransfers) return { hiddenBefore: map };
    let buffer: Row[] = [];
    for (const r of rows) {
      if (!r.isCorrection && isTransferRow(r)) {
        buffer.push(r);
      } else {
        if (buffer.length > 0) {
          map.set(r.id, buffer);
          buffer = [];
        }
      }
    }
    return { hiddenBefore: map };
  }, [rows, hideTransfers]);
  const selectableRowIds = rows
    .filter(
      (r) =>
        r.transactionId === undefined &&
        !r.isCorrection &&
        !(hideTransfers && isTransferRow(r)),
    )
    .map((r) => r.id);
  const amountCol = findColumnByType(columns, "amount");
  // `totalCols` includes the action cell and (in selectMode) the
  // leading select cell, so it works for the month-header /
  // placeholder / footer / correction-line colSpans verbatim.
  const correctionColSpan = totalCols;
  const allSelected =
    selectableRowIds.length > 0 &&
    selectableRowIds.every((id) => selectedIds.has(id));
  const someSelected =
    selectableRowIds.some((id) => selectedIds.has(id)) && !allSelected;
  // Tint the sticky header with the month's pastel — `undated` has no
  // calendar month so it stays on the neutral `fg-bright` colour.
  const headerMonthNum = monthNumberFromKey(monthKey);
  const headerColor =
    headerMonthNum !== null ? monthColorVar(headerMonthNum) : undefined;

  const monthLabel = formatMonth(monthKey, lang, t);
  // Count rows that would actually render so the placeholder matches
  // their combined height.
  const renderedRowCount = hideTransfers
    ? rows.reduce(
        (acc, r) => acc + (!r.isCorrection && isTransferRow(r) ? 0 : 1),
        0,
      )
    : rows.length;
  const placeholderHeight =
    measuredHeightRef.current ?? renderedRowCount * ESTIMATED_ROW_HEIGHT_PX;
  const renderRows = !collapsed && (forceMount || nearViewport);
  // Observe the data tbody only while real rows are mounted, and stamp
  // its latest height into `measuredHeightRef`.
  useLayoutEffect(() => {
    if (!renderRows) return;
    const el = dataTbodyRef.current;
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

  // Sticky positioning for the month-header row. Sits just below the
  // shared `<thead>` (sticky at `var(--app-header-h)`) so the column
  // labels stay visible as the user scrolls. `--sheet-thead-h` is set
  // on the wrapping div in `SheetView` and tracks the rendered height
  // of the column-header row so the month label parks exactly at its
  // bottom edge without overlap.
  const monthHeaderStickyClass =
    "sticky top-[calc(var(--app-header-h)+var(--sheet-thead-h,33px))] z-[18] bg-surface-2";

  return (
    <Fragment>
      <tbody ref={headerTbodyRef} data-month-key={monthKey}>
        <tr data-month-header>
          <td
            colSpan={totalCols}
            className={`${monthHeaderStickyClass} border-b border-line p-0`}
          >
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-expanded={!collapsed}
                aria-label={
                  collapsed
                    ? t("sheet.expandMonth", { month: monthLabel })
                    : t("sheet.collapseMonth", { month: monthLabel })
                }
                className={`flex flex-1 cursor-pointer items-center gap-1.5 border-0 bg-transparent pt-1.5 pb-1.5 pl-2 text-left text-xs font-bold tracking-wider uppercase hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:pl-3 ${
                  headerColor ? "" : "text-fg-bright"
                }`}
                style={headerColor ? { color: headerColor } : undefined}
              >
                {collapsed ? (
                  <ChevronRight size={14} aria-hidden focusable={false} />
                ) : (
                  <ChevronDown size={14} aria-hidden focusable={false} />
                )}
                <span>{monthLabel}</span>
              </button>
              {selectMode && (
                <button
                  type="button"
                  onClick={() =>
                    onToggleSelectMonth(selectableRowIds, !allSelected)
                  }
                  disabled={selectableRowIds.length === 0}
                  className="flex cursor-pointer items-center justify-center border-0 bg-transparent px-2.5 py-1.5 text-muted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:opacity-30"
                  aria-label={
                    allSelected
                      ? t("sheet.deselectAllInMonth")
                      : t("sheet.selectAllRowsInMonth")
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
              )}
            </div>
          </td>
        </tr>
      </tbody>
      {!collapsed && (
        <tbody ref={dataTbodyRef}>
          {!renderRows && (
            <tr aria-hidden="true">
              <td
                colSpan={totalCols}
                style={{ height: placeholderHeight }}
                className="border-b border-line p-0"
              />
            </tr>
          )}
          {renderRows &&
            rows.map((row) => {
              if (hideTransfers && !row.isCorrection && isTransferRow(row)) {
                return null;
              }
              if (row.isCorrection) {
                const amount =
                  amountCol && typeof row.cells[amountCol.id] === "number"
                    ? (row.cells[amountCol.id] as number)
                    : 0;
                return (
                  <CorrectionLine
                    key={row.id}
                    colSpan={correctionColSpan}
                    amount={amount}
                    settings={settings}
                    onClick={() => onCorrectionDeleteRequest(row)}
                  />
                );
              }
              const hiddenRun = hiddenBefore.get(row.id);
              const expanded =
                hiddenRun !== undefined && expandedTransferAnchors.has(row.id);
              return (
                <Fragment key={row.id}>
                  {expanded &&
                    hiddenRun !== undefined &&
                    hiddenRun.map((hidden) => (
                      <SheetRow
                        key={hidden.id}
                        row={hidden}
                        columns={columns}
                        balances={balances}
                        types={types}
                        categories={categories}
                        onCreateType={onCreateType}
                        onCreateCategory={onCreateCategory}
                        settings={settings}
                        selectMode={selectMode}
                        selected={selectedIds.has(hidden.id)}
                        canTransfer={canTransfer}
                        revealedTransfer
                        onUpdateCell={onUpdateCell}
                        onCommitCell={onCommitCell}
                        onDeleteRequest={onDeleteRequest}
                        onEditRequest={onEditRequest}
                        onEditRowRequest={onEditRowRequest}
                        onSplitRequest={onSplitRequest}
                        onTransactionRequest={onTransactionRequest}
                        onToggleRowTransfer={onToggleRowTransfer}
                        onMatchRuleRequest={onMatchRuleRequest}
                        onEditHistoryRequest={onEditHistoryRequest}
                        onCopyRequest={onCopyRequest}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                  <SheetRow
                    row={row}
                    columns={columns}
                    balances={balances}
                    types={types}
                    categories={categories}
                    onCreateType={onCreateType}
                    onCreateCategory={onCreateCategory}
                    settings={settings}
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
                    onDeleteRequest={onDeleteRequest}
                    onEditRequest={onEditRequest}
                    onEditRowRequest={onEditRowRequest}
                    onSplitRequest={onSplitRequest}
                    onTransactionRequest={onTransactionRequest}
                    onToggleRowTransfer={onToggleRowTransfer}
                    onMatchRuleRequest={onMatchRuleRequest}
                    onEditHistoryRequest={onEditHistoryRequest}
                    onCopyRequest={onCopyRequest}
                    onToggleSelect={onToggleSelect}
                  />
                </Fragment>
              );
            })}
        </tbody>
      )}
      {!collapsed && (
        <tbody>
          <tr data-month-footer>
            <td colSpan={totalCols} className="bg-surface-3 p-0">
              {covered ? (
                <div className="px-3 py-1.5 text-xs text-muted">
                  {t("sheet.historyCoversMonth")}
                </div>
              ) : (
                <AddRowButton onAdd={onAddRow} onComplex={onAddComplex} />
              )}
            </td>
          </tr>
        </tbody>
      )}
    </Fragment>
  );
}

// Memoized so SheetView re-renders (driven by other months, by typing
// in a single cell, or by a state flip elsewhere in the app) don't
// rebuild every month's row tree.
export const MonthTable = memo(MonthTableImpl);

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
          aria-label={t("sheet.correctionRemoveAria", {
            amount: `${sign}${magnitude}`,
          })}
          title={t("app.removeBalanceCorrection")}
          className="group flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-xs text-muted hover:text-fg-bright focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="whitespace-nowrap">
            {t("sheet.correctionLine")}{" "}
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
