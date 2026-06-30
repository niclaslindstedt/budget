import { memo, useCallback, useMemo } from "react";
import { ArrowLeftRight, Info, Pencil, Trash2 } from "lucide-react";

import { isRowFinished, isRowSavable } from "../../data/budget/rows";
import {
  descriptionCompanyHintsFor,
  descriptionMetadataInductionFor,
  mergeCompanyHintIds,
} from "../../data/budget/company-type-hints";
import { getStandardColumns } from "../../data/sheet";
import { useLongPress } from "../../hooks";
import { useLang, useT } from "../../i18n";
import type { CellValue, Column, Row } from "../../data/types";
import { formatAmount, formatShortDate } from "../../utils/format";
import { monthColorVar, monthNumberFromKey } from "../../utils/monthColor";
import { useModalDispatch } from "../modal-dispatch";
import { useRowSwipeAndClaim } from "../useRowSwipeAndClaim";
import { BudgetCell } from "./BudgetCell";
import { useBudgetContext } from "./BudgetContext";
import type { CellLineItem } from "./cells/DescriptionCell";
import { BudgetEntryActionsMenu } from "./BudgetEntryActionsMenu";

type Props = {
  row: Row;
  columns: Column[];
  balances: Map<string, number>;
  // Row-level company writer. Routed by the parent (BudgetPage) so
  // budget rows dispatch `bulkUpdate` and synthesized history rows
  // dispatch `updateHistoryEntry` (clearing `noCompany` when a
  // company is assigned). Pre-bound to a per-row closure here so
  // `BudgetCell` and the inline picker stay agnostic of row type.
  onSetRowCompany: (row: Row, companyId: string | null) => void;
  // Row-level "omit company" writer. Routed by the parent (BudgetPage)
  // so user-authored rows dispatch `bulkUpdate` and synthesized history
  // rows dispatch `updateHistoryEntry`. A no-op for correction / transfer
  // rows, whose cell wiring leaves `onOmitChange` unset so it never fires.
  onSetRowNoCompany: (row: Row, next: boolean) => void;
  // Accept the induced company / type suggestion on an untagged history
  // row — persists the patch onto the underlying `HistoryEntry`. Fired by
  // the Done-column "pop" accept button. A no-op for any non-history row
  // (those never surface a suggestion). Optional so call sites that don't
  // mount history rows can omit it.
  onAcceptSuggestion?: (
    row: Row,
    patch: { userCompanyId?: string; userTypeId?: string },
  ) => void;
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
  // `onToggleTransferAnchor` so BudgetMonthTable reveals the hidden run
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
  // dispatches this for budget rows (synth transfers and history
  // rows manage their transfer status through other paths and don't
  // get the button).
  onToggleRowTransfer?: (row: Row) => void;
  // Flip the row's `ignored` flag (exclude / include in the spending
  // dashboard). Threaded through to `BudgetEntryActionsMenu`; surfaces
  // on user-authored and history rows.
  onToggleRowIgnored?: (row: Row) => void;
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Fires after the user finishes editing a cell (blur / discrete select).
  // Used to prompt for series-wide propagation on recurring rows; the
  // parent ignores the signal for one-off rows.
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Manual fiscal-month override for the row. Threaded through to
  // `BudgetEntryActionsMenu` so the "Push to next month" / "Push to previous
  // month" / "Reset month override" entries can dispatch the reducer
  // action. Optional — surfaces only on user-authored rows.
  onSetFiscalMonthShift?: (row: Row, shift: -1 | 1 | null) => void;
  onToggleSelect: (rowId: string) => void;
};

