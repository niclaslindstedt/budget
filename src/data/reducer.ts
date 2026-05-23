import {
  DEFAULT_CATEGORY_ID,
  PRESET_CATEGORY_IDS,
  PRESET_ENTRY_TYPE_IDS,
} from "./constants";
import {
  createEmptyRow,
  defaultCompletedForDate,
  findColumnByType,
  getStandardColumns,
  mapRowsByIds,
  mintBudgetRow,
  moveColumn,
  newId,
  propagateCellInSeries,
  rowsInSeriesFrom,
  shiftIsoToMonth,
  updateAccountBudget,
  updateHistoryEntry,
} from "./sheet";
import { nextUncoveredDate } from "./coverage";
import { findRuleDrivenCandidates } from "./reconciliation";
import { type HintRecording, recordMerchantHints } from "./merchant-hints";
import type {
  Account,
  AccountBudget,
  Category,
  CellValue,
  EntryType,
  EntryTypeKind,
  HistoryEntry,
  HistoryEntrySplit,
  MatchRule,
  Row,
  SeriesMatchRule,
  Settings,
  Sheet,
  Transaction,
  UserData,
} from "./types";
import type {
  BulkPatch,
  ComplexEntryDraft,
  EditPatch,
  EditScope,
  SheetDraft,
  SplitSubmission,
} from "./action-payloads";
import {
  computeOpeningBalanceFromHistory,
  mergeHistory,
  type ParsedBankEntry,
} from "../storage/bank-parsers";
import { addDaysIso } from "../utils/date";

// Every item-level action carries both `sheetId` (so the dispatcher can
// find the right sheet quickly) and `itemId` (so a sheet that grows to
// hold multiple items can target the right one). Today the UI only
// renders one AccountBudget per sheet, so `itemId` always resolves to
// the same value, but plumbing it through now means future multi-item
// support drops in without another reducer rewrite.
type ItemAction =
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
      // transaction and history row variants set their transfer status
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
    };

