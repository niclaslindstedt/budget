import { useCallback, useEffect, useMemo, useState } from "react";

import { unlock as unlockAchievement } from "../../../data/achievements";
import type { Action } from "../../../data/reducer";
import type { Salary } from "../../../data/types";
import type { SalaryBulkApply } from "../../salary/SalaryBulkEditModal";

type Params = {
  // The full salary list — used to prune selected ids that no longer
  // exist (e.g. after an import or a delete) so the bottom bar never
  // claims a stale count.
  salaries: readonly Salary[];
  dispatch: (action: Action) => void;
};

type Result = {
  selectMode: boolean;
  selectedIds: ReadonlySet<string>;

  onToggleSelect: (salaryId: string) => void;
  onToggleSelectMany: (salaryIds: string[], target: boolean) => void;
  onToggleSelectMode: () => void;
  onCancelSelect: () => void;

  // Bulk-edit modal (employer / tax-rate).
  bulkEditOpen: boolean;
  setBulkEditOpen: (open: boolean) => void;
  onBulkEdit: () => void;
  onApplyBulk: (args: SalaryBulkApply) => void;

  // Bulk-delete confirmation.
  bulkDeleteOpen: boolean;
  setBulkDeleteOpen: (open: boolean) => void;
  onBulkDelete: () => void;
  onConfirmBulkDelete: () => void;
};

// Salary-page mirror of `useBulkSelection`: it drives the universal
// BottomBar's select toggle + BulkActionBar when a salary sheet is
// active, so the salary page reuses the global "select rows" affordance
// instead of an in-page button. Salaries are pinned to their pay month,
// so there's no move / copy — only the employer / tax bulk edit and a
// delete. State lives here in AppShell because the BottomBar (which owns
// the toggle and the action bar) is rendered here, not inside SalaryPage.
export function useSalaryBulkSelection({ salaries, dispatch }: Params): Result {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Drop ids that no longer back a salary so the toolbar count stays
  // honest after a delete / import.
  const existingIds = useMemo(
    () => new Set(salaries.map((s) => s.id)),
    [salaries],
  );
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (existingIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [existingIds]);

  const onToggleSelect = useCallback((salaryId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(salaryId)) next.delete(salaryId);
      else next.add(salaryId);
      return next;
    });
  }, []);

  const onToggleSelectMany = useCallback(
    (salaryIds: string[], target: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of salaryIds) {
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

  const onBulkEdit = useCallback(() => {
    unlockAchievement("bulkOps");
    setBulkEditOpen(true);
  }, []);

  const onBulkDelete = useCallback(() => {
    setBulkDeleteOpen(true);
  }, []);

  const onApplyBulk = useCallback(
    (args: SalaryBulkApply) => {
      const ids = [...selectedIds];
      if (args.setEmployer) {
        dispatch({
          type: "bulkUpdateSalaries",
          ids,
          patch: { employerId: args.employerId },
        });
      }
      // Role after employer: `bulkSetSalaryRole` resolves the title
      // against each salary's (possibly just-changed) employer.
      if (args.setRole) {
        dispatch({ type: "bulkSetSalaryRole", ids, title: args.roleTitle });
      }
      if (args.setTaxRate) {
        dispatch({ type: "bulkSetSalaryTaxRate", ids, rate: args.rate });
      }
      setBulkEditOpen(false);
      onCancelSelect();
    },
    [selectedIds, dispatch, onCancelSelect],
  );

  const onConfirmBulkDelete = useCallback(() => {
    for (const id of selectedIds)
      dispatch({ type: "deleteSalary", salaryId: id });
    setBulkDeleteOpen(false);
    onCancelSelect();
  }, [selectedIds, dispatch, onCancelSelect]);

  return {
    selectMode,
    selectedIds,
    onToggleSelect,
    onToggleSelectMany,
    onToggleSelectMode,
    onCancelSelect,
    bulkEditOpen,
    setBulkEditOpen,
    onBulkEdit,
    onApplyBulk,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    onBulkDelete,
    onConfirmBulkDelete,
  };
}
