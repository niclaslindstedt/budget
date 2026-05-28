import { useCallback } from "react";

import { autoTypeForCompany } from "../../../data/company-type-suggestions";
import { findColumnByType } from "../../../data/sheet";
import type { Action } from "../../../data/reducer";
import type {
  CellValue,
  Column,
  HistoryEntry,
  Row,
  Settings,
} from "../../../data/types";
import { formatNumber, withCurrency } from "../../../utils/format";
import type { CorrectionDeletePrompt, PendingSeriesEdit } from "../types";

type Params = {
  // Which sheet + item the dispatched mutations target. Every callback
  // routes through these so a sheet switch swaps the entire bundle.
  sheetId: string;
  itemId: string;
  // The active item's live rows / columns — needed by `onCommitCell` to
  // compute series anchors before staging the propagation prompt, and
  // by `onCorrectionDeleteRequest` to look up the amount column.
  activeRows: readonly Row[];
  activeColumns: readonly Column[];
  // The active item's account id — needed to route history-row writes
  // through `updateHistoryEntry`. `null` on accounts-page sheets (where
  // no row-level callbacks fire).
  activeAccountId: string | null;
  // Full history bucket, read by `onSetRowCompany` to look up the
  // entry's current `userTypeId` before deciding whether to auto-fill.
  history: Readonly<Record<string, readonly HistoryEntry[]>>;
  // (company, type) tallies feeding the auto-type-on-company-pick rule.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  // Active effective settings — used to pre-format the correction
  // delete prompt's delta text.
  effectiveSettings: Settings;
  // Staging slot for the "fan out to series" prompt set by
  // `onCommitCell` when a description / amount cell on a series row is
  // committed. The prompt UI consumes it; this hook only writes.
  setPendingSeriesEdit: (next: PendingSeriesEdit | null) => void;
  // Prompt setters used by the history-edit and correction-delete
  // flows. The dialog UI mounts them; this hook only writes.
  setHistoryEditPrompt: (next: { entryId: string } | null) => void;
  setCorrectionDeletePrompt: (next: CorrectionDeletePrompt | null) => void;
  dispatch: React.Dispatch<Action>;
};

type Result = {
  // Per-cell write while the user is still editing. Updates the in-
  // memory snapshot without minting a series-edit prompt.
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Cell commit — fires on blur / Enter. For series rows on
  // propagatable columns this stages a `PendingSeriesEdit` so the
  // BudgetApplySeriesDialog can offer "apply to future entries".
  onCommitCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Per-row fiscal-month shift. -1 / +1 pull / push the row into the
  // adjacent fiscal month; null clears the override.
  onSetFiscalMonthShift: (row: Row, shift: -1 | 1 | null) => void;
  // Mark a recurring series as the household's primary income — used
  // by the fiscal-month math to anchor month boundaries on payday.
  onSetSeriesPrimaryIncome: (
    seriesId: string,
    isPrimaryIncome: boolean,
    anchorDayOfMonth: number | null,
  ) => void;
  // Settings "clear-all" handlers for the three row-derivation memories
  // (merchant hints, recurring dismissals, transfer dismissals). The
  // reducer no-ops when the collection is already empty.
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
  // Flip the `isTransfer` flag on a budget row, or on the underlying
  // `HistoryEntry` for a synthesized history row.
  onToggleRowTransfer: (row: Row) => void;
  // Open the history-entry edit modal for a synthesized history row.
  onEditHistoryRequest: (row: Row) => void;
  // Patch the underlying `HistoryEntry` for a synthesized history row
  // (user description / type / company / transfer / no-company flag).
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: {
      userDescription?: string;
      userTypeId?: string | null;
      userCompanyId?: string | null;
      isTransfer?: boolean;
      noCompany?: boolean;
    },
  ) => void;
  // Row-level company writer fired by the description popover's inline
  // CompanyPicker. Routes synthesized history rows through
  // `updateHistoryEntry` and falls through to a single-row `bulkUpdate`
  // for user-authored budget rows.
  onSetRowCompany: (row: Row, companyId: string | null) => void;
  // Row-level "omit company" writer for synthesized history rows.
  onSetRowNoCompany: (row: Row, next: boolean) => void;
  // Stage the confirm-delete prompt for a correction (divider) row.
  onCorrectionDeleteRequest: (row: Row) => void;
};

