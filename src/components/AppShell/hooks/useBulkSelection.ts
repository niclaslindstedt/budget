import { useCallback, useEffect, useMemo, useState } from "react";

import { unlock as unlockAchievement } from "../../../data/achievements";
import { getMonthKey } from "../../../data/fiscal-month";
import type { Action } from "../../../data/reducer";
import type { AccountBudget, Column, Row } from "../../../data/types";
import type { ConfirmAction } from "../../ConfirmDialog";
import type { BulkPatch } from "../../budget/BudgetBulkEditModal";
import { useT } from "../../../i18n";
import type { useToast } from "../../../hooks";
import type { BulkDeletePrompt, MoveCopyPrompt } from "../types";

type Params = {
  sheetId: string;
  itemId: string;
  // Active rows + columns drive selectedRows pruning + the
  // moveCopySourceMonths derivation.
  activeItem: AccountBudget;
  startOfMonth: number;
  dispatch: (action: Action) => void;
  toast: ReturnType<typeof useToast>;
  // Resolved here so the hook can return both "the rows we are
  // currently editing" and "their source months" without the caller
  // re-deriving the date column.
  dateCol: Column | undefined;
};

type Result = {
  // Selection state
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  selectedRows: Row[];

  // Selection-mode toggles
  onToggleSelect: (rowId: string) => void;
  onToggleSelectMonth: (rowIds: string[], target: boolean) => void;
  onToggleSelectMode: () => void;
  onCancelSelect: () => void;

  // Bulk-edit modal
  bulkEditOpen: boolean;
  setBulkEditOpen: (open: boolean) => void;
  onBulkEdit: () => void;
  onApplyBulkPatch: (rowIds: string[], patch: BulkPatch) => void;
  onApplyBulkRecurring: (rowIds: string[], futureDates: string[]) => void;

  // Bulk-delete confirmation
  bulkDeletePrompt: BulkDeletePrompt | null;
  setBulkDeletePrompt: (prompt: BulkDeletePrompt | null) => void;
  bulkDeleteActions: ConfirmAction[];
  onBulkDelete: () => void;

  // Move / copy modal — also used by the single-row copy from the
  // row's action menu (`onCopyRequest`).
  moveCopyPrompt: MoveCopyPrompt | null;
  setMoveCopyPrompt: (prompt: MoveCopyPrompt | null) => void;
  moveCopySourceMonths: ReadonlySet<string>;
  onBulkMove: () => void;
  onBulkCopy: () => void;
  onCopyRequest: (row: Row) => void;
  handleMoveCopySubmit: (targetMonths: string[]) => void;
};

