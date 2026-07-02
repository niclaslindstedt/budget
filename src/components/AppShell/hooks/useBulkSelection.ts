import { useCallback, useEffect, useMemo, useState } from "react";

import { unlock as unlockAchievement } from "../../../data/achievements";
import { getMonthKey } from "../../../data/fiscal-month";
import {
  historyEntryIdFromRowId,
  synthesizeHistoryRow,
} from "../../../data/synthesis";
import type { Action } from "../../../data/reducer";
import type { AccountBudget, Column, Row, UserData } from "../../../data/types";
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
  // Full workspace state — the bulk toolbar can select synthesized
  // historic (imported) rows, which don't live in `activeItem.rows`, so the
  // hook re-synthesizes the selected ones from `data.history` to copy or
  // cover them.
  data: UserData;
  // Open the create-cover-transfer modal for the given imported entry ids.
  // Threaded in so the cover action stays a thin call from the toolbar.
  openCover: (entryIds: string[]) => void;
};

type Result = {
  // Selection state
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;
  selectedRows: Row[];
  // Selection composition — the toolbar hides Edit / Move / Delete when any
  // imported (historic) row is selected (those are the bank's truth and
  // can't be mutated) and shows Cover only when every selected row is
  // historic.
  anyHistoricSelected: boolean;
  allHistoricSelected: boolean;
  onBulkCover: () => void;

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
  data,
  openCover,
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
  // never claims a stale count. A selected id is kept when it's a live
  // user row OR a synthesized historic row whose backing entry still
  // exists in the account's imported history.
  const accountId = activeItem.accountId;
  useEffect(() => {
    const existing = new Set(activeItem.rows.map((r) => r.id));
    const histEntryIds = accountId
      ? new Set((data.history[accountId] ?? []).map((e) => e.id))
      : new Set<string>();
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (existing.has(id)) {
          next.add(id);
          continue;
        }
        const eid = historyEntryIdFromRowId(id);
        if (eid && histEntryIds.has(eid)) {
          next.add(id);
          continue;
        }
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeItem.rows, accountId, data.history]);

  // Synthesize the selected historic rows on demand — they don't live in
  // `activeItem.rows`, so a Copy (and the cover total preview) needs them
  // rebuilt from the backing entries. Only the selected entries are
  // synthesized, so this stays cheap even on accounts with deep history.
  const selectedHistoricRows = useMemo<Row[]>(() => {
    if (!accountId) return [];
    const wanted = new Set<string>();
    for (const id of selectedIds) {
      const eid = historyEntryIdFromRowId(id);
      if (eid) wanted.add(eid);
    }
    if (wanted.size === 0) return [];
    const entries = data.history[accountId] ?? [];
    const rows: Row[] = [];
    for (const entry of entries) {
      if (!wanted.has(entry.id)) continue;
      rows.push(
        ...synthesizeHistoryRow(
          entry,
          activeItem.columns,
          data.merchantHints,
          data.matchRules,
          data.companies,
          data.types,
        ),
      );
    }
    return rows;
  }, [
    selectedIds,
    accountId,
    activeItem.columns,
    data.history,
    data.merchantHints,
    data.matchRules,
    data.companies,
    data.types,
  ]);

  const selectedRows = useMemo(
    () => [
      ...activeItem.rows.filter((r) => selectedIds.has(r.id)),
      ...selectedHistoricRows,
    ],
    [activeItem.rows, selectedIds, selectedHistoricRows],
  );

  const { anyHistoricSelected, allHistoricSelected } = useMemo(() => {
    let hist = 0;
    let total = 0;
    for (const id of selectedIds) {
      total += 1;
      if (id.startsWith("hist:")) hist += 1;
    }
    return {
      anyHistoricSelected: hist > 0,
      allHistoricSelected: total > 0 && hist === total,
    };
  }, [selectedIds]);

  const onBulkCover = useCallback(() => {
    const entryIds: string[] = [];
    for (const id of selectedIds) {
      const eid = historyEntryIdFromRowId(id);
      if (eid) entryIds.push(eid);
    }
    if (entryIds.length === 0) return;
    openCover(entryIds);
  }, [selectedIds, openCover]);

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
      if (moveCopyPrompt.kind === "move") {
        // Move targets `item.rows` in place, so we still pass ids —
        // synthesized rows (history / transfer) carry runtime-only ids
        // that won't resolve here, which is intentional: their dates
        // are bank-driven and can't be shifted.
        dispatch({
          type: "bulkShiftToMonth",
          sheetId,
          itemId,
          rowIds: moveCopyPrompt.rows.map((r) => r.id),
          targetMonth: targetMonths[0],
        });
      } else {
        // Copy passes the source rows by value so synthesized history /
        // transfer rows can be duplicated into `item.rows` as fresh
        // manual entries — they have no editable persisted form to
        // look up by id.
        dispatch({
          type: "bulkCopyToMonths",
          sheetId,
          itemId,
          sources: moveCopyPrompt.rows,
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
    anyHistoricSelected,
    allHistoricSelected,
    onBulkCover,
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