export function useRowMutations({
  sheetId,
  itemId,
  activeRows,
  activeColumns,
  activeAccountId,
  history,
  companyTypeSuggestions,
  effectiveSettings,
  setPendingSeriesEdit,
  setHistoryEditPrompt,
  setCorrectionDeletePrompt,
  dispatch,
}: Params): Result {
  const onUpdateCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) =>
      dispatch({
        type: "updateCell",
        sheetId,
        itemId,
        rowId,
        columnId,
        value,
      }),
    [dispatch, sheetId, itemId],
  );

  const onCommitCell = useCallback(
    (rowId: string, columnId: string, value: CellValue) => {
      const row = activeRows.find((r) => r.id === rowId);
      if (!row?.seriesId) return;
      const col = activeColumns.find((c) => c.id === columnId);
      // Only propagate fields that make sense across every occurrence —
      // date and completed are inherently per-occurrence, balance is
      // computed.
      if (!col || (col.type !== "description" && col.type !== "amount")) {
        return;
      }
      const dateCol = findColumnByType(activeColumns, "date");
      const anchorDate =
        dateCol && typeof row.cells[dateCol.id] === "string"
          ? (row.cells[dateCol.id] as string)
          : "";
      let lastSeriesDate: string | null = null;
      if (dateCol) {
        const seriesDates = activeRows
          .filter((r) => r.seriesId === row.seriesId)
          .map((r) => r.cells[dateCol.id])
          .filter((d): d is string => typeof d === "string");
        if (seriesDates.length > 0) {
          lastSeriesDate = seriesDates.sort().at(-1) ?? null;
        }
      }
      setPendingSeriesEdit({
        rowId,
        columnId,
        fieldLabel: col.label,
        anchorDate,
        lastSeriesDate,
        value,
      });
    },
    [activeRows, activeColumns, setPendingSeriesEdit],
  );

  const onSetFiscalMonthShift = useCallback(
    (row: Row, shift: -1 | 1 | null) => {
      dispatch({
        type: "setRowFiscalMonthShift",
        sheetId,
        itemId,
        rowId: row.id,
        shift,
      });
    },
    [dispatch, sheetId, itemId],
  );

  const onSetSeriesPrimaryIncome = useCallback(
    (
      seriesId: string,
      isPrimaryIncome: boolean,
      anchorDayOfMonth: number | null,
    ) => {
      dispatch({
        type: "setSeriesPrimaryIncome",
        seriesId,
        isPrimaryIncome,
        anchorDayOfMonth,
      });
    },
    [dispatch],
  );

  const onClearMerchantHints = useCallback(
    () => dispatch({ type: "clearMerchantHints" }),
    [dispatch],
  );
  const onClearRecurringDismissals = useCallback(
    () => dispatch({ type: "clearRecurringDismissals" }),
    [dispatch],
  );
  const onClearTransferDismissals = useCallback(
    () => dispatch({ type: "clearTransferDismissals" }),
    [dispatch],
  );

  const onToggleRowTransfer = useCallback(
    (row: Row) => {
      // Synthesized history rows can't be flipped via the budget-row
      // reducer — they're derived from `UserData.history`. Route those
      // through the entry-update path so the flag lands on the
      // underlying `HistoryEntry` (and propagates back via
      // `synthesizeHistoryRow` on the next render).
      if (row.historyEntryId) {
        if (!activeAccountId) return;
        dispatch({
          type: "updateHistoryEntry",
          accountId: activeAccountId,
          entryId: row.historyEntryId,
          patch: { isTransfer: !row.isTransfer },
        });
        return;
      }
      dispatch({ type: "toggleRowTransfer", sheetId, itemId, rowId: row.id });
    },
    [dispatch, sheetId, itemId, activeAccountId],
  );

  const onEditHistoryRequest = useCallback(
    (row: Row) => {
      if (!row.historyEntryId) return;
      setHistoryEditPrompt({ entryId: row.historyEntryId });
    },
    [setHistoryEditPrompt],
  );

  const onUpdateHistoryEntry = useCallback(
    (
      accountId: string,
      entryId: string,
      patch: {
        userDescription?: string;
        userTypeId?: string | null;
        userCompanyId?: string | null;
        isTransfer?: boolean;
        noCompany?: boolean;
      },
    ) =>
      dispatch({
        type: "updateHistoryEntry",
        accountId,
        entryId,
        patch,
      }),
    [dispatch],
  );

  // Row-level company writer fired by the description popover's inline
  // CompanyPicker. Routes synthesized history rows through
  // `updateHistoryEntry` (clearing `noCompany` on assignment so the
  // metadata walkthrough's "needs attention" filter releases the
  // entry) and falls through to a single-row `bulkUpdate` for
  // user-authored budget rows. Also auto-fills the type when the row
  // has none and the company qualifies — same rule the edit modals
  // apply when the user picks a company there.
  const onSetRowCompany = useCallback(
    (row: Row, companyId: string | null) => {
      if (row.historyEntryId && activeAccountId) {
        const entry = history[activeAccountId]?.find(
          (e) => e.id === row.historyEntryId,
        );
        const userTypeId = entry?.userTypeId ?? null;
        const autoTypeId = autoTypeForCompany(
          userTypeId,
          companyId,
          companyTypeSuggestions,
        );
        const patch: {
          userCompanyId: string | null;
          noCompany?: boolean;
          userTypeId?: string;
        } = { userCompanyId: companyId };
        if (companyId !== null) patch.noCompany = false;
        if (autoTypeId !== undefined) patch.userTypeId = autoTypeId;
        dispatch({
          type: "updateHistoryEntry",
          accountId: activeAccountId,
          entryId: row.historyEntryId,
          patch,
        });
        return;
      }
      const rowTypeId = row.typeId ?? null;
      const autoTypeId = autoTypeForCompany(
        rowTypeId,
        companyId,
        companyTypeSuggestions,
      );
      const patch: {
        companyId: string | null;
        typeId?: string;
      } = { companyId };
      if (autoTypeId !== undefined) patch.typeId = autoTypeId;
      dispatch({
        type: "bulkUpdate",
        sheetId,
        itemId,
        rowIds: [row.id],
        patch,
      });
    },
    [
      dispatch,
      sheetId,
      itemId,
      activeAccountId,
      history,
      companyTypeSuggestions,
    ],
  );

  // Row-level "omit company" writer fired by the description popover's
  // inline CompanyPicker when the user picks "Omit company". Only the
  // synthesized history row carries the flag; user-authored budget rows
  // have no equivalent so the prop chain leaves the picker without an
  // `onOmitChange` and the option doesn't surface there.
  const onSetRowNoCompany = useCallback(
    (row: Row, next: boolean) => {
      if (!row.historyEntryId || !activeAccountId) return;
      const patch: {
        noCompany: boolean;
        userCompanyId?: string | null;
      } = { noCompany: next };
      // Enabling omit contradicts any explicit company override on the
      // entry — clear it so the resolver doesn't keep tagging the row.
      if (next) patch.userCompanyId = null;
      dispatch({
        type: "updateHistoryEntry",
        accountId: activeAccountId,
        entryId: row.historyEntryId,
        patch,
      });
    },
    [dispatch, activeAccountId],
  );

  const onCorrectionDeleteRequest = useCallback(
    (row: Row) => {
      // Pre-format the signed delta so the prompt reads naturally even
      // after the row is gone (the dialog body keeps showing the text
      // until React unmounts it on close).
      const amountCol = findColumnByType(activeColumns, "amount");
      const amount =
        amountCol && typeof row.cells[amountCol.id] === "number"
          ? (row.cells[amountCol.id] as number)
          : 0;
      const sign = amount >= 0 ? "+" : "−";
      const deltaText = `${sign}${withCurrency(
        formatNumber(Math.abs(amount), effectiveSettings),
        effectiveSettings,
      )}`;
      setCorrectionDeletePrompt({
        sheetId,
        itemId,
        rowId: row.id,
        deltaText,
      });
    },
    [
      activeColumns,
      sheetId,
      itemId,
      effectiveSettings,
      setCorrectionDeletePrompt,
    ],
  );

  return {
    onUpdateCell,
    onCommitCell,
    onSetFiscalMonthShift,
    onSetSeriesPrimaryIncome,
    onClearMerchantHints,
    onClearRecurringDismissals,
    onClearTransferDismissals,
    onToggleRowTransfer,
    onEditHistoryRequest,
    onUpdateHistoryEntry,
    onSetRowCompany,
    onSetRowNoCompany,
    onCorrectionDeleteRequest,
  };
}