// All state and handlers for the per-budget bulk-select toolbar:
// tap-to-toggle a row, the bulk-edit / bulk-recurring modal, the
// bulk-delete confirm, and the move / copy modal. The single-row
// `Copy` action also routes through here so the modal sees the same
// `moveCopyPrompt.kind === "copy"` shape regardless of whether the
// rows came from the bulk toolbar or the per-row action menu.
export function useBulkSelection({
  sheetId,
  itemId,
  activeItem,
  startOfMonth,
  dispatch,
  toast,
  dateCol,
}: Params): Result {
  const t = useT();
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeletePrompt, setBulkDeletePrompt] =
    useState<BulkDeletePrompt | null>(null);
  const [moveCopyPrompt, setMoveCopyPrompt] = useState<MoveCopyPrompt | null>(
    null,
  );

  // Drop ids that no longer exist (e.g. after an import) so the toolbar
  // never claims a stale count.
  useEffect(() => {
    const existing = new Set(activeItem.rows.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (existing.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeItem.rows]);

  const selectedRows = useMemo(
    () => activeItem.rows.filter((r) => selectedIds.has(r.id)),
    [activeItem.rows, selectedIds],
  );

  // Source-month set fed to BudgetMoveCopyModal so the user can't pick a no-op
  // target. Driven by whichever rows the modal is currently acting on:
  // the bulk selection when the prompt was opened from the bulk-select
  // toolbar, the single row when opened from the row's swipe-menu …
  // dropdown.
  const moveCopySourceMonths = useMemo<ReadonlySet<string>>(() => {
    if (!dateCol) return new Set();
    const rows = moveCopyPrompt?.rows ?? [];
    const set = new Set<string>();
    for (const r of rows) {
      const key = getMonthKey(r.cells[dateCol.id], startOfMonth);
      if (key !== "undated") set.add(key);
    }
    return set;
  }, [moveCopyPrompt, dateCol, startOfMonth]);

  const onToggleSelect = useCallback((rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);
  const onToggleSelectMonth = useCallback(
    (rowIds: string[], target: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of rowIds) {
          if (target) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [],
  );
  const onCancelSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  const onToggleSelectMode = useCallback(() => {
    setSelectMode((on) => {
      if (on) setSelectedIds(new Set());
      return !on;
    });
  }, []);

  const bulkDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!bulkDeletePrompt) return [];
    const ids = bulkDeletePrompt.rowIds;
    return [
      {
        label:
          ids.length === 1
            ? t("app.deleteRowOne", { n: ids.length })
            : t("app.deleteRows", { n: ids.length }),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteRows", sheetId, itemId, rowIds: ids });
          setBulkDeletePrompt(null);
          onCancelSelect();
          toast.push({
            kind: "info",
            message:
              ids.length === 1
                ? t("toast.rowsDeletedOne")
                : t("toast.rowsDeletedOther", { n: ids.length }),
          });
        },
      },
    ];
  }, [bulkDeletePrompt, dispatch, sheetId, itemId, onCancelSelect, t, toast]);

  const onBulkEdit = useCallback(() => {
    unlockAchievement("bulkOps");
    setBulkEditOpen(true);
  }, []);
  const onBulkDelete = useCallback(() => {
    setBulkDeletePrompt({ kind: "bulk-delete", rowIds: [...selectedIds] });
  }, [selectedIds]);
  const onBulkMove = useCallback(() => {
    unlockAchievement("moverShaker");
    setMoveCopyPrompt({ kind: "move", rows: selectedRows });
  }, [selectedRows]);
  const onBulkCopy = useCallback(() => {
    unlockAchievement("moverShaker");
    setMoveCopyPrompt({ kind: "copy", rows: selectedRows });
  }, [selectedRows]);
  const onCopyRequest = useCallback((row: Row) => {
    setMoveCopyPrompt({ kind: "copy", rows: [row] });
  }, []);

  const onApplyBulkPatch = useCallback(
    (rowIds: string[], patch: BulkPatch) => {
      dispatch({ type: "bulkUpdate", sheetId, itemId, rowIds, patch });
    },
    [dispatch, sheetId, itemId],
  );
  const onApplyBulkRecurring = useCallback(
    (rowIds: string[], futureDates: string[]) => {
      dispatch({
        type: "bulkMakeRecurring",
        sheetId,
        itemId,
        rowIds,
        futureDates,
      });
    },
    [dispatch, sheetId, itemId],
  );

  const handleMoveCopySubmit = useCallback(
    (targetMonths: string[]) => {
      if (!moveCopyPrompt) return;
      const rowIds = moveCopyPrompt.rows.map((r) => r.id);
      if (moveCopyPrompt.kind === "move") {
        dispatch({
          type: "bulkShiftToMonth",
          sheetId,
          itemId,
          rowIds,
          targetMonth: targetMonths[0],
        });
      } else {
        dispatch({
          type: "bulkCopyToMonths",
          sheetId,
          itemId,
          rowIds,
          targetMonths,
        });
      }
      setMoveCopyPrompt(null);
      onCancelSelect();
    },
    [dispatch, moveCopyPrompt, sheetId, itemId, onCancelSelect],
  );

  return {
    selectMode,
    selectedIds,
    selectedRows,
    onToggleSelect,
    onToggleSelectMonth,
    onToggleSelectMode,
    onCancelSelect,
    bulkEditOpen,
    setBulkEditOpen,
    onBulkEdit,
    onApplyBulkPatch,
    onApplyBulkRecurring,
    bulkDeletePrompt,
    setBulkDeletePrompt,
    bulkDeleteActions,
    onBulkDelete,
    moveCopyPrompt,
    setMoveCopyPrompt,
    moveCopySourceMonths,
    onBulkMove,
    onBulkCopy,
    onCopyRequest,
    handleMoveCopySubmit,
  };
}
