import {
  computePrimaryIncomeShift,
  createEmptyRow,
  defaultCompletedForDate,
  findColumnByType,
  getStandardColumns,
  mapRowsByIds,
  moveColumn,
  newId,
  propagateCellInSeries,
  rowsInSeriesFrom,
  shiftIsoToMonth,
  updateAccountBudget,
} from "../sheet";
import { findMatchingRuleForCandidate } from "../match-rules";
import { candidateFromRow, resolveCandidateColumns } from "../row-candidate";
import { type HintRecording, recordMerchantHints } from "../merchant-hints";
import { nextUncoveredDate } from "../coverage";
import type {
  AccountBudget,
  CellValue,
  MatchRule,
  Row,
  SeriesMetadata,
  UserData,
} from "../types";
import type {
  BulkPatch,
  ComplexEntryDraft,
  EditPatch,
  EditScope,
  SplitSubmission,
} from "../action-payloads";
import type { Action } from "../reducer";
import { addDaysIso } from "../../utils/date";

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
      type: "bulkCopyToMonths";
      sheetId: string;
      itemId: string;
      rowIds: string[];
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

// Walk an AccountBudget's before/after rows and collect the
// description+typeId pairs that need to be folded into the merchant-
// hint store. Anything that newly carries a string typeId (or whose
// typeId changed) counts; rows whose typeId was cleared emit a
// recording with `typeId: null` so `recordMerchantHints` can drop
// the stale hint.
export function hintRecordingsFromBudget(
  prev: AccountBudget,
  next: AccountBudget,
): HintRecording[] {
  const descId = findColumnByType(next.columns, "description")?.id;
  if (!descId) return [];
  const prevById = new Map<string, Row>();
  for (const r of prev.rows) prevById.set(r.id, r);
  const out: HintRecording[] = [];
  for (const row of next.rows) {
    const before = prevById.get(row.id);
    const afterType = row.typeId ?? null;
    const beforeType = before?.typeId ?? null;
    const afterCompany = row.companyId ?? null;
    const beforeCompany = before?.companyId ?? null;
    const typeChanged = afterType !== beforeType;
    const companyChanged = afterCompany !== beforeCompany;
    if (!typeChanged && !companyChanged) continue;
    const desc = row.cells[descId];
    if (typeof desc !== "string" || desc.trim() === "") continue;
    if (afterType !== null) {
      out.push({
        description: desc,
        typeId: afterType,
        companyId: companyChanged ? afterCompany : undefined,
      });
    } else if (beforeType !== null) {
      // Type was cleared — drop the hint.
      out.push({ description: desc, typeId: null });
    } else if (companyChanged && afterCompany !== null) {
      // Type didn't change but company did. Skip — merchant hints are
      // keyed off the (type, key) pair and we only stamp company onto
      // an existing hint via the type-bearing recording. A later type
      // assignment will fold the company into the hint.
      continue;
    }
  }
  return out;
}

function applyPatch(
  row: Row,
  patch: EditPatch,
  cols: {
    descId?: string;
    amountId?: string;
    dateId?: string;
  },
): Row {
  const next: Row = { ...row, cells: { ...row.cells } };
  if (cols.descId) next.cells[cols.descId] = patch.description;
  if (cols.amountId && patch.amount !== null) {
    next.cells[cols.amountId] = patch.amount;
    // The edit modals don't speak formula yet (v1 limitation); when
    // the user retypes a literal amount on a row that previously
    // carried `amountFormula`, treat that as "replace the formula
    // with this literal" so the visible value matches what the user
    // just typed. Re-editing the formula itself goes through the
    // ComplexEntryModal (delete + re-add for v1).
    if (next.amountFormula !== undefined) delete next.amountFormula;
  }
  // `undefined` means "don't touch"; explicit `null` clears the type
  // and the row falls back to its description as the primary label.
  if (patch.typeId !== undefined) {
    if (patch.typeId === null) {
      delete next.typeId;
      delete next.typeIdLocked;
    } else {
      next.typeId = patch.typeId;
      // The edit modal is an explicit user choice — lock the row out
      // of pattern-driven re-labelling, same as the inline type cell.
      next.typeIdLocked = true;
    }
  }
  // Same tri-state contract as typeId: undefined = don't touch,
  // null = clear, string = set.
  if (patch.companyId !== undefined) {
    if (patch.companyId === null) {
      delete next.companyId;
    } else {
      next.companyId = patch.companyId;
    }
  }
  if (cols.dateId && patch.dateShiftDays && patch.dateShiftDays !== 0) {
    const cur = next.cells[cols.dateId];
    if (typeof cur === "string" && cur !== "") {
      next.cells[cols.dateId] = addDaysIso(cur, patch.dateShiftDays);
    }
  }
  return next;
}

