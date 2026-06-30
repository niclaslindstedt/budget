import { memo } from "react";
import { Check } from "lucide-react";

import type {
  CellValue,
  Column,
  Company,
  EntryType,
  Settings,
} from "../../data/types";
import { useBudgetContext } from "./BudgetContext";
import { AmountCell } from "./cells/AmountCell";
import { AmountCellDisplay } from "./cells/AmountCellDisplay";
import { BalanceCell } from "./cells/BalanceCell";
import {
  AcceptSuggestionCompletedCell,
  ReadonlyCompletedCell,
} from "./cells/CompletedCell";
import { CELL_BASE } from "./cells/constants";
import { DateCell, ReadonlyDateCell } from "./cells/DateCell";
import {
  type CellLineItem,
  CoverItemDescriptionCell,
  DescriptionCell,
  TransferDescriptionCell,
} from "./cells/DescriptionCell";
import { ReadonlyTypeCell, TypePickerCell } from "./cells/TypeCell";

type Props = {
  rowId: string;
  column: Column;
  value: CellValue;
  computedBalance?: number;
  isRecurring?: boolean;
  // Resolved EntryType for `row.typeId`. Drives the dedicated `type`
  // column's picker / readonly chip, and — on recurring rows — the
  // description cell, which collapses down to a chip in the type's
  // color (a clearer at-a-glance identifier than the recurring-arrow
  // glyph) with the description tucked into a popover behind it.
  entryType?: EntryType | null;
  // Resolved Company for `row.companyId`. The description cell renders
  // an outlined pill (Building2 glyph + company name) when this is set
  // and the row has no user-authored description — replacing the
  // type-name / bank-text fallback.
  company?: Company | null;
  // Induced company / type for an untagged synthesized history row (see
  // `computeDescriptionMetadataInductions`). The description column reads
  // `suggestedCompany` to render a dotted suggestion pill; the type column
  // reads `suggestedType` for the same. Both undefined on rows that
  // already resolve the field or have no induction.
  suggestedCompany?: Company | null;
  suggestedType?: EntryType | null;
  // When set on the `completed` column of a history row, that row has an
  // acceptable induction and the Done cell becomes a "pop" accept button
  // that fires this to persist the suggestion. Undefined otherwise.
  onAcceptSuggestion?: () => void;
  // Pre-bound (no rowId) writer for the row's company. Pre-bound by
  // BudgetRow so this cell can stay agnostic of whether the row is a
  // budget row (dispatches `bulkUpdate`) or a synthesized history row
  // (dispatches `updateHistoryEntry` with `noCompany` cleared).
  onSetCompany?: (companyId: string | null) => void;
  // Current omit-company flag for the row, mirrored from
  // `HistoryEntry.noCompany` by `synthesizeHistoryRow`. Drives the
  // "omitted" trigger state of the inline CompanyPicker. Undefined for
  // non-history rows; passing it alongside `onSetNoCompany` is what
  // surfaces the "Omit company" option in the picker.
  noCompany?: boolean;
  // Pre-bound (no rowId) writer for the row's omit-company flag.
  // Undefined for non-history rows — the picker hides the option when
  // this callback is absent.
  onSetNoCompany?: (next: boolean) => void;
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
  // True when the row is an "attributed" cover itemization — a read-only
  // copy of an expense covered from this account, injected for statistics.
  // Rendered fully read-only (no editable description / type), like a
  // transfer row, with the cover glyph in the description cell.
  isCoverItem?: boolean;
  // Whether the row is "finished" (a fully-categorised imported bank
  // transaction — see `isRowFinished`). Only the `completed` column on a
  // history row reads it: the Done check renders from this finished
  // state, in green, instead of the always-true synthesized completed
  // value. Undefined on every other column / row kind.
  finished?: boolean;
  // Threaded from `Row.descriptionPlaceholder`. When set, the
  // resolved description in `value` is a fallback (company / type /
  // bank text) rather than a real user override — `DescriptionCell`
  // renders it in italic + glyph color and seeds its inline editor
  // empty + with this string as the placeholder. Only meaningful on
  // synthesized history rows; ignored by every other column.
  descriptionPlaceholder?: string;
  // Threaded from `Row.bankDescription`. When set, the row is a
  // history row whose visible description is a user override that
  // differs from the bank's memo — the description popover surfaces
  // this read-only as "original from bank" beneath the textarea so
  // the user can still see what the statement reported. Undefined
  // when no override is in play (the placeholder already shows the
  // bank text) and on every non-history row.
  bankDescription?: string;
  // The row's resolved line items (item name + formatted amount),
  // passed only to the `description` column. Drives the line-item pill /
  // glyph on the trigger and the read-only list at the bottom of the
  // description popover. Undefined on every non-description column and
  // on rows with no line items.
  lineItems?: readonly CellLineItem[];
  // The row's type → company hint ids (see `computeTypeCompanyHints`),
  // rendered as the "Suggested" band atop the description popover's
  // inline CompanyPicker. Only the `description` column receives them;
  // other columns get undefined and pass shallow-compare cleanly.
  companyHintIds?: readonly string[];
  // When set (description column on a covered imported row), the id of the
  // cover transfer that accounts for this transaction. The description cell
  // appends a check glyph that opens that transfer's info modal.
  coveredTransferId?: string | null;
  // True when the row carries an `amountFormula`. The amount cell
  // becomes read-only (the value comes from the formula resolver) and
  // surfaces a small `fx` glyph so the user can tell at a glance that
  // the number isn't a literal entry. Editing the formula goes
  // through the BudgetComplexEntryModal, not inline.
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
  // The row's company → type hint ids (see `computeCompanyTypeHints`),
  // rendered as the "Suggested" band atop the `type` column's
  // TypePicker. Only the `type` column receives them; other columns get
  // undefined and pass shallow-compare cleanly.
  typeHintIds?: readonly string[];
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
  isRecurring,
  entryType,
  company,
  suggestedCompany,
  suggestedType,
  onAcceptSuggestion,
  onSetCompany,
  noCompany,
  onSetNoCompany,
  isTransfer,
  peerName,
  outgoing,
  isHistory,
  isCoverItem,
  finished,
  hasFormula,
  hiddenTransferCount = 0,
  transferExpanded = false,
  onToggleTransferAnchor,
  amountSign,
  typeHintIds,
  rowDate,
  rowDateColor,
  rowDescription,
  fiscalMonthShift,
  descriptionPlaceholder,
  bankDescription,
  lineItems,
  companyHintIds,
  coveredTransferId,
  onUpdateCell,
  onCommitCell,
}: Props) {
  const {
    settings,
    types,
    categories,
    companies,
    onCreateType,
    onCreateCategory,
    onCreateCompany,
  } = useBudgetContext();
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
  if (isTransfer || isHistory || isCoverItem) {
    // History Done column: an imported transaction already happened, so
    // it always shows a check — the colour is the signal. Green once the
    // row is "finished" (categorised: a type plus a company or omit),
    // grey while it still needs work. When the row is untagged but its
    // merchant induces a company / type, the cell becomes a "pop" accept
    // button instead: tapping it persists the induction in one go.
    if (isHistory && column.type === "completed") {
      if (onAcceptSuggestion) {
        return <AcceptSuggestionCompletedCell onAccept={onAcceptSuggestion} />;
      }
      return (
        <ReadonlyCompletedCell checked tone={finished ? "success" : "muted"} />
      );
    }
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
              rowId={rowId}
              value={typeof value === "string" ? value : ""}
              peerName={peerName ?? ""}
              outgoing={!!outgoing}
            />
          );
        case "type":
          return <ReadonlyTypeCell entryType={entryType ?? null} />;
      }
    } else if (isCoverItem) {
      switch (column.type) {
        case "description":
          return (
            <CoverItemDescriptionCell
              value={typeof value === "string" ? value : ""}
              coveredTransferId={coveredTransferId}
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
              company={company ?? null}
              suggestedCompany={suggestedCompany}
              companies={companies}
              placeholder={descriptionPlaceholder}
              bankDescription={bankDescription}
              lineItems={lineItems}
              companyHintIds={companyHintIds}
              coveredTransferId={coveredTransferId}
              onChange={onChange}
              onCommit={onCommit}
              onSetCompany={onSetCompany}
              noCompany={noCompany}
              onSetNoCompany={onSetNoCompany}
              onCreateCompany={onCreateCompany}
            />
          );
        case "type":
          return (
            <TypePickerCell
              rowId={rowId}
              types={types}
              categories={categories}
              entryType={entryType ?? null}
              suggestedType={suggestedType}
              hintTypeIds={typeHintIds}
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
          onCommit={onCommit}
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
          company={company ?? null}
          companies={companies}
          lineItems={lineItems}
          companyHintIds={companyHintIds}
          onChange={onChange}
          onCommit={onCommit}
          onSetCompany={onSetCompany}
          noCompany={noCompany}
          onSetNoCompany={onSetNoCompany}
          onCreateCompany={onCreateCompany}
        />
      );

    case "amount": {
      // Formula rows: the amount is computed at render time, so the
      // editable inline input would be misleading. Use the read-only
      // display variant with an `fx` chip to signal the source.
      // Editing the formula goes through the BudgetComplexEntryModal.
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
              checked ? "text-success" : "text-muted"
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
          hintTypeIds={typeHintIds}
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