export type Action =
  | ItemAction
  | { type: "replace"; data: UserData }
  | { type: "addCategory"; category: Category }
  | {
      type: "updateCategory";
      categoryId: string;
      patch: Partial<Omit<Category, "id">>;
    }
  | { type: "deleteCategory"; categoryId: string }
  | { type: "setPresetCategoryHidden"; presetId: string; hidden: boolean }
  | { type: "addType"; entryType: EntryType }
  | {
      type: "updateType";
      typeId: string;
      patch: Partial<Omit<EntryType, "id">>;
    }
  | { type: "deleteType"; typeId: string }
  | { type: "setPresetTypeHidden"; presetId: string; hidden: boolean }
  | { type: "setPresetTypeKind"; presetId: string; kind: EntryTypeKind }
  | { type: "updateSettings"; settings: Settings }
  | { type: "renameSheet"; sheetId: string; name: string }
  | {
      type: "setItemAccount";
      sheetId: string;
      itemId: string;
      accountId: string | null;
    }
  | { type: "createAccount"; account: Account }
  | { type: "updateAccount"; accountId: string; patch: Partial<Account> }
  | { type: "deleteAccount"; accountId: string }
  | {
      // Drop bank history, transactions, and import-audit rows that
      // predate `cutoffDate` for the named account. Used when the
      // account's purpose changes (e.g. a private account turning into
      // a shared household account) and the user no longer wants the
      // pre-cutoff history dangling. Entries dated on or after the
      // cutoff are kept untouched.
      type: "cutAccountHistory";
      accountId: string;
      cutoffDate: string;
    }
  | {
      // Append a balance-correction row to the first AccountBudget that
      // tracks `accountId`. The amount carries the signed delta needed
      // to bring the account's running total to the user-asserted
      // value; `date` is the day to stamp the correction with. No-op
      // when no budget references the account — the UI gates the click
      // on that condition but the reducer enforces it too.
      type: "correctAccountBalance";
      accountId: string;
      date: string;
      amount: number;
    }
  | { type: "createTransaction"; transaction: Transaction }
  | {
      type: "updateTransaction";
      transactionId: string;
      patch: Partial<Transaction>;
    }
  | { type: "deleteTransaction"; transactionId: string }
  | {
      // Drop a budget row and mint a transaction in one cycle so the
      // app never sits in a state where the same logical transfer
      // exists twice (once as a row, once as a transaction).
      type: "promoteRowToTransaction";
      sheetId: string;
      itemId: string;
      rowId: string;
      transaction: Transaction;
    }
  | { type: "addSheet"; sheet: Sheet }
  | { type: "updateSheetMeta"; sheetId: string; meta: SheetDraft }
  | { type: "deleteSheet"; sheetId: string }
  | { type: "selectSheet"; sheetId: string }
  | {
      // Merge a parsed bank statement into the named account. The
      // reducer dedups entries against existing history (by content
      // hash), records a `HistoryImport` audit row, re-anchors the
      // account's `openingBalance` to the earliest entry's pre-row
      // balance, back-fills `clearing` / `accountNumber` on the
      // account when those fields are empty, and drops any balance
      // corrections whose date falls inside the imported range (the
      // bank is now authoritative there). Pure: every payload field
      // is data, so the action can be replayed for tests.
      type: "importBankHistory";
      accountId: string;
      bankParserId: string;
      filename: string;
      bankClearing?: string;
      bankAccountNumber?: string;
      entries: ParsedBankEntry[];
      now: number;
    }
  | {
      // Promote a recurring-detection candidate into a real series of
      // budget rows on the active budget. The action carries the full
      // payload the reducer needs — description, amount, glyph,
      // categoryId, dates — so the dispatcher stays a pure function of
      // its inputs (the candidate + the user's confirmed adjustments).
      // The reducer also records the chosen typeId as a merchant
      // hint (keyed by `sourceDescription` so future imports of the same
      // bank text resolve to it) and adds `key` to
      // `recurringDismissals` so the candidate disappears from the
      // panel — consumed candidates don't keep resurfacing on every
      // subsequent import.
      type: "promoteRecurringCandidate";
      sheetId: string;
      itemId: string;
      key: string;
      // Raw bank text from the detected candidate. Used as the
      // merchant-hint normalisation key so the hint matches future
      // imports of the same merchant, even when the user adjusted the
      // displayed `description` on the promote modal.
      sourceDescription: string;
      description: string;
      amount: number;
      typeId: string | null;
      dates: string[];
      now: number;
    }
  | {
      // Promote a single imported history entry into a recurring
      // series on the active budget. Mirrors `promoteRecurringCandidate`
      // for the row-minting half, then extends the recorded merchant
      // hint with the user-typed description and typeId so every
      // other history entry that normalises to the same merchant key
      // displays under the user's label without further writes.
      type: "promoteHistoryToRecurring";
      sheetId: string;
      itemId: string;
      // The bank-supplied description on the source history entry.
      // Used to normalise into the merchant-hint key — the user's
      // typed label drives the overlay but the key itself is bank-
      // text-derived so the lookup matches future imports too.
      sourceDescription: string;
      description: string;
      amount: number;
      typeId: string | null;
      dates: string[];
      // When false, the merchant hint is not stamped — past entries
      // sharing the merchant key keep their raw bank text. The future
      // series still gets minted.
      applyToHistoric: boolean;
      now: number;
    }
  | {
      // Persist a "Not recurring" dismissal so the detector skips this
      // bucket on every subsequent import. `key` is the candidate's
      // normalised description (the same key the detector and hint
      // store use). The settings UI clears the whole list via
      // `clearRecurringDismissals` so a misclick is recoverable.
      type: "dismissRecurringCandidate";
      key: string;
    }
  | {
      // Bulk variant of `dismissRecurringCandidate` for the panel's
      // "Dismiss all" button — adds every key in one reducer pass so
      // the panel doesn't re-render between dismissals.
      type: "dismissRecurringCandidates";
      keys: readonly string[];
    }
  | { type: "clearRecurringDismissals" }
  | {
      // Collapse one detected cross-account pair into a single
      // Transaction and mark both HistoryEntrys as `hidden: true` with
      // the new transaction's id stored on `collapsedIntoTransactionId`
      // so the operation is reversible (delete the tx → clear the
      // backref → un-hide) and idempotent (subsequent runs skip
      // already-collapsed pairs).
      type: "collapseTransferPair";
      fromAccountId: string;
      toAccountId: string;
      fromEntryId: string;
      toEntryId: string;
      date: string;
      description: string;
      amount: number;
    }
  | {
      // Persist a "Never collapse this pair" dismissal so the detector
      // stops re-surfacing it. The key is the pair's stable identifier
      // (sorted entry ids joined). `clearTransferDismissals` unwinds
      // the list from settings.
      type: "dismissTransferPair";
      pairKey: string;
    }
  | { type: "clearTransferDismissals" }
  | { type: "clearMerchantHints" }
  | {
      // Append a new wildcard match rule to `UserData.matchRules`. The
      // rule labels every history entry whose raw description matches
      // its pattern; rendered through `synthesizeHistoryRow` so past
      // and future imports both pick it up without rewriting any
      // stored entries.
      type: "createMatchRule";
      rule: MatchRule;
    }
  | {
      // Replace one rule in place, identified by `rule.id`. No-op if
      // the id is unknown so a stale modal can't silently append a
      // new rule under an old id.
      type: "updateMatchRule";
      rule: MatchRule;
    }
  | { type: "deleteMatchRule"; ruleId: string }
  | {
      // Per-entry override on a single `HistoryEntry`. Patches the
      // entry's `userDescription` and / or `userTypeId` in place so
      // the synthesized row picks the override up at the top of the
      // merge priority in `synthesizeHistoryRow`. Each patch field is
      // a tri-state: `undefined` = don't touch, `null` (typeId only)
      // or `""` (description) = clear the override, a non-empty
      // string = set the override.
      type: "updateHistoryEntry";
      accountId: string;
      entryId: string;
      patch: {
        userDescription?: string;
        userTypeId?: string | null;
        isTransfer?: boolean;
      };
    }
  | {
      // Split a bank-statement entry into multiple categorised parts.
      // `splits` is the full decomposition — the validator (and the
      // modal) ensure the signed amounts sum to the entry's bank
      // amount so the running balance stays anchored. An empty array
      // clears the existing split (back to single-row rendering).
      type: "splitHistoryEntry";
      accountId: string;
      entryId: string;
      splits: HistoryEntrySplit[];
    }
  | {
      // Apply user choices from the post-import reconciliation modal.
      // `mergedRowIds` are user rows the user confirmed map to a
      // history entry — they're deleted in a single transition.
      // `seriesRules` are auto-reconciliation rules learned from
      // "Apply to whole series" — appended verbatim.
      // `orphans` carry per-row triage decisions for predictions
      // that didn't post: either "delete" the row outright, or
      // "move" it to a new date (typically the next payday).
      type: "applyReconciliation";
      mergedRowIds: string[];
      seriesRules: SeriesMatchRule[];
      orphans: Array<
        | { rowId: string; action: "delete" }
        | { rowId: string; action: "move"; toDate: string }
      >;
    }
  | {
      // Achievement unlock. Idempotent: if `id` is already present in
      // `settings.achievements`, the action is a no-op so timestamps
      // never get overwritten. New unlocks land in `achievements` (with
      // the timestamp) and `unseenAchievements` (the queue the
      // HeaderStar reads to decide whether to glow).
      type: "recordAchievementUnlock";
      id: string;
      timestamp: number;
    }
  | {
      // Dispatched when the user dismisses the achievement-unlock
      // modal — clears the unseen queue but leaves the unlocked map
      // untouched. Empties to `[]`; if the queue is already empty the
      // state object is returned unchanged so React doesn't re-render
      // dependents pointlessly.
      type: "clearUnseenAchievements";
    };