// Walk the diff between prev and next; for any row whose description
// or amount changed and that isn't locked to a manual type, look up
// the first rule that matches the new shape and write the rule's
// typeId onto the row. Additive only — see the header note in
// `pattern-apply.ts`: when no rule wins, the row's existing typeId
// is preserved. Returns next unchanged when no row moves
// (referentially identical so the outer reducer can short-circuit).
export function applyPatternsAfterCellEdit(
  prev: AccountBudget,
  next: AccountBudget,
  rules: readonly MatchRule[],
): AccountBudget {
  if (rules.length === 0) return next;
  const cols = resolveCandidateColumns(next.columns);
  if (cols.descId === undefined && cols.amountId === undefined) return next;
  const prevById = new Map<string, Row>();
  for (const r of prev.rows) prevById.set(r.id, r);
  let changed = false;
  const nextRows = next.rows.map((row) => {
    if (row.typeIdLocked) return row;
    const candidate = candidateFromRow(row, cols);
    if (!candidate) return row;
    const before = prevById.get(row.id);
    const descChanged =
      cols.descId !== undefined &&
      (!before || before.cells[cols.descId] !== row.cells[cols.descId]);
    const amountChanged =
      cols.amountId !== undefined &&
      (!before || before.cells[cols.amountId] !== row.cells[cols.amountId]);
    if (!descChanged && !amountChanged) return row;
    const rule = findMatchingRuleForCandidate(rules, candidate);
    if (!rule || !rule.typeId) return row;
    const ruleCompanyId =
      rule.companyId !== undefined && rule.companyId !== null
        ? rule.companyId
        : undefined;
    const typeNeedsUpdate = rule.typeId !== row.typeId;
    const companyNeedsUpdate =
      ruleCompanyId !== undefined && ruleCompanyId !== row.companyId;
    if (!typeNeedsUpdate && !companyNeedsUpdate) return row;
    changed = true;
    const nextRow: Row = { ...row, typeId: rule.typeId };
    if (ruleCompanyId !== undefined) nextRow.companyId = ruleCompanyId;
    return nextRow;
  });
  if (!changed) return next;
  return { ...next, rows: nextRows };
}

