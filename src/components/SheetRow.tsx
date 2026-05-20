import { useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Pencil, Repeat, Tags, Trash2 } from "lucide-react";

import { findColumnByType, isRowSavable } from "../data/sheet";
import { useT } from "../i18n";
import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Row,
  Settings,
} from "../data/types";
import { useBlocksSheet } from "./useBlocksSheet";
import { Cell } from "./Cell";

type Props = {
  row: Row;
  columns: Column[];
  balances: Map<string, number>;
  types: readonly EntryType[];
  categories: readonly Category[];
  typeUsageById: ReadonlyMap<string, number>;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  settings: Settings;
  selectMode: boolean;
  selected: boolean;
  // Whether the transfer button on this row can be used. False when
  // the parent budget has no account attached (transfers need a known
  // source) — the button stays visible but disabled, with a tooltip
  // explaining why.
  canTransfer: boolean;
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
  onToggleSelect: (rowId: string) => void;
};

const SWIPE_THRESHOLD = 40;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_PX = 8;

export function SheetRow({
  row,
  columns,
  balances,
  types,
  categories,
  typeUsageById,
  onCreateType,
  settings,
  selectMode,
  selected,
  canTransfer,
  onUpdateCell,
  onCommitCell,
  onDeleteRequest,
  onEditRequest,
  onEditRowRequest,
  onTransactionRequest,
  onMatchRuleRequest,
  onEditHistoryRequest,
  onToggleSelect,
}: Props) {
  const tr = useT();
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
  // pattern as `AddRowButton` / `SheetTabs`: the timer fires after
  // LONG_PRESS_MS and `longPressTriggered` guards the trailing click
  // so the tap that produced the long-press doesn't also fire a cell
  // editor underneath the modal.
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

  // Expose the row's ISO date so SheetView's scroll-to-today can target
  // it directly. Skipped when the date cell is empty or non-string.
  const dateCol = findColumnByType(columns, "date");
  const isoDate =
    dateCol && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : undefined;

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
          typeUsageById={typeUsageById}
          onCreateType={onCreateType}
          isTransaction={isTransaction}
          peerName={row.peerAccountName ?? ""}
          outgoing={isOutgoing}
          isHistory={isHistory}
          hasFormula={typeof row.amountFormula === "string"}
          onChange={(value) => onUpdateCell(row.id, col.id, value)}
          onCommit={(value) => onCommitCell(row.id, col.id, value)}
        />
      ))}
      <td className="action-cell border-r border-b border-line bg-surface-3 p-0 text-center last:border-r-0">
        <div className="action-stack flex h-full w-full items-stretch">
          {!isTransaction && (
            <button
              type="button"
              className="action-btn action-btn-edit inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={isSeries ? "Edit recurring entry" : "Make recurring"}
              onClick={() => {
                setSwiped(false);
                onEditRequest(row);
              }}
            >
              <Repeat size={16} aria-hidden focusable={false} />
            </button>
          )}
          {isHistory && (
            <button
              type="button"
              className="action-btn action-btn-edit inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.labelByPattern")}
              title={tr("cell.labelByPatternTitle")}
              onClick={() => {
                setSwiped(false);
                onMatchRuleRequest(row);
              }}
            >
              <Tags size={16} aria-hidden focusable={false} />
            </button>
          )}
          {isHistory && (
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
          {!isHistory && (
            <button
              type="button"
              disabled={!transferEnabled}
              className="action-btn action-btn-transfer inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white disabled:cursor-not-allowed disabled:opacity-40 md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={
                isTransaction
                  ? tr("cell.editTransaction")
                  : canTransfer
                    ? tr("cell.makeTransaction")
                    : tr("cell.needAccountForTransfer")
              }
              title={
                !canTransfer
                  ? tr("cell.needAccountForTransfer")
                  : isTransaction
                    ? tr("cell.editTransaction")
                    : !transferEnabled
                      ? tr("cell.needDescAndAmount")
                      : undefined
              }
              onClick={() => {
                if (!transferEnabled) return;
                setSwiped(false);
                onTransactionRequest(row);
              }}
            >
              <ArrowLeftRight size={16} aria-hidden focusable={false} />
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
              onClick={() => onDeleteRequest(row)}
            >
              <Trash2 size={16} aria-hidden focusable={false} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