function BudgetRowImpl({
  row,
  columns,
  balances,
  onSetRowCompany,
  onSetRowNoCompany,
  onAcceptSuggestion,
  selectMode,
  selected,
  canTransfer,
  hiddenTransferCount = 0,
  transferExpanded = false,
  onToggleTransferAnchor,
  revealedTransfer = false,
  onToggleRowTransfer,
  onToggleRowIgnored,
  onUpdateCell,
  onCommitCell,
  onSetFiscalMonthShift,
  onToggleSelect,
}: Props) {
  const tr = useT();
  const lang = useLang();
  const dispatchModal = useModalDispatch();
  const {
    typesById,
    companiesById,
    itemsById,
    companyTypeHints,
    typeCompanyHints,
    descriptionCompanyHints,
    descriptionInductions,
    settings,
    coverTransferIds,
  } = useBudgetContext();
  const entryType = row.typeId ? (typesById.get(row.typeId) ?? null) : null;
  const company = row.companyId
    ? (companiesById.get(row.companyId) ?? null)
    : null;
  // The row's company → type hint ids, surfaced as the "Suggested" band
  // in the inline type picker. Empty when the row has no company.
  const typeHintIds = useMemo(
    () => (row.companyId ? (companyTypeHints.get(row.companyId) ?? []) : []),
    [companyTypeHints, row.companyId],
  );
  // The row's type → company hint ids — that type's most-used
  // companies. Empty when the row has no type set yet.
  const typeCompanyHintIds = useMemo(
    () => (row.typeId ? (typeCompanyHints.get(row.typeId) ?? []) : []),
    [typeCompanyHints, row.typeId],
  );
  const handleSetCompany = useCallback(
    (companyId: string | null) => onSetRowCompany(row, companyId),
    [onSetRowCompany, row],
  );
  const handleSetNoCompany = useCallback(
    (next: boolean) => onSetRowNoCompany(row, next),
    [onSetRowNoCompany, row],
  );
  // A swiped row exposes destructive action buttons; the active-row
  // claim (folded into the hook) makes a tap outside only dismiss the
  // swipe instead of also firing the button that was tapped.
  const { swiped, setSwiped, touchHandlers } = useRowSwipeAndClaim(row.id, {
    // Attributed cover itemizations are read-only — no swipe-revealed actions.
    disabled: selectMode || row.coverRole === "attributed",
  });

  // Resolve the four standard columns once per `columns` reference so
  // a balances-map change (which re-renders every row in the workspace)
  // doesn't make each row re-scan the columns array four more times.
  const { dateCol, descCol, amountCol } = useMemo(
    () => getStandardColumns(columns),
    [columns],
  );
  // A "finished" row — a fully-categorised imported bank transaction —
  // is the only thing that tints the row green and shows a green Done
  // check. Non-history rows can still be confirmed via the Done
  // checkbox, but that no longer changes the row background.
  const isFinished = isRowFinished(row);
  const isSeries = !!row.seriesId;
  const isTransfer = row.kind === "transfer";
  const isHistory = row.kind === "historic";
  // The "Omit company" option surfaces on user-authored and synthesized
  // history rows (both carry / mirror a `noCompany` flag). Correction and
  // transfer rows have no company concept, so the picker stays plain.
  const canOmitCompany = row.kind === "user" || row.kind === "historic";
  // Cover-transfer overlay. A synthesized cover-transfer row opens the
  // read-only info modal on tap. A "covered" historic row (reimbursed from
  // another account) shows a check glyph that opens the same modal. An
  // "attributed" row is a read-only itemization injected into the covering
  // account's ledger — it behaves like a transfer row (no inline edit / swipe
  // actions) and its glyph also opens the info modal.
  const isCoverTransferRow =
    row.kind === "transfer" && coverTransferIds.has(row.transferId);
  const isCoverItem = row.coverRole === "attributed";
  // Both covered (on the charged account) and attributed (on the covering
  // account) rows carry the glyph that opens the cover info modal.
  const coveredTransferId = row.coverRole
    ? (row.coverTransferId ?? null)
    : null;
  // The transfer button needs both a savable row (so we know an amount
  // and description exist to promote) AND a parent budget with a known
  // account. Synthesized transfer rows skip the savable check —
  // they're already a transfer, so the button takes the user to the
  // edit modal instead of promoting.
  const transferEnabled =
    canTransfer && (isTransfer || isRowSavable(row, columns));
  // Direction for a synthesized transfer row: negative amount means
  // money flows OUT of this budget's account. The BudgetCell renderer uses
  // this to pick the right arrow glyph for the description cell.
  const amountValue =
    amountCol !== undefined ? row.cells[amountCol.id] : undefined;
  const isOutgoing =
    isTransfer && typeof amountValue === "number" && amountValue < 0;
  // Sign hint for the type column's TypePicker. Only meaningful when
  // the row carries a non-zero numeric amount — zero / empty rows
  // are still ambiguous so the picker shows every type.
  const amountSign: "positive" | "negative" | "any" =
    typeof amountValue === "number" && amountValue > 0
      ? "positive"
      : typeof amountValue === "number" && amountValue < 0
        ? "negative"
        : "any";

  // Resolve the row's line items to display-ready rows (item name +
  // signed, currency-formatted price) for the description cell's pill /
  // glyph and popover list. The price lives on the linked item now; the
  // link only connects the row to it, so the amount shown is the item's
  // `purchasePrice` rendered with the row's direction (a purchase shows
  // the cost as an outflow). Order follows `row.lineItems` so index 0 is
  // the first added line — the name the "many" pill surfaces. Undefined
  // when the row has none so the cell prop stays shallow-compare stable.
  const lineItems = useMemo<readonly CellLineItem[] | undefined>(() => {
    if (!row.lineItems || row.lineItems.length === 0) return undefined;
    const negative = !(typeof amountValue === "number" && amountValue > 0);
    return row.lineItems.map((li) => {
      const item = itemsById.get(li.itemId);
      const price = item?.purchasePrice;
      const amount =
        price === undefined
          ? ""
          : `${negative ? "−" : "+"}${formatAmount(price, settings)}`;
      return {
        id: li.id,
        itemId: li.itemId,
        name: item?.name ?? tr("cell.unknownItem"),
        amount,
      };
    });
  }, [row.lineItems, itemsById, settings, tr, amountValue]);

  // Expose the row's ISO date so BudgetPage's scroll-to-today can target
  // it directly. Skipped when the date cell is empty or non-string.
  const isoDate =
    dateCol && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : undefined;

  // Pre-render the date + description that the type column's
  // TypePicker echoes inside its dropdown header. The header keeps
  // that context visible even though the dropdown physically overlaps
  // the date and description columns on mobile. Pre-computed here so
  // the picker stays decoupled from the user's date-format setting.
  const rowDescription =
    descCol && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  // The "Suggested" companies band for the row's inline picker. The
  // merchant the user has tagged this description with before leads
  // (matched on the raw bank text for history rows so it lines up with
  // the normalised key the memory is built from), then the row's type's
  // most-used companies fill the rest. Either source may be empty.
  const descriptionForHint =
    (row.kind === "historic" ? row.bankDescription : undefined) ??
    rowDescription;
  const descriptionCompanyHintIds = useMemo(
    () =>
      descriptionCompanyHintsFor(descriptionCompanyHints, descriptionForHint),
    [descriptionCompanyHints, descriptionForHint],
  );
  const companyHintIds = useMemo(
    () => mergeCompanyHintIds(descriptionCompanyHintIds, typeCompanyHintIds),
    [descriptionCompanyHintIds, typeCompanyHintIds],
  );

  // Induced metadata suggestion for an untagged history row: the company
  // and/or type the merchant's other entries unanimously agree on (see
  // `computeDescriptionMetadataInductions`). Each field is offered only
  // when the row doesn't already resolve it — a company unless one is set
  // or the row omits a company; a type unless one is set. When at least
  // one field is suggestable the Done cell turns into the "pop" accept
  // button (wired below). Non-history rows never induce.
  //
  // The induction is keyed on the raw bank text — never the resolved
  // description, which falls back to the company / type name once either
  // is tagged (so a row with a company but no type would otherwise look
  // the merchant up under the company's name). `descriptionPlaceholder`
  // and `bankDescription` both carry the original statement memo (set by
  // `synthesizeHistoryRow` in the fallback / override cases); when neither
  // is set the resolved description already equals the bank text.
  const historyBankText =
    row.kind === "historic"
      ? (row.bankDescription ?? row.descriptionPlaceholder ?? rowDescription)
      : rowDescription;
  const induction = useMemo(
    () =>
      isHistory
        ? descriptionMetadataInductionFor(
            descriptionInductions,
            historyBankText,
          )
        : undefined,
    [isHistory, descriptionInductions, historyBankText],
  );
  const suggestedCompanyId =
    induction?.companyId && !row.companyId && row.noCompany !== true
      ? induction.companyId
      : undefined;
  const suggestedTypeId =
    induction?.typeId && !row.typeId ? induction.typeId : undefined;
  const suggestedCompany = suggestedCompanyId
    ? (companiesById.get(suggestedCompanyId) ?? null)
    : null;
  const suggestedType = suggestedTypeId
    ? (typesById.get(suggestedTypeId) ?? null)
    : null;
  // Only offer acceptance for fields that resolve to a live company /
  // type (a dangling induced id renders nothing and must not be
  // persisted). The accept patch carries exactly the resolved fields.
  const acceptPatch = useMemo(() => {
    const patch: { userCompanyId?: string; userTypeId?: string } = {};
    if (suggestedCompany) patch.userCompanyId = suggestedCompany.id;
    if (suggestedType) patch.userTypeId = suggestedType.id;
    return patch;
  }, [suggestedCompany, suggestedType]);
  const hasSuggestion =
    !!onAcceptSuggestion &&
    (acceptPatch.userCompanyId !== undefined ||
      acceptPatch.userTypeId !== undefined);
  const handleAcceptSuggestion = useCallback(() => {
    onAcceptSuggestion?.(row, acceptPatch);
  }, [onAcceptSuggestion, row, acceptPatch]);
  const rowDateFormatted = isoDate
    ? formatShortDate(isoDate, settings.shortDateFormat, lang)
    : "";
  const rowDateMonthNum = isoDate ? monthNumberFromKey(isoDate) : null;
  const rowDateColor =
    rowDateMonthNum !== null ? monthColorVar(rowDateMonthNum) : undefined;

  // Long-press / right-click → open the read-only entry-info modal. Same
  // coordinator pattern as `BudgetAddEntryButton` / `BottomBar`'s sheet
  // tabs: `consumeTriggered` guards the trailing click so the tap that
  // produced the long-press doesn't also fire a cell editor underneath
  // the modal.
  //
  // Enabled for user-authored and synthesized history rows — both have an
  // info view. Transfers (their own edit / cover-info modals), attributed
  // cover itemizations (read-only, no swipe), and balance-correction rows
  // (display-only dividers) stay a no-op. The select-mode tap toggles
  // selection so we leave it alone there too.
  const longPress = useLongPress({
    enabled:
      !selectMode && !isTransfer && !isCoverItem && row.kind !== "correction",
    onLongPress: () => {
      setSwiped(false);
      dispatchModal({ kind: "open-entry-info", row });
    },
    // Action-cell taps and select-cell taps drive their own handlers —
    // starting a long-press there would race with the button click and
    // pop the modal on top of whatever action the user meant to fire.
    // Inputs / buttons / textareas inside data cells are skipped too so
    // a tap on a description input still focuses the field, a tap on a
    // category chip still opens its picker, and iOS's text-selection
    // long-press inside an input keeps working. The pen button stays
    // available for users who want the modal from inside a cell. The
    // same guard suppresses the right-click path so the native context
    // menu (or the cell's own handler) wins on interactive controls.
    shouldSkip: (e) => {
      const target = e.target as HTMLElement;
      return (
        target.closest(".action-cell") !== null ||
        target.closest("[data-select-cell]") !== null ||
        target.closest("input, textarea, select, button") !== null
      );
    },
  });

  function onClickCapture(e: React.MouseEvent<HTMLTableRowElement>) {
    // Long-press triggered while the pointer was still down — the
    // following click would otherwise reach the cell underneath and
    // open its inline editor on top of the modal. Swallow it here in
    // the capture phase so descendants never see it.
    if (longPress.consumeTriggered()) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  const rowClass = [
    swiped && !selectMode ? "is-swiped" : "",
    isFinished ? "is-finished" : "",
    row.ignored ? "is-ignored" : "",
    isSeries ? "is-series" : "",
    selectMode ? "is-selecting-row" : "",
    selected ? "is-selected" : "",
    revealedTransfer ? "is-revealed-transfer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    // Attributed cover itemizations are read-only and not selectable.
    if (!selectMode || isCoverItem) return;
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
      {...touchHandlers}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerUp}
      onClick={handleRowClick}
      onClickCapture={onClickCapture}
      onContextMenu={longPress.onContextMenu}
      aria-selected={selectMode ? selected : undefined}
    >
      {selectMode && (
        <td
          data-select-cell
          className="select-cell border-r border-b border-line bg-surface-3 p-0 text-center"
        >
          {/* Attributed cover itemizations are read-only — render an empty
              select cell so the column count stays aligned. */}
          {!isCoverItem && (
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
          )}
        </td>
      )}
      {columns.map((col) => (
        <BudgetCell
          key={col.id}
          rowId={row.id}
          column={col}
          value={row.cells[col.id] ?? null}
          computedBalance={
            col.type === "balance" ? balances.get(row.id) : undefined
          }
          isRecurring={isSeries}
          entryType={entryType}
          company={company}
          suggestedCompany={
            col.type === "description" ? suggestedCompany : undefined
          }
          suggestedType={col.type === "type" ? suggestedType : undefined}
          onAcceptSuggestion={
            col.type === "completed" && hasSuggestion
              ? handleAcceptSuggestion
              : undefined
          }
          onSetCompany={handleSetCompany}
          noCompany={canOmitCompany ? (row.noCompany ?? false) : undefined}
          onSetNoCompany={canOmitCompany ? handleSetNoCompany : undefined}
          isTransfer={isTransfer}
          isCoverItem={isCoverItem}
          finished={col.type === "completed" ? isFinished : undefined}
          peerName={row.kind === "transfer" ? row.peerAccountName : ""}
          outgoing={isOutgoing}
          isHistory={isHistory}
          hasFormula={typeof row.amountFormula === "string"}
          hiddenTransferCount={col.type === "balance" ? hiddenTransferCount : 0}
          transferExpanded={col.type === "balance" ? transferExpanded : false}
          onToggleTransferAnchor={
            col.type === "balance" ? onToggleTransferAnchor : undefined
          }
          amountSign={col.type === "type" ? amountSign : undefined}
          typeHintIds={col.type === "type" ? typeHintIds : undefined}
          rowDate={col.type === "type" ? rowDateFormatted : undefined}
          rowDateColor={col.type === "type" ? rowDateColor : undefined}
          rowDescription={col.type === "type" ? rowDescription : undefined}
          fiscalMonthShift={
            col.type === "date" ? row.fiscalMonthShift : undefined
          }
          descriptionPlaceholder={
            col.type === "description" && row.kind === "historic"
              ? row.descriptionPlaceholder
              : undefined
          }
          bankDescription={
            col.type === "description" && row.kind === "historic"
              ? row.bankDescription
              : undefined
          }
          lineItems={col.type === "description" ? lineItems : undefined}
          companyHintIds={
            col.type === "description" ? companyHintIds : undefined
          }
          coveredTransferId={
            col.type === "description" ? coveredTransferId : null
          }
          onUpdateCell={onUpdateCell}
          onCommitCell={onCommitCell}
        />
      ))}
      <td className="swipe-action-cell action-cell border-r border-b border-line bg-surface-3 p-0 text-center last:border-r-0">
        <div className="action-stack flex h-full w-full items-stretch">
          {isTransfer && (
            <button
              type="button"
              disabled={!transferEnabled}
              className="action-btn action-btn-transfer inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white disabled:cursor-not-allowed disabled:opacity-40 md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={
                isCoverTransferRow
                  ? tr("coverTransfer.openInfo")
                  : tr("cell.editTransfer")
              }
              title={
                isCoverTransferRow
                  ? tr("coverTransfer.openInfo")
                  : tr("cell.editTransfer")
              }
              onClick={() => {
                if (!transferEnabled) return;
                setSwiped(false);
                if (isCoverTransferRow && row.kind === "transfer") {
                  dispatchModal({
                    kind: "open-cover-info",
                    transferId: row.transferId,
                  });
                  return;
                }
                dispatchModal({ kind: "open-transfer-row", row });
              }}
            >
              <ArrowLeftRight size={16} aria-hidden focusable={false} />
            </button>
          )}
          {/* Info button — read-only view of every field, left of the
              edit pen. Available on user-authored and synthesized history
              rows (transfers / attributed cover itemizations have their
              own info affordance). */}
          {!isTransfer && !isCoverItem && (
            <button
              type="button"
              className="action-btn action-btn-info inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.infoTitle")}
              title={tr("cell.infoTitle")}
              onClick={() => {
                setSwiped(false);
                dispatchModal({ kind: "open-entry-info", row });
              }}
            >
              <Info size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransfer && isHistory && !isCoverItem && (
            <button
              type="button"
              className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.editHistoryEntry")}
              title={tr("cell.editHistoryEntry")}
              onClick={() => {
                setSwiped(false);
                dispatchModal({ kind: "open-edit-history", row });
              }}
            >
              <Pencil size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransfer && !isHistory && (
            <button
              type="button"
              className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
              aria-label={tr("cell.editRow")}
              onClick={() => {
                setSwiped(false);
                dispatchModal({ kind: "open-edit-row", row });
              }}
            >
              <Pencil size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransfer && !isHistory && (
            <button
              type="button"
              className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
              aria-label={tr("cell.deleteRow")}
              title={tr("cell.deleteRow")}
              onClick={() => {
                setSwiped(false);
                dispatchModal({ kind: "open-delete-row", row });
              }}
            >
              <Trash2 size={16} aria-hidden focusable={false} />
            </button>
          )}
          {!isTransfer && isHistory && !isCoverItem && (
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
          {!isTransfer && !isCoverItem && (
            <BudgetEntryActionsMenu
              row={row}
              isHistory={isHistory}
              isSeries={isSeries}
              onToggleRowTransfer={onToggleRowTransfer}
              onToggleRowIgnored={
                row.kind === "user" || row.kind === "historic"
                  ? onToggleRowIgnored
                  : undefined
              }
              onSetFiscalMonthShift={onSetFiscalMonthShift}
              onEdit={() =>
                dispatchModal({
                  kind: isHistory ? "open-edit-history" : "open-edit-row",
                  row,
                })
              }
              onDelete={() => {
                if (isHistory) return;
                dispatchModal({ kind: "open-delete-row", row });
              }}
              deleteDisabled={isHistory}
              deleteDisabledTitle={
                isHistory ? tr("cell.cannotDeleteHistory") : undefined
              }
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
export const BudgetRow = memo(BudgetRowImpl);