export function reduceAccountBudget(
  item: AccountBudget,
  action: ItemAction,
): AccountBudget {
  switch (action.type) {
    case "updateCell": {
      // The `type` column is a virtual view of `row.typeId` — it has
      // no entry in the row's `cells` map. Route writes into `typeId`
      // directly so the picker, the description chip, and every
      // downstream consumer (modals, merchant hints) read from one
      // source of truth.
      const targetCol = item.columns.find((c) => c.id === action.columnId);
      if (targetCol?.type === "type") {
        return {
          ...item,
          rows: item.rows.map((r) => {
            if (r.id !== action.rowId) return r;
            const next: Row = { ...r };
            if (typeof action.value === "string" && action.value !== "") {
              next.typeId = action.value;
              // Manual type assignment locks the row out of pattern-
              // driven re-labelling: a later description edit shouldn't
              // silently overwrite a label the user chose by hand.
              next.typeIdLocked = true;
            } else {
              delete next.typeId;
              // Clearing the type re-opens the row to pattern matching
              // so the next description commit can pick one up.
              delete next.typeIdLocked;
            }
            return next;
          }),
        };
      }
      return {
        ...item,
        rows: item.rows.map((r) =>
          r.id === action.rowId
            ? { ...r, cells: { ...r.cells, [action.columnId]: action.value } }
            : r,
        ),
      };
    }

    case "toggleRowTransfer": {
      return {
        ...item,
        rows: item.rows.map((r) => {
          if (r.id !== action.rowId) return r;
          if (r.isTransfer) {
            const next = { ...r };
            delete next.isTransfer;
            return next;
          }
          return { ...r, isTransfer: true };
        }),
      };
    }

    case "addRow": {
      const dateCol = findColumnByType(item.columns, "date");
      const date = dateCol && action.date ? action.date : null;
      const newRow: Row = createEmptyRow(item.columns, {
        date,
        completed: defaultCompletedForDate(date),
      });
      return { ...item, rows: [...item.rows, newRow] };
    }

    case "addRowsFromComplex": {
      const { draft } = action;
      // All rows generated by one modal submit share a seriesId so they
      // can be edited or deleted together later.
      const seriesId = draft.dates.length > 1 ? newId() : undefined;
      const newRows: Row[] = draft.dates.map((date) => {
        const row = createEmptyRow(item.columns, {
          date,
          description: draft.description,
          amount: draft.amount,
          completed: defaultCompletedForDate(date),
        });
        if (seriesId) row.seriesId = seriesId;
        if (draft.typeId) {
          row.typeId = draft.typeId;
          // The modal asked the user for a type — treat the choice as
          // an explicit pick so future description edits don't reroute
          // it through pattern matching.
          row.typeIdLocked = true;
        }
        if (draft.companyId) row.companyId = draft.companyId;
        // Formula rows carry the canonical id-keyed form so renames of
        // a referenced sheet don't break the formula; the renderer
        // recomputes the amount each pass via the resolver.
        if (draft.amountFormula) row.amountFormula = draft.amountFormula;
        return row;
      });
      return { ...item, rows: [...item.rows, ...newRows] };
    }

    case "convertToRecurring": {
      const anchor = item.rows.find((r) => r.id === action.rowId);
      if (!anchor) return item;
      // Promote the anchor row into a series of its own. Future rows
      // inherit description and amount from the anchor; the typeId
      // comes from the modal so promotion and type selection happen
      // in the same step.
      const seriesId = anchor.seriesId ?? newId();
      const descCol = findColumnByType(item.columns, "description");
      const amountCol = findColumnByType(item.columns, "amount");
      const newRows: Row[] = action.futureDates.map((date) => {
        const row = createEmptyRow(item.columns, {
          date,
          description:
            descCol && typeof anchor.cells[descCol.id] === "string"
              ? (anchor.cells[descCol.id] as string)
              : "",
          amount:
            amountCol && typeof anchor.cells[amountCol.id] === "number"
              ? (anchor.cells[amountCol.id] as number)
              : 0,
          completed: false,
        });
        row.seriesId = seriesId;
        if (action.typeId) {
          row.typeId = action.typeId;
          row.typeIdLocked = true;
        }
        if (action.companyId) row.companyId = action.companyId;
        return row;
      });
      return {
        ...item,
        rows: [
          ...item.rows.map((r) => {
            if (r.id !== anchor.id) return r;
            const next: Row = { ...r, seriesId };
            if (action.typeId) {
              next.typeId = action.typeId;
              next.typeIdLocked = true;
            } else if (action.typeId === null) {
              delete next.typeId;
              delete next.typeIdLocked;
            }
            if (action.companyId) {
              next.companyId = action.companyId;
            } else if (action.companyId === null) {
              delete next.companyId;
            }
            return next;
          }),
          ...newRows,
        ],
      };
    }

    case "editSeries": {
      const anchor = item.rows.find((r) => r.id === action.rowId);
      if (!anchor) return item;
      const dateCol = findColumnByType(item.columns, "date");
      if (!dateCol) return item;
      const cols = {
        descId: findColumnByType(item.columns, "description")?.id,
        amountId: findColumnByType(item.columns, "amount")?.id,
        dateId: dateCol.id,
      };
      let targets: ReadonlySet<string>;
      if (action.scope.kind === "just-this") {
        targets = new Set([anchor.id]);
      } else if (action.scope.kind === "all") {
        targets = new Set(
          item.rows
            .filter((r) => r.seriesId === anchor.seriesId)
            .map((r) => r.id),
        );
      } else {
        const future = rowsInSeriesFrom(
          item.rows,
          anchor,
          dateCol.id,
          action.scope.untilIso,
        );
        targets = new Set(future.map((r) => r.id));
      }
      return {
        ...item,
        rows: item.rows.map((r) =>
          targets.has(r.id) ? applyPatch(r, action.patch, cols) : r,
        ),
      };
    }

    case "splitRow": {
      const idx = item.rows.findIndex((r) => r.id === action.rowId);
      if (idx < 0) return item;
      const anchor = item.rows[idx];
      const dateCol = findColumnByType(item.columns, "date");
      const completedCol = findColumnByType(item.columns, "completed");
      const amountCol = findColumnByType(item.columns, "amount");
      // Splits inherit the anchor's date and completed state so they
      // land on the same row visually and don't reset a tick-mark the
      // user already set. Description / amount / type come from the
      // submission. Formulas on the anchor are intentionally NOT
      // carried — a split represents the user's concrete allocation,
      // and a formula would re-derive an unrelated amount on the new
      // row.
      const anchorDate =
        dateCol && typeof anchor.cells[dateCol.id] === "string"
          ? (anchor.cells[dateCol.id] as string)
          : null;
      const anchorCompleted =
        completedCol && typeof anchor.cells[completedCol.id] === "boolean"
          ? (anchor.cells[completedCol.id] as boolean)
          : false;
      const splitRows: Row[] = action.splits.map((s) => {
        const r = createEmptyRow(item.columns, {
          date: anchorDate,
          description: s.description,
          amount: s.amount,
          completed: anchorCompleted,
        });
        if (s.typeId) r.typeId = s.typeId;
        if (s.companyId) r.companyId = s.companyId;
        return r;
      });
      // No remainder → the anchor is fully absorbed into the splits
      // and gets removed. Any seriesId, formula, or correction flag on
      // the anchor goes with it; future occurrences of the series stay
      // intact because they're separate rows.
      if (action.remainderAmount === 0) {
        return {
          ...item,
          rows: [
            ...item.rows.slice(0, idx),
            ...splitRows,
            ...item.rows.slice(idx + 1),
          ],
        };
      }
      // Remainder → keep the anchor (so its seriesId / typeId /
      // description survive) but swap its amount for the leftover and
      // push it to the END of the rows array so it appears below the
      // newly-inserted splits on the same date. The anchor may have
      // carried a formula whose cached cell value matched the original
      // amount; we drop the formula here because the rewritten cell is
      // a concrete leftover, not a derived value — keeping the formula
      // would re-derive the original amount on the next render and
      // erase the split.
      const remainderRow: Row = {
        ...anchor,
        cells: amountCol
          ? { ...anchor.cells, [amountCol.id]: action.remainderAmount }
          : { ...anchor.cells },
      };
      delete remainderRow.amountFormula;
      return {
        ...item,
        rows: [
          ...item.rows.slice(0, idx),
          ...splitRows,
          ...item.rows.slice(idx + 1),
          remainderRow,
        ],
      };
    }

    case "propagateCellToFuture": {
      const anchor = item.rows.find((r) => r.id === action.rowId);
      if (!anchor) return item;
      const dateCol = findColumnByType(item.columns, "date");
      if (!dateCol) return item;
      return {
        ...item,
        rows: propagateCellInSeries(
          item.rows,
          anchor,
          dateCol.id,
          action.columnId,
          action.value,
          action.untilIso,
        ),
      };
    }

    case "deleteRows": {
      const drop = new Set(action.rowIds);
      return { ...item, rows: item.rows.filter((r) => !drop.has(r.id)) };
    }

    case "bulkUpdate": {
      const ids = new Set(action.rowIds);
      const { dateCol, amountCol } = getStandardColumns(item.columns);
      return {
        ...item,
        rows: mapRowsByIds(item.rows, ids, (r) => {
          const next: Row = { ...r, cells: { ...r.cells } };
          if (action.patch.date !== undefined && dateCol) {
            next.cells[dateCol.id] = action.patch.date;
          }
          if (action.patch.amount !== undefined && amountCol) {
            next.cells[amountCol.id] = action.patch.amount;
            // Same policy as applyPatch above: a bulk-typed literal
            // replaces any previous formula on the row.
            if (next.amountFormula !== undefined) delete next.amountFormula;
          }
          if (action.patch.typeId !== undefined) {
            if (action.patch.typeId === null) delete next.typeId;
            else next.typeId = action.patch.typeId;
          }
          if (action.patch.companyId !== undefined) {
            if (action.patch.companyId === null) delete next.companyId;
            else next.companyId = action.patch.companyId;
          }
          if (action.patch.isTransfer !== undefined) {
            // Only persist `true` — absent means "not a transfer".
            if (action.patch.isTransfer) next.isTransfer = true;
            else delete next.isTransfer;
          }
          return next;
        }),
      };
    }

    case "bulkShiftToMonth": {
      const { dateCol } = getStandardColumns(item.columns);
      if (!dateCol) return item;
      const ids = new Set(action.rowIds);
      return {
        ...item,
        rows: mapRowsByIds(item.rows, ids, (r) => {
          const cur = r.cells[dateCol.id];
          if (typeof cur !== "string") return r;
          return {
            ...r,
            cells: {
              ...r.cells,
              [dateCol.id]: shiftIsoToMonth(cur, action.targetMonth),
            },
          };
        }),
      };
    }

    case "bulkCopyToMonths": {
      const { dateCol } = getStandardColumns(item.columns);
      if (!dateCol) return item;
      const ids = new Set(action.rowIds);
      const newRows: Row[] = [];
      for (const r of item.rows) {
        if (!ids.has(r.id)) continue;
        const cur = r.cells[dateCol.id];
        if (typeof cur !== "string") continue;
        for (const month of action.targetMonths) {
          // Copies are independent — drop any seriesId so they don't
          // accidentally inherit the source row's recurring group. The
          // entry type travels with the copy so the user doesn't have
          // to re-pick it on every duplicated row.
          const next: Row = {
            id: newId(),
            cells: { ...r.cells, [dateCol.id]: shiftIsoToMonth(cur, month) },
          };
          if (r.typeId) next.typeId = r.typeId;
          newRows.push(next);
        }
      }
      return { ...item, rows: [...item.rows, ...newRows] };
    }

    case "bulkMakeRecurring": {
      const { dateCol } = getStandardColumns(item.columns);
      if (!dateCol) return item;
      const ids = new Set(action.rowIds);
      // Stamp each selected row with a fresh seriesId (preserving an
      // existing one if it already had one), then replicate it at every
      // recurrence date except its own anchor date.
      const updated = mapRowsByIds(item.rows, ids, (r) => ({
        ...r,
        seriesId: r.seriesId ?? newId(),
      }));
      const additions: Row[] = [];
      for (const r of updated) {
        if (!ids.has(r.id)) continue;
        const anchorDate = r.cells[dateCol.id];
        if (typeof anchorDate !== "string") continue;
        for (const date of action.futureDates) {
          if (date === anchorDate) continue;
          const next: Row = {
            id: newId(),
            cells: { ...r.cells, [dateCol.id]: date },
            seriesId: r.seriesId,
          };
          if (r.typeId) next.typeId = r.typeId;
          additions.push(next);
        }
      }
      return { ...item, rows: [...updated, ...additions] };
    }

    case "reorderColumns":
      return {
        ...item,
        columns: moveColumn(item.columns, action.fromId, action.toId),
      };

    case "setRowFiscalMonthShift": {
      let changed = false;
      const rows = item.rows.map((r) => {
        if (r.id !== action.rowId) return r;
        const current = r.fiscalMonthShift;
        if (action.shift === null) {
          if (current === undefined) return r;
          const next = { ...r };
          delete next.fiscalMonthShift;
          changed = true;
          return next;
        }
        if (current === action.shift) return r;
        changed = true;
        return { ...r, fiscalMonthShift: action.shift };
      });
      if (!changed) return item;
      return { ...item, rows };
    }
  }
}