// Walk an AccountBudget's before/after rows and collect the
// description+typeId pairs that need to be folded into the merchant-
// hint store. Anything that newly carries a string typeId (or whose
// typeId changed) counts; rows whose typeId was cleared emit a
// recording with `typeId: null` so `recordMerchantHints` can drop
// the stale hint.
function hintRecordingsFromBudget(
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
    if (afterType === beforeType) continue;
    const desc = row.cells[descId];
    if (typeof desc !== "string" || desc.trim() === "") continue;
    if (afterType !== null) {
      out.push({ description: desc, typeId: afterType });
    } else if (beforeType !== null) {
      // Type was cleared — drop the hint.
      out.push({ description: desc, typeId: null });
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
    if (patch.typeId === null) delete next.typeId;
    else next.typeId = patch.typeId;
  }
  if (cols.dateId && patch.dateShiftDays && patch.dateShiftDays !== 0) {
    const cur = next.cells[cols.dateId];
    if (typeof cur === "string" && cur !== "") {
      next.cells[cols.dateId] = addDaysIso(cur, patch.dateShiftDays);
    }
  }
  return next;
}

// Shared row-minting body for the two recurring-promote actions
// (`promoteRecurringCandidate` and `promoteHistoryToRecurring`).
// Both produce a series of N rows from a single (description, amount,
// typeId, dates) tuple targeting one AccountBudget; only their hint
// recording bookkeeping differs, which stays in the per-action body.
function appendSeriesRowsToBudget(
  sheets: readonly Sheet[],
  action: {
    sheetId: string;
    itemId: string;
    dates: string[];
    description: string;
    amount: number;
    typeId: string | null;
  },
): Sheet[] {
  const seriesId = action.dates.length > 1 ? newId() : undefined;
  return updateAccountBudget(sheets, action.sheetId, action.itemId, (item) => {
    const newRows: Row[] = [];
    for (const date of action.dates) {
      const row = mintBudgetRow(item.columns, {
        date,
        description: action.description,
        amount: action.amount,
        typeId: action.typeId,
        seriesId,
      });
      if (!row) return item;
      newRows.push(row);
    }
    return { ...item, rows: [...item.rows, ...newRows] };
  });
}

