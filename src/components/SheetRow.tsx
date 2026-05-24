import { memo, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";

import { findColumnByType, isRowSavable } from "../data/sheet";
import { useLang, useT } from "../i18n";
import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Row,
  Settings,
} from "../data/types";
import { formatShortDate } from "../utils/format";
import { monthColorVar, monthNumberFromKey } from "../utils/monthColor";
import { useBlocksSheet } from "./useBlocksSheet";
import { Cell } from "./Cell";
import { RowActionsMenu } from "./RowActionsMenu";

type Props = {
  row: Row;
  columns: Column[];
  balances: Map<string, number>;
  types: readonly EntryType[];
  categories: readonly Category[];
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  settings: Settings;
  selectMode: boolean;
  selected: boolean;
  // Whether the transfer button on this row can be used. False when
  // the parent budget has no account attached (transfers need a known
  // source) — the button stays visible but disabled, with a tooltip
  // explaining why.
  canTransfer: boolean;
  // Number of hidden transfer rows that immediately precede this row
  // in chronological order (i.e. that contributed to the visible
  // running balance step at this row). When > 0, the balance cell
  // renders a small ↔ icon button; clicking it fires
  // `onToggleTransferAnchor` so MonthTable reveals the hidden run
  // inline above this row. 0 (the default) means no icon.
  hiddenTransferCount?: number;
  transferExpanded?: boolean;
  onToggleTransferAnchor?: () => void;
  // True when this row is itself a hidden transfer being revealed
  // inline above its anchor. The row renders with a muted background
  // so the user can tell at a glance it's not part of the normal
  // visible stream. No other behaviour changes — the action buttons
  // remain available so the user can unmark the transfer in place.
  revealedTransfer?: boolean;
  // Flip the row's `isTransfer` flag. The eye-toggle action button
  // dispatches this for budget rows (synth transactions and history
  // rows manage their transfer status through other paths and don't
  // get the button).
  onToggleRowTransfer?: (row: Row) => void;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Fires after the user finishes editing a cell (blur / discrete select).
  // Used to prompt for series-wide propagation on recurring rows; the
  // parent ignores the signal for one-off rows.
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  onDeleteRequest: (row: Row) => void;
  onEditRequest: (row: Row) => void;
  // Opens the generic edit-row modal that edits every field at once.
  // Fired by the pen action button and by long-pressing the row.
  // Suppressed for synthesized rows (transactions / history) since
  // those have their own edit flows.
  onEditRowRequest: (row: Row) => void;
  // Opens the split modal for the row. Works on both authored budget
  // rows and synthesized history rows — splitting a bank entry writes
  // a `HistoryEntry.splits` array that the synthesizer fans out into
  // one row per split. Suppressed only for transaction rows (those
  // have a dedicated edit modal) and correction lines.
  onSplitRequest: (row: Row) => void;
  onTransactionRequest: (row: Row) => void;
  // Fires when the user clicks the pattern button on a synthesized
  // history row. Opens the wildcard rule modal seeded from the row's
  // bank text; ignored when called on non-history rows since the
  // button only renders there.
  onMatchRuleRequest: (row: Row) => void;
  // Fires when the user clicks the pen button on a synthesized history
  // row. Opens the per-entry edit modal — description + type, plus
  // the original bank text for reference. The button only renders on
  // history rows; called on a non-history row, the parent guards the
  // dispatch.
  onEditHistoryRequest: (row: Row) => void;
  // Open the copy modal seeded with just this row. The modal is
  // shared with the bulk-select toolbar — single-row copy goes through
  // the same dispatch path with a one-element rowIds array. Moving a
  // row to another month is done by editing its date cell.
  onCopyRequest: (row: Row) => void;
  onToggleSelect: (rowId: string) => void;
};

const SWIPE_THRESHOLD = 40;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 8;

