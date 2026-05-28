import { findColumnByType, newId, updateAccountBudget } from "../sheet";
import { nextUncoveredDate } from "../coverage";
import { type HintRecording, recordMerchantHints } from "../merchant-hints";
import {
  type ItemAction,
  applyPatternsAfterCellEdit,
  hintRecordingsFromBudget,
  reduceAccountBudget,
} from "../reducers/item";
import { applyPrimaryIncomeShifts } from "../reducers/item/primary-income";
import type { AccountBudget, Column, UserData } from "../types";
import type { Action } from "../reducer";

import type { SheetTypeDescriptor } from "./index";

// Default column layout for a newly-minted budget block: a typed
// ledger with date / description / type / amount / balance / done
// columns. Each column gets a fresh id so two budgets minted side by
// side don't share column identity.
export function createDefaultAccountBudget(
  accountId: string | null = null,
): AccountBudget {
  const columns: Column[] = [
    { id: newId(), type: "date", label: "Date" },
    { id: newId(), type: "description", label: "Description" },
    { id: newId(), type: "type", label: "Type" },
    { id: newId(), type: "amount", label: "Amount" },
    { id: newId(), type: "balance", label: "Balance" },
    { id: newId(), type: "completed", label: "Done" },
  ];
  return {
    id: newId(),
    type: "accountBudget",
    accountId,
    columns,
    rows: [],
  };
}

function isBudgetItemAction(action: Action): action is ItemAction {
  switch (action.type) {
    case "updateCell":
    case "toggleRowTransfer":
    case "addRow":
    case "addRowsFromComplex":
    case "convertToRecurring":
    case "editSeries":
    case "propagateCellToFuture":
    case "deleteRows":
    case "bulkUpdate":
    case "bulkShiftToMonth":
    case "bulkCopyToMonths":
    case "bulkMakeRecurring":
    case "reorderColumns":
    case "splitRow":
    case "setRowFiscalMonthShift":
      return true;
    default:
      return false;
  }
}

// Budget-item dispatch tail. Reduces the targeted AccountBudget, then
// walks the before/after to extract any newly-assigned categories so
// the merchant-hint store stays in sync with what the user is doing in
// the grid. Only the touched budget contributes recordings; sheets the
// action didn't reach are referentially identical and short-circuit
// the diff.
//
// Returns null when `action` is not a budget-item action so the outer
// reducer's descriptor walk can defer to the next flavour's
// `reduceItem`.
function reduceBudgetItem(state: UserData, action: Action): UserData | null {
  if (!isBudgetItemAction(action)) return null;
  // Snap date edits forward when the proposed value lands in a
  // calendar month covered by imported history. The bank is
  // authoritative there, so dropping a row into that window would
  // create a false record; nudge the value to the first day of the
  // next uncovered month instead. Applied here (before the
  // sub-reducer runs) so every date-mutating surface — inline cell,
  // edit modal, future drag-to-date — inherits the policy without
  // each having to know about coverage.
  let effectiveAction: ItemAction = action;
  if (action.type === "updateCell") {
    const targetSheet = state.sheets.find((s) => s.id === action.sheetId);
    const targetItem = targetSheet?.items.find(
      (i) => i.id === action.itemId && i.type === "accountBudget",
    ) as AccountBudget | undefined;
    if (targetItem && targetItem.accountId) {
      const col = targetItem.columns.find((c) => c.id === action.columnId);
      if (
        col?.type === "date" &&
        typeof action.value === "string" &&
        action.value.length >= 7
      ) {
        const accountHistory = state.history[targetItem.accountId] ?? [];
        const snapped = nextUncoveredDate(
          action.value,
          accountHistory,
          targetItem.rows,
          targetItem.columns,
          state.settings.startOfMonth,
        );
        if (snapped !== action.value) {
          effectiveAction = { ...action, value: snapped };
        }
      }
    }
  }
  const recordings: HintRecording[] = [];
  const sheets = updateAccountBudget(
    state.sheets,
    action.sheetId,
    action.itemId,
    (item) => {
      const reduced = reduceAccountBudget(item, effectiveAction);
      if (reduced === item) return item;
      // Apply pattern-driven typeIds AFTER the sub-reducer runs so
      // every cell-mutating action (inline edit, edit modal, complex
      // add, recurring promote) inherits the same auto-labelling
      // policy without each having to know about matchRules. The
      // hint-recording pass below then sees the post-pattern shape so
      // a freshly auto-assigned type also feeds the merchant memory.
      const labelled = applyPatternsAfterCellEdit(
        item,
        reduced,
        state.matchRules,
      );
      // Re-stamp `fiscalMonthShift` on every row in a primary-income
      // series whose date may have just changed. Cheap walk because
      // the metadata map is small (typically one entry); skips items
      // entirely when no series is flagged. Done here so adding a row
      // (`addRowsFromComplex`), editing one (`editSeries`,
      // `updateCell` on the date column), or promoting candidates all
      // pick up the cascade without each path repeating the logic.
      const next = applyPrimaryIncomeShifts(labelled, state.seriesMetadata);
      recordings.push(...hintRecordingsFromBudget(item, next));
      // "Make recurring" should also backfill the user-typed
      // description onto past bank-history entries whose normalised
      // text matches the row — the `hintRecordingsFromBudget` diff
      // above carries the typeId, but the merchant-hint's
      // `description_override` only stamps when the recording
      // explicitly sets it. Emit one targeted recording from the
      // anchor row so synthesized history rows render the clean
      // label ("Spotify") rather than the raw bank text
      // ("*SPOTIFY P12AB34"). Skipped when the user declined a type
      // — the override would otherwise stick without a category to
      // route the past entries under.
      if (
        effectiveAction.type === "convertToRecurring" &&
        effectiveAction.typeId
      ) {
        const descCol = findColumnByType(item.columns, "description");
        const anchor = item.rows.find((r) => r.id === effectiveAction.rowId);
        if (descCol && anchor) {
          const desc = anchor.cells[descCol.id];
          if (typeof desc === "string" && desc.trim() !== "") {
            recordings.push({
              description: desc,
              typeId: effectiveAction.typeId,
              description_override: desc,
              // Fold the company tag into the merchant hint so past
              // synthesized rows sharing this merchant key adopt it
              // alongside the description / type overlay.
              companyId: effectiveAction.companyId ?? undefined,
            });
          }
        }
      }
      return next;
    },
  );
  const next = sheets === state.sheets ? state : { ...state, sheets };
  return recordMerchantHints(next, recordings, Date.now());
}

export const BUDGET_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "budget",
  label: "Budget",
  description: "Track money in and out, month by month.",
  glyph: "wallet",
  createDefaultItem: ({ accountId }) => createDefaultAccountBudget(accountId),
  reduceItem: reduceBudgetItem,
};
