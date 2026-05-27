import { memo } from "react";
import { Check } from "lucide-react";

import type {
  Category,
  CellValue,
  Column,
  EntryType,
  Settings,
} from "../../data/types";
import { AmountCell } from "./cells/AmountCell";
import { AmountCellDisplay } from "./cells/AmountCellDisplay";
import { BalanceCell } from "./cells/BalanceCell";
import { ReadonlyCompletedCell } from "./cells/CompletedCell";
import { CELL_BASE } from "./cells/constants";
import { DateCell, ReadonlyDateCell } from "./cells/DateCell";
import {
  DescriptionCell,
  TransferDescriptionCell,
} from "./cells/DescriptionCell";
import { ReadonlyTypeCell, TypePickerCell } from "./cells/TypeCell";

type Props = {
  rowId: string;
  column: Column;
  value: CellValue;
  computedBalance?: number;
  settings: Settings;
  isRecurring?: boolean;
  // Resolved EntryType for `row.typeId`. Drives the dedicated `type`
  // column's picker / readonly chip, and — on recurring rows — the
  // description cell, which collapses down to a chip in the type's
  // color (a clearer at-a-glance identifier than the recurring-arrow
  // glyph) with the description tucked into a popover behind it.
  entryType?: EntryType | null;
  // Selectable entry types + categories, threaded through for the `type`
  // column's picker. Optional because synthesized / readonly variants
  // never reach the editable branch where they'd be consulted.
  types?: readonly EntryType[];
  categories?: readonly Category[];
  onCreateType?: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory?: (draft: Omit<Category, "id">) => Category;
  // True when this row is a synthesized side of a Transfer. Disables
  // every editor (the row is sourced from `data.transfers`, not the
  // budget's `item.rows`) and swaps the description leading glyph to a
  // transfer indicator. The `peerName` / `outgoing` props feed the
  // direction arrow and "→ Savings" prefix in the description cell.
  isTransfer?: boolean;
  peerName?: string;
  outgoing?: boolean;
  // True when this row is a synthesized projection of an imported
  // bank-statement entry. Disables every editor (the source data
  // lives in `data.history`, not the budget's rows) and renders the
  // description cell as plain readonly text — no transfer arrow,
  // no peer name. The action column hides edit/delete buttons too,
  // gated upstream in BudgetRow.
  isHistory?: boolean;
  // True when the row carries an `amountFormula`. The amount cell
  // becomes read-only (the value comes from the formula resolver) and
  // surfaces a small `fx` glyph so the user can tell at a glance that
  // the number isn't a literal entry. Editing the formula goes
  // through the ComplexEntryModal, not inline.
  hasFormula?: boolean;
  // Number of hidden transfer rows that immediately precede this row
  // in chronological order. Only meaningful on the `balance` column —
  // when > 0, the cell renders a small ↔ icon button that toggles
  // inline-expansion of those hidden rows via `onToggleTransferAnchor`.
  // 0 (the default) renders the balance text alone.
  hiddenTransferCount?: number;
  transferExpanded?: boolean;
  onToggleTransferAnchor?: () => void;
  // Manual fiscal-month override on the row. Only the date cell reads
  // this — it renders a small ↗ / ↙ glyph next to the date so the
  // shifted state is visible at a glance. Undefined means "no override,
  // use computed fiscal month".
  fiscalMonthShift?: -1 | 1;
  // Sign of the row's amount, derived once by BudgetRow from the
  // amount cell. Only consulted by the `type` column's TypePicker
  // to filter income-only / expense-only types out of the list.
  amountSign?: "positive" | "negative" | "any";
  // Row context surfaced inside the `type` column's TypePicker
  // dropdown header — the dropdown physically overlaps the date and
  // description columns on mobile, so the picker re-displays them at
  // the top of the panel. Pre-formatted upstream by BudgetRow (date
  // through the user's short-date format, month-tint colour through
  // `monthColorVar`). Only the `type` column reads them; other
  // columns receive undefined and pass shallow-compare cleanly.
  rowDate?: string;
  rowDateColor?: string;
  rowDescription?: string;
  // Parent-level update / commit handlers. Carry rowId + columnId so
  // BudgetRow can pass the same reference-stable function to every cell
  // in the row — React.memo's shallow compare then skips re-rendering a
  // cell whose value didn't change. Cell wraps these into the
  // (value)-only closures its sub-components expect.
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Fires when the user finishes editing a cell (blur for the typed
  // inputs, the selection event for picker-style cells). Distinct from
  // `onUpdateCell`, which can fire on every keystroke. Lets the parent
  // know the edit has settled so it can prompt for series propagation.
  onCommitCell?: (rowId: string, columnId: string, value: CellValue) => void;
};

function CellImpl({
  rowId,
  column,
  value,
  computedBalance,
  settings,
  isRecurring,
  entryType,
  types,
  categories,
  onCreateType,
  onCreateCategory,
  isTransfer,
  peerName,
  outgoing,
  isHistory,
  hasFormula,
  hiddenTransferCount = 0,
  transferExpanded = false,
  onToggleTransferAnchor,
  amountSign,
  rowDate,
  rowDateColor,
  rowDescription,
  fiscalMonthShift,
  onUpdateCell,
  onCommitCell,
}: Props) {
  // Wrappers that adapt the parent's (rowId, colId, value) handlers into
  // the (value)-only signature the inline editors expect. Allocated per
  // Cell render — but Cell is memoized, so they're only rebuilt when the
  // cell's actual data changes, not on every parent re-render.
  const onChange = (next: CellValue) => onUpdateCell(rowId, column.id, next);
  const onCommit = onCommitCell
    ? (next: CellValue) => onCommitCell(rowId, column.id, next)
    : undefined;
  // Synthesized transfer rows are not editable inline — the
  // underlying data lives in `data.transfers`, not on the budget's
  // rows[]. Render each cell as a display-only span / icon and offer
  // editing through the action button (which opens the transfer
  // modal). The dedicated transfer layouts only differ from the
  // regular layouts in two ways: no input element, and the description
  // cell shows a transfer arrow + peer-account name.
  //
  // History rows are partially editable: description and type can be
  // edited inline (the writes land on `HistoryEntry.userDescription` /
  // `userTypeId` via the parent's interception of `onUpdateCell`),
  // while date / amount / balance / completed stay read-only — those
  // are bank-authoritative and the user shouldn't be able to rewrite
  // them without re-importing.
  // The two synthesized-row modes (transfer, history) share the same
  // readonly leaves for date / amount / balance / completed — the only
  // per-mode variation is in the description and type cells. Route the
  // shared half through a single helper so the leaves stay in lock-step
  // when their prop contracts change.
  if (isTransfer || isHistory) {
    const readonly = renderReadonlyColumn({
      column,
      value,
      settings,
      computedBalance,
      hiddenTransferCount,
      transferExpanded,
      onToggleTransferAnchor,
    });
    if (readonly) return readonly;
    if (isTransfer) {
      switch (column.type) {
        case "description":
          return (
            <TransferDescriptionCell
              value={typeof value === "string" ? value : ""}
              peerName={peerName ?? ""}
              outgoing={!!outgoing}
            />
          );
        case "type":
          return <ReadonlyTypeCell entryType={entryType ?? null} />;
      }
    } else {
      switch (column.type) {
        case "description":
          return (
            <DescriptionCell
              rowId={rowId}
              value={typeof value === "string" ? value : ""}
              isRecurring={false}
              entryType={entryType ?? null}
              onChange={onChange}
              onCommit={onCommit}
            />
          );
        case "type":
          return (
            <TypePickerCell
              rowId={rowId}
              types={types ?? []}
              categories={categories ?? []}
              entryType={entryType ?? null}
              rowDate={rowDate}
              rowDateColor={rowDateColor}
              rowDescription={rowDescription}
              onChange={onChange}
              onCommit={onCommit}
              onCreateType={onCreateType}
              onCreateCategory={onCreateCategory}
            />
          );
      }
    }
  }
  switch (column.type) {
    case "date": {
      return (
        <DateCell
          rowId={rowId}
          value={value}
          settings={settings}
          fiscalMonthShift={fiscalMonthShift}
          onChange={onChange}
        />
      );
    }

    case "description":
      return (
        <DescriptionCell
          rowId={rowId}
          value={typeof value === "string" ? value : ""}
          isRecurring={!!isRecurring}
          entryType={entryType ?? null}
          onChange={onChange}
          onCommit={onCommit}
        />
      );

    case "amount": {
      // Formula rows: the amount is computed at render time, so the
      // editable inline input would be misleading. Use the read-only
      // display variant with an `fx` chip to signal the source.
      // Editing the formula goes through the ComplexEntryModal.
      if (hasFormula) {
        return (
          <AmountCellDisplay
            value={typeof value === "number" ? value : null}
            settings={settings}
            formula
          />
        );
      }
      return (
        <AmountCell
          rowId={rowId}
          value={value}
          settings={settings}
          onChange={onChange}
          onCommit={onCommit}
        />
      );
    }

    case "balance":
      return (
        <BalanceCell
          value={computedBalance ?? 0}
          settings={settings}
          hiddenTransferCount={hiddenTransferCount}
          transferExpanded={transferExpanded}
          onToggleTransferAnchor={onToggleTransferAnchor}
        />
      );

    case "completed": {
      const checked = value === true;
      return (
        <td className={`${CELL_BASE} p-0 text-center`}>
          <button
            type="button"
            className={`flex h-full min-h-9 w-full cursor-pointer items-center justify-center border-0 bg-transparent p-1.5 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
              checked ? "text-accent" : "text-muted"
            }`}
            aria-pressed={checked}
            aria-label={checked ? "Mark as not done" : "Mark as done"}
            onClick={() => onChange(!checked)}
          >
            {checked && <Check size={18} aria-hidden focusable={false} />}
          </button>
        </td>
      );
    }

    case "type":
      // The cell reads the row's `typeId` directly (via `entryType`)
      // rather than its own `cells[col.id]` slot — typeId is the source
      // of truth on `Row`, and the `updateCell` reducer routes a value
      // for this column straight into `row.typeId` so the picker and
      // every other consumer (description chip, modals, hints) stay
      // aligned without duplicating the id into a parallel cell.
      return (
        <TypePickerCell
          rowId={rowId}
          types={types ?? []}
          categories={categories ?? []}
          entryType={entryType ?? null}
          amountSign={amountSign}
          rowDate={rowDate}
          rowDateColor={rowDateColor}
          rowDescription={rowDescription}
          onChange={onChange}
          onCommit={onCommit}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
        />
      );
  }
}

// Memoized so that a focus / popover-open in one cell — which fires a
// state change at the row's parent — doesn't ripple through every cell
// in every row. Shallow compare is enough: BudgetRow passes the parent
// `onUpdateCell` / `onCommitCell` straight through (stable refs), and
// the other props are scalars or stable references derived from the row.
export const BudgetCell = memo(CellImpl);

// Cells that are read-only in both the `isTransfer` and `isHistory`
// modes. The two modes used to repeat these four switch arms verbatim
// — keeping them in sync was a recurring source of drift (e.g. when
// `BalanceCell` grew its hidden-transfer toggle, every copy had to be
// updated). Adding a new readonly column type now means touching one
// arm in this helper instead of two switches in `CellImpl`.
function renderReadonlyColumn({
  column,
  value,
  settings,
  computedBalance,
  hiddenTransferCount,
  transferExpanded,
  onToggleTransferAnchor,
}: {
  column: Column;
  value: CellValue;
  settings: Settings;
  computedBalance: number | undefined;
  hiddenTransferCount: number;
  transferExpanded: boolean;
  onToggleTransferAnchor: (() => void) | undefined;
}) {
  switch (column.type) {
    case "date":
      return (
        <ReadonlyDateCell
          value={typeof value === "string" ? value : ""}
          settings={settings}
        />
      );
    case "amount":
      return (
        <AmountCellDisplay
          value={typeof value === "number" ? value : null}
          settings={settings}
        />
      );
    case "balance":
      return (
        <BalanceCell
          value={computedBalance ?? 0}
          settings={settings}
          hiddenTransferCount={hiddenTransferCount}
          transferExpanded={transferExpanded}
          onToggleTransferAnchor={onToggleTransferAnchor}
        />
      );
    case "completed":
      return <ReadonlyCompletedCell checked={value === true} />;
    default:
      return null;
  }
}