// Walk every row in `item` whose `seriesId` is flagged primary-income
// and re-stamp `fiscalMonthShift` from the row's current date. Rows
// outside flagged series — and rows in flagged series whose computed
// shift matches the stored value — fall through with referential
// identity preserved so the outer dispatch can short-circuit unchanged
// updates. Cheap by default: bails out before walking the rows when
// no series carries the primary-income flag.
function applyPrimaryIncomeShifts(
  item: AccountBudget,
  seriesMetadata: Readonly<Record<string, SeriesMetadata>>,
): AccountBudget {
  const flaggedSeriesIds = new Set<string>();
  for (const [seriesId, meta] of Object.entries(seriesMetadata)) {
    if (meta.isPrimaryIncome) flaggedSeriesIds.add(seriesId);
  }
  if (flaggedSeriesIds.size === 0) return item;
  const dateCol = findColumnByType(item.columns, "date");
  if (!dateCol) return item;
  let changed = false;
  const rows = item.rows.map((row) => {
    if (!row.seriesId || !flaggedSeriesIds.has(row.seriesId)) return row;
    const dateValue = row.cells[dateCol.id];
    if (typeof dateValue !== "string" || dateValue.length < 10) return row;
    const shift = computePrimaryIncomeShift(
      dateValue,
      seriesMetadata[row.seriesId],
    );
    if (shift === row.fiscalMonthShift) return row;
    const next: Row = { ...row };
    if (shift === undefined) {
      delete next.fiscalMonthShift;
    } else {
      next.fiscalMonthShift = shift;
    }
    changed = true;
    return next;
  });
  return changed ? { ...item, rows } : item;
}

function isItemAction(action: Action): action is ItemAction {
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

// Item-level dispatch tail. Reduces the targeted sheet, then walks the
// before/after of the targeted AccountBudget to extract any newly-
// assigned categories so the merchant-hint store stays in sync with
// what the user is doing in the grid. Only the touched budget
// contributes recordings; sheets the action didn't reach are
// referentially identical and short-circuit the diff.
//
// Returns null when `action` is not an item action so the outer
// reducer's `??` chain can defer to the next handler.
export function reduceItemDispatch(
  state: UserData,
  action: Action,
): UserData | null {
  if (!isItemAction(action)) return null;
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
