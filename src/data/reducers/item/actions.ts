import type { CellValue, LineItemLink, Row } from "../../types";
import type {
  BulkPatch,
  ComplexEntryDraft,
  EditPatch,
  EditScope,
  SplitSubmission,
} from "../../action-payloads";

// Every item-level action carries both `sheetId` (so the dispatcher can
// find the right sheet quickly) and `itemId` (so a sheet that grows to
// hold multiple items can target the right one). Today the UI only
// renders one AccountBudget per sheet, so `itemId` always resolves to
// the same value, but plumbing it through now means future multi-item
// support drops in without another reducer rewrite.
export type ItemAction =
  | {
      type: "updateCell";
      sheetId: string;
      itemId: string;
      rowId: string;
      columnId: string;
      value: CellValue;
    }
  | {
      // Flip a budget row's `isTransfer` flag. The synthesized
      // transfer and history row variants set their transfer status
      // through other paths (`peerAccountId` and
      // `HistoryEntry.isTransfer` respectively) — this action only
      // touches user-authored rows that live in `item.rows`.
      type: "toggleRowTransfer";
      sheetId: string;
      itemId: string;
      rowId: string;
    }
  | { type: "addRow"; sheetId: string; itemId: string; date: string }
  | {
      type: "addRowsFromComplex";
      sheetId: string;
      itemId: string;
      draft: ComplexEntryDraft;
    }
  | {
      type: "convertToRecurring";
      sheetId: string;
      itemId: string;
      rowId: string;
      futureDates: string[];
      typeId: string | null;
      companyId: string | null;
    }
  | {
      type: "editSeries";
      sheetId: string;
      itemId: string;
      rowId: string;
      patch: EditPatch;
      scope: EditScope;
    }
  | {
      type: "propagateCellToFuture";
      sheetId: string;
      itemId: string;
      rowId: string;
      columnId: string;
      value: CellValue;
      untilIso: string | null;
      // When `"company"`, propagate the row-level company assignment to
      // every following occurrence instead of a cell value; `columnId`
      // is ignored and `value` carries the companyId (`string | null`).
      field?: "company";
    }
  | {
      type: "deleteRows";
      sheetId: string;
      itemId: string;
      rowIds: string[];
    }
  | {
      type: "bulkUpdate";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      patch: BulkPatch;
    }
  | {
      type: "bulkShiftToMonth";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      targetMonth: string;
    }
  | {
      // Source rows are passed by value, not by id, so the action can
      // duplicate synthesized history / transfer rows (which live
      // outside `item.rows`) the same way it duplicates user-authored
      // ones. Only `cells`, `typeId`, and `companyId` are consulted —
      // every other Row field is treated as runtime-only and dropped on
      // the new rows.
      type: "bulkCopyToMonths";
      sheetId: string;
      itemId: string;
      sources: Row[];
      targetMonths: string[];
    }
  | {
      type: "bulkMakeRecurring";
      sheetId: string;
      itemId: string;
      rowIds: string[];
      futureDates: string[];
    }
  | {
      type: "reorderColumns";
      sheetId: string;
      itemId: string;
      fromId: string;
      toId: string;
    }
  | {
      // Replace `rowId` with `splits` (one new row per split) at the
      // original's position in `item.rows`. When `remainderAmount` is
      // non-zero, the original row is pushed to the END of `item.rows`
      // with its amount swapped for `remainderAmount` (preserving
      // description / typeId / seriesId / completed / date); when it's
      // zero, the original is removed entirely.
      type: "splitRow";
      sheetId: string;
      itemId: string;
      rowId: string;
      splits: SplitSubmission[];
      remainderAmount: number;
    }
  | {
      // Replace the inline line-item links on a single user-authored row.
      // `lineItems` is the full desired set (the modal submits a
      // replacement, not a delta); an empty array clears the field. Unlike
      // `splitRow`, this never mints / removes rows — line items are
      // metadata attached to the existing row. Historic rows route through
      // `linkLineItemsToHistoryEntry` (their links live on the backing
      // `HistoryEntry`) instead.
      type: "setRowLineItems";
      sheetId: string;
      itemId: string;
      rowId: string;
      lineItems: LineItemLink[];
      // Receipt file reference for the purchase, set alongside the line
      // items in the same modal. An empty string clears it; `undefined`
      // leaves whatever was there untouched.
      receiptPath?: string;
    }
  | {
      // Set / clear the manual fiscal-month override on a single row.
      // `shift === null` clears the field; `1` / `-1` set it. Only the
      // anchor row stores the override — the grouping pipeline cascades
      // it to every other row dated the same day. Synthesized transfer /
      // history rows have read-only ids so the UI hides this action on
      // them; the reducer ignores no-op writes.
      type: "setRowFiscalMonthShift";
      sheetId: string;
      itemId: string;
      rowId: string;
      shift: -1 | 1 | null;
    };
