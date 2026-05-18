import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Repeat, Trash2 } from "lucide-react";

import { findColumnByType, isRowSavable } from "../data/sheet";
import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Row,
  Settings,
} from "../data/types";
import { useActiveRow } from "./useActiveRow";
import { Cell } from "./Cell";

type Props = {
  row: Row;
  columns: Column[];
  balances: Map<string, number>;
  categories: Category[];
  types: readonly EntryType[];
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
  onTransactionRequest: (row: Row) => void;
  onToggleSelect: (rowId: string) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

const SWIPE_THRESHOLD = 40;

export function SheetRow({
  row,
  columns,
  balances,
  categories,
  types,
  settings,
  selectMode,
  selected,
  canTransfer,
  onUpdateCell,
  onCommitCell,
  onDeleteRequest,
  onEditRequest,
  onTransactionRequest,
  onToggleSelect,
  onCreateCategory,
}: Props) {
  const entryType = useMemo<EntryType | null>(
    () =>
      row.typeId ? (types.find((t) => t.id === row.typeId) ?? null) : null,
    [row.typeId, types],
  );
  const [swiped, setSwiped] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);
  const activeRow = useActiveRow();

  // A swiped row exposes destructive action buttons; treat it as an
  // active state so a click outside only dismisses the swipe instead of
  // also firing the button that was tapped.
  useEffect(() => {
    if (!swiped || !activeRow) return;
    const token = activeRow.activate(row.id, () => setSwiped(false));
    return () => activeRow.deactivate(token);
  }, [swiped, activeRow, row.id]);

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
      onClick={handleRowClick}
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
          categories={categories}
          settings={settings}
          isRecurring={isSeries}
          entryType={entryType}
          isTransaction={isTransaction}
          peerName={row.peerAccountName ?? ""}
          outgoing={isOutgoing}
          isHistory={isHistory}
          onChange={(value) => onUpdateCell(row.id, col.id, value)}
          onCommit={(value) => onCommitCell(row.id, col.id, value)}
          onCreateCategory={onCreateCategory}
        />
      ))}
      <td className="action-cell border-r border-b border-line bg-surface-3 p-0 text-center last:border-r-0">
        <div className="action-stack flex h-full w-full items-stretch">
          {!isTransaction && !isHistory && (
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
          {!isHistory && (
            <button
              type="button"
              disabled={!transferEnabled}
              className="action-btn action-btn-transfer inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white disabled:cursor-not-allowed disabled:opacity-40 md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={
                isTransaction
                  ? "Edit transaction"
                  : canTransfer
                    ? "Make transaction"
                    : "Attach this budget to an account to enable transfers"
              }
              title={
                !canTransfer
                  ? "Attach this budget to an account to enable transfers"
                  : isTransaction
                    ? "Edit transaction"
                    : !transferEnabled
                      ? "Set a description and amount first"
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
              className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
              aria-label="Delete row"
              onClick={() => onDeleteRequest(row)}
            >
              <Trash2 size={16} aria-hidden focusable={false} />
            </button>
          )}
          {isHistory && (
            <span className="action-btn inline-flex h-full flex-1 items-center justify-center p-2 text-muted opacity-60">
              <Repeat size={16} aria-hidden focusable={false} />
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