function SheetRowImpl({
  row,
  columns,
  balances,
  types,
  categories,
  onCreateType,
  onCreateCategory,
  settings,
  selectMode,
  selected,
  canTransfer,
  hiddenTransferCount = 0,
  transferExpanded = false,
  onToggleTransferAnchor,
  revealedTransfer = false,
  onToggleRowTransfer,
  onUpdateCell,
  onCommitCell,
  onDeleteRequest,
  onEditRequest,
  onEditRowRequest,
  onSplitRequest,
  onTransactionRequest,
  onMatchRuleRequest,
  onEditHistoryRequest,
  onCopyRequest,
  onToggleSelect,
}: Props) {
  const tr = useT();
  const lang = useLang();
  const entryType = useMemo<EntryType | null>(
    () =>
      row.typeId ? (types.find((t) => t.id === row.typeId) ?? null) : null,
    [row.typeId, types],
  );
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);
  // Long-press → open the generic edit-row modal. Same coordinator
  // pattern as `AddRowButton` / `BottomBar`'s sheet tabs: the timer
  // fires after LONG_PRESS_MS and `longPressTriggered` guards the
  // trailing click so the tap that produced the long-press doesn't
  // also fire a cell editor underneath the modal.
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const longPressStartX = useRef(0);
  const longPressStartY = useRef(0);

  // A swiped row exposes destructive action buttons; mark it active so
  // a tap outside only dismisses the swipe instead of also firing the
  // button that was tapped.
  useBlocksSheet(row.id, swiped, () => setSwiped(false));

  const completedCol = findColumnByType(columns, "completed");
  const isCompleted =
    completedCol !== undefined && row.cells[completedCol.id] === true;
  const isSeries = !!row.seriesId;
  const isTransaction = !!row.transactionId;
  const isHistory = !!row.historyEntryId;
  // The transfer button needs both a savable row (so we know an amount
  // and description exist to promote) AND a parent budget with a known
  // account. Synthesized transaction rows skip the savable check —
  // they're already a transaction, so the button takes the user to the
  // edit modal instead of promoting.
  const transferEnabled =
    canTransfer && (isTransaction || isRowSavable(row, columns));
  // Direction for a synthesized transaction row: negative amount means
  // money flows OUT of this budget's account. The Cell renderer uses
  // this to pick the right arrow glyph for the description cell.
  const amountCol = findColumnByType(columns, "amount");
  const amountValue =
    amountCol !== undefined ? row.cells[amountCol.id] : undefined;
  const isOutgoing =
    isTransaction && typeof amountValue === "number" && amountValue < 0;
  // Sign hint for the type column's TypePicker. Only meaningful when
  // the row carries a non-zero numeric amount — zero / empty rows
  // are still ambiguous so the picker shows every type.
  const amountSign: "positive" | "negative" | "any" =
    typeof amountValue === "number" && amountValue > 0
      ? "positive"
      : typeof amountValue === "number" && amountValue < 0
        ? "negative"
        : "any";

  // Expose the row's ISO date so SheetView's scroll-to-today can target
  // it directly. Skipped when the date cell is empty or non-string.
  const dateCol = findColumnByType(columns, "date");
  const isoDate =
    dateCol && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : undefined;

  // Pre-render the date + description that the type column's
  // TypePicker echoes inside its dropdown header. The header keeps
  // that context visible even though the dropdown physically overlaps
  // the date and description columns on mobile. Pre-computed here so
  // the picker stays decoupled from the user's date-format setting.
  const descriptionCol = findColumnByType(columns, "description");
  const rowDescription =
    descriptionCol && typeof row.cells[descriptionCol.id] === "string"
      ? (row.cells[descriptionCol.id] as string)
      : "";
  const rowDateFormatted = isoDate
    ? formatShortDate(isoDate, settings.shortDateFormat, lang)
    : "";
  const rowDateMonthNum = isoDate ? monthNumberFromKey(isoDate) : null;
  const rowDateColor =
    rowDateMonthNum !== null ? monthColorVar(rowDateMonthNum) : undefined;

  const onTouchStart = (e: React.TouchEvent) => {
    if (selectMode) return;
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    moved.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (selectMode) return;
    if (startX.current === null || startY.current === null) return;
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      moved.current = true;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (selectMode) return;
    if (startX.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const dx = endX - startX.current;
    startX.current = null;
    startY.current = null;
    if (!moved.current) return;
    if (dx < -SWIPE_THRESHOLD) setSwiped(true);
    else if (dx > SWIPE_THRESHOLD) setSwiped(false);
  };

  // Synthesized rows have their own edit affordances (TransactionModal
  // for transactions, the promote flow for history) and balance-
  // correction rows are display-only — long-press is a no-op on all of
  // them. The select-mode tap toggles selection so we leave it alone
  // there too.
  const longPressEligible =
    !selectMode && !isTransaction && !isHistory && !row.isCorrection;

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLTableRowElement>) {
    if (!longPressEligible) return;
    if (e.button !== 0) return;
    // Action-cell taps and select-cell taps drive their own handlers —
    // starting a long-press there would race with the button click and
    // pop the modal on top of whatever action the user meant to fire.
    // Inputs / buttons / textareas inside data cells are skipped too so
    // a tap on a description input still focuses the field, a tap on a
    // category chip still opens its picker, and iOS's text-selection
    // long-press inside an input keeps working. The pen button stays
    // available for users who want the modal from inside a cell.
    const target = e.target as HTMLElement;
    if (
      target.closest(".action-cell") ||
      target.closest("[data-select-cell]") ||
      target.closest("input, textarea, select, button")
    ) {
      return;
    }
    longPressTriggered.current = false;
    longPressStartX.current = e.clientX;
    longPressStartY.current = e.clientY;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      longPressTimer.current = null;
      setSwiped(false);
      onEditRowRequest(row);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent<HTMLTableRowElement>) {
    if (longPressTimer.current === null) return;
    const dx = e.clientX - longPressStartX.current;
    const dy = e.clientY - longPressStartY.current;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_PX) clearLongPress();
  }

  function onPointerUp() {
    clearLongPress();
  }

  function onContextMenu(e: React.MouseEvent<HTMLTableRowElement>) {
    if (!longPressEligible) return;
    // Right-click on desktop opens the same modal — mirrors the
    // sheet-tab / add-row affordance so power users don't have to wait
    // out the long-press timer. Skipped on action / select cells and
    // on interactive cell controls for the same reason `onPointerDown`
    // skips them: the native context menu (or the cell's own handler)
    // should win there.
    const target = e.target as HTMLElement;
    if (
      target.closest(".action-cell") ||
      target.closest("[data-select-cell]") ||
      target.closest("input, textarea, select, button")
    ) {
      return;
    }
    e.preventDefault();
    clearLongPress();
    longPressTriggered.current = true;
    setSwiped(false);
    onEditRowRequest(row);
  }

  function onClickCapture(e: React.MouseEvent<HTMLTableRowElement>) {
    // Long-press triggered while the pointer was still down — the
    // following click would otherwise reach the cell underneath and
    // open its inline editor on top of the modal. Swallow it here in
    // the capture phase so descendants never see it.
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  const rowClass = [
    swiped && !selectMode ? "is-swiped" : "",
    isCompleted ? "is-completed" : "",
    isSeries ? "is-series" : "",
    selectMode ? "is-selecting-row" : "",
    selected ? "is-selected" : "",
    revealedTransfer ? "is-revealed-transfer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (!selectMode) return;
    // Don't double-toggle when the click originated from the checkbox itself.
    const target = e.target as HTMLElement;
    if (target.closest("[data-select-cell]")) return;
    onToggleSelect(row.id);
  };

  return (
    <tr
      className={rowClass}
      data-row-id={row.id}
      data-row-date={isoDate}
      data-swipe-handled
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onClick={handleRowClick}
      onClickCapture={onClickCapture}
      onContextMenu={onContextMenu}
      aria-selected={selectMode ? selected : undefined}
    >
      {selectMode && (
        <td
          data-select-cell
          className="select-cell border-r border-b border-line bg-surface-3 p-0 text-center"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(row.id);
            }}
            className={`flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-1.5 ${
              selected ? "text-accent" : "text-muted"
            }`}
            aria-label={selected ? "Deselect row" : "Select row"}
            aria-pressed={selected}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded border ${
                selected
                  ? "border-accent bg-accent text-page-bg"
                  : "border-muted"
              }`}
            >
              {selected ? "✓" : ""}
            </span>
          </button>
        </td>
      )}
      {columns.map((col) => (
        <Cell
          key={col.id}
          rowId={row.id}
          column={col}
          value={row.cells[col.id] ?? null}
          computedBalance={
            col.type === "balance" ? balances.get(row.id) : undefined
          }
          settings={settings}
          isRecurring={isSeries}
          entryType={entryType}
          types={types}
          categories={categories}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          isTransaction={isTransaction}
          peerName={row.peerAccountName ?? ""}
          outgoing={isOutgoing}
          isHistory={isHistory}
          hasFormula={typeof row.amountFormula === "string"}
          hiddenTransferCount={col.type === "balance" ? hiddenTransferCount : 0}
          transferExpanded={col.type === "balance" ? transferExpanded : false}
          onToggleTransferAnchor={
            col.type === "balance" ? onToggleTransferAnchor : undefined
          }
          amountSign={col.type === "type" ? amountSign : undefined}
          rowDate={col.type === "type" ? rowDateFormatted : undefined}
          rowDateColor={col.type === "type" ? rowDateColor : undefined}
          rowDescription={col.type === "type" ? rowDescription : undefined}
          onUpdateCell={onUpdateCell}
          onCommitCell={onCommitCell}
        />
      ))}
      <td className="action-cell border-r border-b border-line bg-surface-3 p-0 text-center last:border-r-0">
        <div className="action-stack flex h-full w-full items-stretch">
          {isTransaction && (
            <button
              type="button"
              disabled={!transferEnabled}
              className="action-btn action-btn-transfer inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white disabled:cursor-not-allowed disabled:opacity-40 md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.editTransaction")}
              title={tr("cell.editTransaction")}
              onClick={() => {
                if (!transferEnabled) return;
                setSwiped(false);
                onTransactionRequest(row);
              }}
            >
              <ArrowLeftRight size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransaction && isHistory && (
            <button
              type="button"
              className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.editHistoryEntry")}
              title={tr("cell.editHistoryEntry")}
              onClick={() => {
                setSwiped(false);
                onEditHistoryRequest(row);
              }}
            >
              <Pencil size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransaction && !isHistory && (
            <button
              type="button"
              className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.editRow")}
              onClick={() => {
                setSwiped(false);
                onEditRowRequest(row);
              }}
            >
              <Pencil size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransaction && !isHistory && (
            <button
              type="button"
              className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
              aria-label={tr("cell.deleteRow")}
              title={tr("cell.deleteRow")}
              onClick={() => {
                setSwiped(false);
                onDeleteRequest(row);
              }}
            >
              <Trash2 size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransaction && isHistory && (
            <span
              aria-hidden
              title={tr("cell.cannotDeleteHistory")}
              className="action-btn action-btn-delete-disabled inline-flex h-full flex-1 cursor-not-allowed items-center justify-center border-0 bg-transparent p-2 text-muted opacity-40"
            >
              <span className="relative inline-flex">
                <Trash2 size={16} aria-hidden focusable={false} />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="block h-px w-5 rotate-45 bg-current" />
                </span>
              </span>
            </span>
          )}
          {!isTransaction && (
            <RowActionsMenu
              row={row}
              isHistory={isHistory}
              isSeries={isSeries}
              canTransfer={canTransfer}
              transferEnabled={transferEnabled}
              onEditRequest={onEditRequest}
              onMatchRuleRequest={onMatchRuleRequest}
              onTransactionRequest={onTransactionRequest}
              onToggleRowTransfer={onToggleRowTransfer}
              onSplitRequest={onSplitRequest}
              onCopyRequest={onCopyRequest}
              onAction={() => setSwiped(false)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// Memoized so a state change on one row (cell focus, popover open,
// selection toggle) doesn't re-render every other row in the sheet —
// see the matching `memo` on `Cell` for the broader rationale.
export const SheetRow = memo(SheetRowImpl);
