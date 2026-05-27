import { useCallback } from "react";

import { findColumnByType } from "../../../data/sheet";
import type { Action } from "../../../data/reducer";
import type { CellValue, Column, Row } from "../../../data/types";
import type { PendingSeriesEdit } from "../types";

type Params = {
  // Which sheet + item the dispatched mutations target. Every callback
  // routes through these so a sheet switch swaps the entire bundle.
  sheetId: string;
  itemId: string;
  // The active item's live rows / columns — needed by `onCommitCell` to
  // compute series anchors before staging the propagation prompt.
  activeRows: readonly Row[];
  activeColumns: readonly Column[];
  // Staging slot for the "fan out to series" prompt set by
  // `onCommitCell` when a description / amount cell on a series row is
  // committed. The prompt UI consumes it; this hook only writes.
  setPendingSeriesEdit: (next: PendingSeriesEdit | null) => void;
  dispatch: React.Dispatch<Action>;
};

type Result = {
  // Per-cell write while the user is still editing. Updates the in-
  // memory snapshot without minting a series-edit prompt.
  onUpdateCell: (rowId: string, columnId: string, value: CellValue) => void;
  // Cell commit — fires on blur / Enter. For series rows on
  // propagatable columns this stages a `PendingSeriesEdit` so the
  // ApplySeriesEditDialog can offer "apply to future entries".
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
};

export function useRowMutations({
  sheetId,
  itemId,
  activeRows,
  activeColumns,
  setPendingSeriesEdit,
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

  return {
    onUpdateCell,
    onCommitCell,
    onSetFiscalMonthShift,
    onSetSeriesPrimaryIncome,
    onClearMerchantHints,
    onClearRecurringDismissals,
    onClearTransferDismissals,
  };
}