function reduceAccountBudget(
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
            } else {
              delete next.typeId;
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
        if (draft.typeId) row.typeId = draft.typeId;
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
        if (action.typeId) row.typeId = action.typeId;
        return row;
      });
      return {
        ...item,
        rows: [
          ...item.rows.map((r) => {
            if (r.id !== anchor.id) return r;
            const next: Row = { ...r, seriesId };
            if (action.typeId) next.typeId = action.typeId;
            else if (action.typeId === null) delete next.typeId;
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
  }
}

export function reducer(state: UserData, action: Action): UserData {
  if (action.type === "replace") return action.data;
  if (action.type === "addCategory") {
    return { ...state, categories: [...state.categories, action.category] };
  }
  if (action.type === "updateCategory") {
    // Presets are immutable — Settings hides the Edit button for them
    // and the action is a no-op if the id somehow targets a preset.
    if (PRESET_CATEGORY_IDS.has(action.categoryId)) return state;
    return {
      ...state,
      categories: state.categories.map((c) =>
        c.id === action.categoryId ? { ...c, ...action.patch } : c,
      ),
    };
  }
  if (action.type === "deleteCategory") {
    // Deleting a category cascades through the types that lived under
    // it: every user-added type with a matching `categoryId` is
    // reassigned to the catch-all "Other" category so rows that
    // referenced those types stay valid. Presets are immutable, same
    // as updateCategory.
    if (PRESET_CATEGORY_IDS.has(action.categoryId)) return state;
    const id = action.categoryId;
    return {
      ...state,
      categories: state.categories.filter((c) => c.id !== id),
      types: state.types.map((t) =>
        t.categoryId === id ? { ...t, categoryId: DEFAULT_CATEGORY_ID } : t,
      ),
    };
  }
  if (action.type === "setPresetCategoryHidden") {
    if (!PRESET_CATEGORY_IDS.has(action.presetId)) return state;
    const current = state.hiddenPresetCategoryIds;
    const isHidden = current.includes(action.presetId);
    if (action.hidden === isHidden) return state;
    return {
      ...state,
      hiddenPresetCategoryIds: action.hidden
        ? [...current, action.presetId]
        : current.filter((id) => id !== action.presetId),
    };
  }
  if (action.type === "addType") {
    return { ...state, types: [...state.types, action.entryType] };
  }
  if (action.type === "updateType") {
    if (PRESET_ENTRY_TYPE_IDS.has(action.typeId)) return state;
    return {
      ...state,
      types: state.types.map((t) =>
        t.id === action.typeId ? { ...t, ...action.patch } : t,
      ),
    };
  }
  if (action.type === "deleteType") {
    // Deleting a type cascades: every row's `typeId`, every merchant
    // hint's `typeId`, and every match rule's `typeId` that referenced
    // it gets the reference dropped. Presets are hide-only.
    if (PRESET_ENTRY_TYPE_IDS.has(action.typeId)) return state;
    const id = action.typeId;
    return {
      ...state,
      types: state.types.filter((t) => t.id !== id),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) => {
          if (item.type !== "accountBudget") return item;
          return {
            ...item,
            rows: item.rows.map((r) => {
              if (r.typeId !== id) return r;
              const { typeId: _drop, ...rest } = r;
              void _drop;
              return rest;
            }),
          };
        }),
      })),
      // Hints whose typeId points at the deleted type lose their only
      // actionable field — drop the entry entirely. The next time the
      // user assigns a type to a row matching the same merchant key,
      // a fresh hint will land here.
      merchantHints: Object.fromEntries(
        Object.entries(state.merchantHints).filter(
          ([, hint]) => hint.typeId !== id,
        ),
      ),
      matchRules: state.matchRules.map((rule) =>
        rule.typeId === id ? { ...rule, typeId: null } : rule,
      ),
    };
  }
  if (action.type === "setPresetTypeHidden") {
    if (!PRESET_ENTRY_TYPE_IDS.has(action.presetId)) return state;
    const current = state.hiddenPresetTypeIds;
    const isHidden = current.includes(action.presetId);
    if (action.hidden === isHidden) return state;
    return {
      ...state,
      hiddenPresetTypeIds: action.hidden
        ? [...current, action.presetId]
        : current.filter((id) => id !== action.presetId),
    };
  }
  if (action.type === "setPresetTypeKind") {
    if (!PRESET_ENTRY_TYPE_IDS.has(action.presetId)) return state;
    const current = state.presetTypeKindOverrides;
    if (current[action.presetId] === action.kind) return state;
    const next = { ...current, [action.presetId]: action.kind };
    return { ...state, presetTypeKindOverrides: next };
  }
  if (action.type === "updateSettings") {
    // Achievements and the unseen queue have their own dispatch path
    // (`recordAchievementUnlock` / `clearUnseenAchievements`). Preserve
    // them across a settings replacement so a concurrent unlock that
    // landed in the reducer between the caller capturing `settings`
    // and the dispatch firing isn't silently overwritten. This applies
    // to the SettingsModal save (whose draft was seeded from `settings`
    // on open) and to `useChangelogAutoOpen`, which captures
    // `settingsRef.current` on mount before the achievement-watcher
    // gets a chance to drain its bus.
    return {
      ...state,
      settings: {
        ...action.settings,
        achievements: state.settings.achievements,
        unseenAchievements: state.settings.unseenAchievements,
      },
    };
  }
  if (action.type === "createAccount") {
    return { ...state, accounts: [...state.accounts, action.account] };
  }
  if (action.type === "updateAccount") {
    return {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id === action.accountId ? { ...a, ...action.patch } : a,
      ),
    };
  }
  if (action.type === "deleteAccount") {
    // Cascading detach: clear `accountId` on any AccountBudget that
    // referenced this account so the budgets keep working as
    // free-standing ledgers, and drop any transactions that touched
    // it (a transfer between two known accounts loses its other half
    // once one side is gone, so the cleanest answer is removal).
    // Imported history and import audit rows belong to the account
    // and are dropped alongside it.
    const nextHistory = { ...state.history };
    delete nextHistory[action.accountId];
    const nextHistoryImports = { ...state.historyImports };
    delete nextHistoryImports[action.accountId];
    return {
      ...state,
      accounts: state.accounts.filter((a) => a.id !== action.accountId),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) =>
          item.type === "accountBudget" && item.accountId === action.accountId
            ? { ...item, accountId: null }
            : item,
        ),
      })),
      transactions: state.transactions.filter(
        (tx) =>
          tx.fromAccountId !== action.accountId &&
          tx.toAccountId !== action.accountId,
      ),
      history: nextHistory,
      historyImports: nextHistoryImports,
    };
  }
  if (action.type === "cutAccountHistory") {
    const accountId = action.accountId;
    const cutoff = action.cutoffDate;
    const nextHistory = { ...state.history };
    const existing = nextHistory[accountId] ?? [];
    nextHistory[accountId] = existing.filter((entry) => entry.date >= cutoff);
    const nextHistoryImports = { ...state.historyImports };
    const existingImports = nextHistoryImports[accountId] ?? [];
    nextHistoryImports[accountId] = existingImports.filter(
      (rec) => rec.rangeEnd >= cutoff,
    );
    return {
      ...state,
      history: nextHistory,
      historyImports: nextHistoryImports,
      transactions: state.transactions.filter(
        (tx) =>
          !(
            (tx.fromAccountId === accountId || tx.toAccountId === accountId) &&
            tx.date < cutoff
          ),
      ),
    };
  }
  if (action.type === "importBankHistory") {
    const existing = state.history[action.accountId] ?? [];
    const { merged, addedCount, duplicateCount, addedIds } = mergeHistory(
      existing,
      action.entries,
      action.now,
    );
    // Silently apply stored series rules: any newly-imported entry
    // that fits one of the user's prior "Apply to whole series"
    // confirmations cancels the predicted row without going through
    // the modal. The modal only opens for residual unresolved pairs.
    const newlyAdded = merged.filter((e) => addedIds.has(e.id));
    const autoDeletedRowIds = new Set<string>();
    if (state.seriesMatchRules.length > 0 && newlyAdded.length > 0) {
      for (const sheet of state.sheets) {
        for (const item of sheet.items) {
          if (item.type !== "accountBudget") continue;
          if (item.accountId !== action.accountId) continue;
          const matches = findRuleDrivenCandidates(
            state.seriesMatchRules,
            newlyAdded,
            item.rows,
            item.columns,
          );
          for (const m of matches) autoDeletedRowIds.add(m.rowId);
        }
      }
    }
    // Re-anchor the opening balance from the earliest entry in the
    // merged set so the running balance lines up with what the bank
    // says, even if the user later imports an older statement that
    // pushes the earliest date back further.
    const opening = computeOpeningBalanceFromHistory(merged);
    const importRecord = {
      id: newId(),
      importedAt: action.now,
      filename: action.filename,
      bankParserId: action.bankParserId,
      rangeStart: action.entries.reduce(
        (min, e) => (min === "" || e.date < min ? e.date : min),
        "",
      ),
      rangeEnd: action.entries.reduce(
        (max, e) => (e.date > max ? e.date : max),
        "",
      ),
      addedCount,
      duplicateCount,
    };
    const priorImports = state.historyImports[action.accountId] ?? [];
    // Sweep balance corrections out of the imported date range: once the
    // bank has authoritative entries for those dates, a manual delta
    // sitting in the same window would just double-count.
    const { rangeStart, rangeEnd } = importRecord;
    const sheets =
      rangeStart === "" && rangeEnd === "" && autoDeletedRowIds.size === 0
        ? state.sheets
        : state.sheets.map((sheet) => {
            let touched = false;
            const items = sheet.items.map((item) => {
              if (item.type !== "accountBudget") return item;
              if (item.accountId !== action.accountId) return item;
              const dateCol = findColumnByType(item.columns, "date");
              const filtered = item.rows.filter((r) => {
                if (autoDeletedRowIds.has(r.id)) return false;
                if (!r.isCorrection) return true;
                if (rangeStart === "" || rangeEnd === "") return true;
                if (!dateCol) return true;
                const d = r.cells[dateCol.id];
                if (typeof d !== "string") return true;
                return d < rangeStart || d > rangeEnd;
              });
              if (filtered.length === item.rows.length) return item;
              touched = true;
              return { ...item, rows: filtered };
            });
            return touched ? { ...sheet, items } : sheet;
          });
    return {
      ...state,
      accounts: state.accounts.map((a) => {
        if (a.id !== action.accountId) return a;
        const patch: Partial<typeof a> = {};
        if (opening !== null) patch.openingBalance = opening;
        // Back-fill clearing / accountNumber only when they're empty,
        // so a manual override isn't clobbered by a re-import.
        if (!a.clearing && action.bankClearing)
          patch.clearing = action.bankClearing;
        if (!a.accountNumber && action.bankAccountNumber)
          patch.accountNumber = action.bankAccountNumber;
        return { ...a, ...patch };
      }),
      sheets,
      history: { ...state.history, [action.accountId]: merged },
      historyImports: {
        ...state.historyImports,
        [action.accountId]: [...priorImports, importRecord],
      },
    };
  }
  if (action.type === "correctAccountBalance") {
    // Find the first AccountBudget that tracks the target account.
    // When an account is referenced by multiple budgets, the correction
    // lands in the earliest one — `accountBalance` walks all budgets so
    // the displayed total still agrees regardless of where the row
    // physically sits. No-op when nothing matches.
    let target: { sheetId: string; itemId: string } | null = null;
    outer: for (const sheet of state.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId !== action.accountId) continue;
        target = { sheetId: sheet.id, itemId: item.id };
        break outer;
      }
    }
    if (!target) return state;
    // The reducer is pure — no useT() available here. The balance-
    // correction row gets a description in whichever language the
    // user's chosen at the moment they correct the balance.
    const description =
      state.settings.language === "sv"
        ? "Saldokorrigering"
        : "Balance correction";
    const sheets = updateAccountBudget(
      state.sheets,
      target.sheetId,
      target.itemId,
      (item) => {
        const row = mintBudgetRow(item.columns, {
          date: action.date,
          description,
          amount: action.amount,
        });
        if (!row) return item;
        row.isCorrection = true;
        return { ...item, rows: [...item.rows, row] };
      },
    );
    if (sheets === state.sheets) return state;
    return { ...state, sheets };
  }
  if (action.type === "createTransaction") {
    const next = {
      ...state,
      transactions: [...state.transactions, action.transaction],
    };
    return recordMerchantHints(
      next,
      [
        {
          description: action.transaction.description,
          typeId: action.transaction.typeId ?? null,
        },
      ],
      Date.now(),
    );
  }
  if (action.type === "updateTransaction") {
    const prev = state.transactions.find((t) => t.id === action.transactionId);
    const next = {
      ...state,
      transactions: state.transactions.map((tx) =>
        tx.id === action.transactionId ? { ...tx, ...action.patch } : tx,
      ),
    };
    // Only fire a hint recording when the type was actually touched
    // by this update; otherwise unrelated edits (date, amount, …)
    // would re-stamp `lastUsedAt` on an unrelated hint.
    if (prev && action.patch.typeId !== undefined) {
      const description =
        action.patch.description !== undefined
          ? action.patch.description
          : prev.description;
      return recordMerchantHints(
        next,
        [{ description, typeId: action.patch.typeId ?? null }],
        Date.now(),
      );
    }
    return next;
  }
  if (action.type === "deleteTransaction") {
    // Also clear the `collapsedIntoTransactionId` backref on any
    // history entry that pointed at this transaction, and un-hide
    // those entries — collapse is reversible only if the entries
    // come back when the transaction goes away. We don't try to
    // distinguish "this transaction was a collapse" from "this was
    // a user-created transfer" because the backref disambiguates: an
    // entry only un-hides if it's pointing at the deleted tx.
    const txId = action.transactionId;
    let touchedHistory = false;
    const history: Record<string, HistoryEntry[]> = {};
    for (const [accountId, entries] of Object.entries(state.history)) {
      let touched = false;
      const next = entries.map((e) => {
        if (e.collapsedIntoTransactionId !== txId) return e;
        touched = true;
        const restored: HistoryEntry = { ...e };
        delete restored.collapsedIntoTransactionId;
        delete restored.hidden;
        return restored;
      });
      history[accountId] = touched ? next : entries;
      if (touched) touchedHistory = true;
    }
    return {
      ...state,
      transactions: state.transactions.filter(
        (tx) => tx.id !== action.transactionId,
      ),
      history: touchedHistory ? history : state.history,
    };
  }
  if (action.type === "promoteRowToTransaction") {
    const next = {
      ...state,
      transactions: [...state.transactions, action.transaction],
      sheets: updateAccountBudget(
        state.sheets,
        action.sheetId,
        action.itemId,
        (item) => ({
          ...item,
          rows: item.rows.filter((r) => r.id !== action.rowId),
        }),
      ),
    };
    return recordMerchantHints(
      next,
      [
        {
          description: action.transaction.description,
          typeId: action.transaction.typeId ?? null,
        },
      ],
      Date.now(),
    );
  }
  if (action.type === "promoteRecurringCandidate") {
    // Mint a fresh series from a recurring-detection candidate.
    // Mirrors `addRowsFromComplex` (which the user-driven complex
    // entry modal uses) so the resulting series is indistinguishable
    // from one the user typed in by hand — same seriesId semantics,
    // same glyph propagation, same row shape. The candidate's key is
    // pushed onto `recurringDismissals` after row creation so the
    // panel drops it on the next render and future imports won't
    // resurface a series the user has already promoted.
    const nextSheets = appendSeriesRowsToBudget(state.sheets, action);
    const dismissals = state.recurringDismissals.includes(action.key)
      ? state.recurringDismissals
      : [...state.recurringDismissals, action.key];
    const next = {
      ...state,
      sheets: nextSheets,
      recurringDismissals: dismissals,
    };
    if (action.typeId === null) return next;
    // Key the merchant hint by the raw bank text (`sourceDescription`)
    // so future imports of the same merchant pick up the suggestion
    // even when the user edited the displayed description. When the
    // edit differs from the bank text, record it as an override so
    // synthesized history rows surface the user's label too.
    const override =
      action.description.trim() !== action.sourceDescription.trim()
        ? action.description
        : undefined;
    return recordMerchantHints(
      next,
      [
        {
          description: action.sourceDescription,
          typeId: action.typeId,
          description_override: override,
        },
      ],
      action.now,
    );
  }
  if (action.type === "promoteHistoryToRecurring") {
    // Mint a series like the recurring-candidate promote does, then
    // stamp the merchant hint with the user's chosen typeId and
    // description override so every synthesized history row that
    // normalises to the same key inherits the labels on the next
    // render. The source description (raw bank text) is what we feed
    // to `recordMerchantHints` so the normalised key matches future
    // imports too.
    const next = {
      ...state,
      sheets: appendSeriesRowsToBudget(state.sheets, action),
    };
    // The hint must carry typeId (`recordMerchantHints` derives the
    // category through `type.categoryId`), so skip the recording when
    // the user declined to set a type. The new rows still got minted;
    // the user can backfill labels later by promoting again with one.
    if (action.typeId === null) return next;
    // Honour the "apply to historic matches" opt-out from the modal:
    // when the user unchecked it, mint the future series but skip the
    // merchant-hint stamp so past entries keep their bank text.
    if (!action.applyToHistoric) return next;
    return recordMerchantHints(
      next,
      [
        {
          description: action.sourceDescription,
          typeId: action.typeId,
          description_override: action.description,
        },
      ],
      action.now,
    );
  }
  if (action.type === "dismissRecurringCandidate") {
    if (state.recurringDismissals.includes(action.key)) return state;
    return {
      ...state,
      recurringDismissals: [...state.recurringDismissals, action.key],
    };
  }
  if (action.type === "dismissRecurringCandidates") {
    const existing = new Set(state.recurringDismissals);
    const additions = action.keys.filter((k) => !existing.has(k));
    if (additions.length === 0) return state;
    return {
      ...state,
      recurringDismissals: [...state.recurringDismissals, ...additions],
    };
  }
  if (action.type === "clearRecurringDismissals") {
    if (state.recurringDismissals.length === 0) return state;
    return { ...state, recurringDismissals: [] };
  }
  if (action.type === "collapseTransferPair") {
    // Mint a new Transaction and stamp the two source entries as
    // collapsed + hidden. Idempotent: a re-run that finds the same
    // pair already carrying a backref skips the action entirely.
    const fromEntries = state.history[action.fromAccountId] ?? [];
    const toEntries = state.history[action.toAccountId] ?? [];
    const fromEntry = fromEntries.find((e) => e.id === action.fromEntryId);
    const toEntry = toEntries.find((e) => e.id === action.toEntryId);
    if (!fromEntry || !toEntry) return state;
    if (fromEntry.collapsedIntoTransactionId) return state;
    if (toEntry.collapsedIntoTransactionId) return state;
    const transaction: Transaction = {
      id: newId(),
      date: action.date,
      description: action.description,
      amount: action.amount,
      fromAccountId: action.fromAccountId,
      toAccountId: action.toAccountId,
    };
    return {
      ...state,
      transactions: [...state.transactions, transaction],
      history: {
        ...state.history,
        [action.fromAccountId]: fromEntries.map((e) =>
          e.id === action.fromEntryId
            ? {
                ...e,
                hidden: true,
                collapsedIntoTransactionId: transaction.id,
              }
            : e,
        ),
        [action.toAccountId]: toEntries.map((e) =>
          e.id === action.toEntryId
            ? {
                ...e,
                hidden: true,
                collapsedIntoTransactionId: transaction.id,
              }
            : e,
        ),
      },
    };
  }
  if (action.type === "dismissTransferPair") {
    if (state.transferCollapseDismissals.includes(action.pairKey)) return state;
    return {
      ...state,
      transferCollapseDismissals: [
        ...state.transferCollapseDismissals,
        action.pairKey,
      ],
    };
  }
  if (action.type === "clearTransferDismissals") {
    if (state.transferCollapseDismissals.length === 0) return state;
    return { ...state, transferCollapseDismissals: [] };
  }
  if (action.type === "clearMerchantHints") {
    if (Object.keys(state.merchantHints).length === 0) return state;
    return { ...state, merchantHints: {} };
  }
  if (action.type === "createMatchRule") {
    // Append, not prepend: rules earlier in the array win, and a
    // fresh rule should defer to whatever the user already set up
    // unless they reorder later. Reordering UI lives in a future
    // settings panel.
    return { ...state, matchRules: [...state.matchRules, action.rule] };
  }
  if (action.type === "updateMatchRule") {
    const idx = state.matchRules.findIndex((r) => r.id === action.rule.id);
    if (idx < 0) return state;
    const next = state.matchRules.slice();
    next[idx] = action.rule;
    return { ...state, matchRules: next };
  }
  if (action.type === "deleteMatchRule") {
    const next = state.matchRules.filter((r) => r.id !== action.ruleId);
    if (next.length === state.matchRules.length) return state;
    return { ...state, matchRules: next };
  }
  if (action.type === "updateHistoryEntry") {
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        const next: HistoryEntry = { ...prev };
        if (action.patch.userDescription !== undefined) {
          const trimmed = action.patch.userDescription.trim();
          if (trimmed === "") delete next.userDescription;
          else next.userDescription = trimmed;
        }
        if (action.patch.userTypeId !== undefined) {
          if (action.patch.userTypeId === null) delete next.userTypeId;
          else next.userTypeId = action.patch.userTypeId;
        }
        if (action.patch.isTransfer !== undefined) {
          // Only persist `true` — absent means "not a transfer".
          if (action.patch.isTransfer) next.isTransfer = true;
          else delete next.isTransfer;
        }
        // Bail if the patch is a no-op so React skips a wasted render.
        if (
          next.userDescription === prev.userDescription &&
          next.userTypeId === prev.userTypeId &&
          next.isTransfer === prev.isTransfer
        ) {
          return prev;
        }
        return next;
      },
    );
    if (history === state.history) return state;
    return { ...state, history };
  }
  if (action.type === "splitHistoryEntry") {
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        const next: HistoryEntry = { ...prev };
        // An empty splits array means "clear the split" — drop the field
        // so the synthesizer falls back to the single-row path.
        if (action.splits.length === 0) {
          delete next.splits;
        } else {
          // Defensive copy so the reducer never holds a reference to the
          // dispatcher's payload.
          next.splits = action.splits.map((s) => ({ ...s }));
        }
        return next;
      },
    );
    if (history === state.history) return state;
    return { ...state, history };
  }
  if (action.type === "applyReconciliation") {
    const mergedSet = new Set(action.mergedRowIds);
    const orphanByRow = new Map(action.orphans.map((o) => [o.rowId, o]));
    // Index rows touched by both lists so we can prune sheets in
    // a single pass — modifying / deleting per-row is cheaper than
    // recomputing every sheet's rows from scratch.
    if (mergedSet.size === 0 && orphanByRow.size === 0) {
      if (action.seriesRules.length === 0) return state;
      return {
        ...state,
        seriesMatchRules: [...state.seriesMatchRules, ...action.seriesRules],
      };
    }
    const sheets = state.sheets.map((sheet) => {
      let touched = false;
      const items = sheet.items.map((item) => {
        if (item.type !== "accountBudget") return item;
        const dateCol = findColumnByType(item.columns, "date");
        let rowsTouched = false;
        const nextRows: Row[] = [];
        for (const row of item.rows) {
          if (mergedSet.has(row.id)) {
            rowsTouched = true;
            continue; // delete
          }
          const orphan = orphanByRow.get(row.id);
          if (orphan?.action === "delete") {
            rowsTouched = true;
            continue;
          }
          if (orphan?.action === "move" && dateCol) {
            rowsTouched = true;
            nextRows.push({
              ...row,
              cells: { ...row.cells, [dateCol.id]: orphan.toDate },
            });
            continue;
          }
          nextRows.push(row);
        }
        if (!rowsTouched) return item;
        touched = true;
        return { ...item, rows: nextRows };
      });
      return touched ? { ...sheet, items } : sheet;
    });
    return {
      ...state,
      sheets,
      seriesMatchRules:
        action.seriesRules.length > 0
          ? [...state.seriesMatchRules, ...action.seriesRules]
          : state.seriesMatchRules,
    };
  }
  if (action.type === "renameSheet") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, name: action.name } : sheet,
      ),
    };
  }
  if (action.type === "addSheet") {
    // New sheets become the active sheet so the user lands on the
    // empty ledger they just created instead of having to chase down
    // its tab.
    return {
      ...state,
      sheets: [...state.sheets, action.sheet],
      activeSheetId: action.sheet.id,
    };
  }
  if (action.type === "updateSheetMeta") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, ...action.meta } : sheet,
      ),
    };
  }
  if (action.type === "deleteSheet") {
    // Guard against deleting the only sheet — the UI never offers it
    // but the reducer enforces it too so an externally dispatched
    // action can't strand the user with an empty workspace.
    if (state.sheets.length <= 1) return state;
    const nextSheets = state.sheets.filter((s) => s.id !== action.sheetId);
    const nextActive =
      state.activeSheetId === action.sheetId
        ? nextSheets[0].id
        : state.activeSheetId;
    return { ...state, sheets: nextSheets, activeSheetId: nextActive };
  }
  if (action.type === "selectSheet") {
    if (!state.sheets.some((s) => s.id === action.sheetId)) return state;
    return { ...state, activeSheetId: action.sheetId };
  }
  if (action.type === "setItemAccount") {
    return {
      ...state,
      sheets: updateAccountBudget(
        state.sheets,
        action.sheetId,
        action.itemId,
        (item) => ({ ...item, accountId: action.accountId }),
      ),
    };
  }
  if (action.type === "recordAchievementUnlock") {
    // Idempotent: once an id is in `achievements`, a second call is a
    // no-op so timestamps don't drift. New ids land in both the
    // unlocked map (with the timestamp) and the unseen queue (so the
    // HeaderStar lights up).
    const existing = state.settings.achievements;
    if (existing[action.id] !== undefined) return state;
    const unseen = state.settings.unseenAchievements.includes(action.id)
      ? state.settings.unseenAchievements
      : [...state.settings.unseenAchievements, action.id];
    return {
      ...state,
      settings: {
        ...state.settings,
        achievements: { ...existing, [action.id]: action.timestamp },
        unseenAchievements: unseen,
      },
    };
  }
  if (action.type === "clearUnseenAchievements") {
    if (state.settings.unseenAchievements.length === 0) return state;
    return {
      ...state,
      settings: { ...state.settings, unseenAchievements: [] },
    };
  }
  // Snap date edits forward when the proposed value lands in a
  // calendar month covered by imported history. The bank is
  // authoritative there, so dropping a row into that window would
  // create a false record; nudge the value to the first day of the
  // next uncovered month instead. Applied here (before the
  // sub-reducer runs) so every date-mutating surface — inline cell,
  // edit modal, future drag-to-date — inherits the policy without
  // each having to know about coverage.
  let effectiveAction: Action = action;
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
        );
        if (snapped !== action.value) {
          effectiveAction = { ...action, value: snapped };
        }
      }
    }
  }
  // Item-level dispatch tail. Reduces the targeted sheet, then walks
  // the before/after of the targeted AccountBudget to extract any
  // newly-assigned categories so the merchant-hint store stays in
  // sync with what the user is doing in the grid. Only the touched
  // budget contributes recordings; sheets the action didn't reach are
  // referentially identical and short-circuit the diff.
  const recordings: HintRecording[] = [];
  const sheets = updateAccountBudget(
    state.sheets,
    action.sheetId,
    action.itemId,
    (item) => {
      const next = reduceAccountBudget(item, effectiveAction);
      if (next === item) return item;
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
