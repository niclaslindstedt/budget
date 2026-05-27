import { useEffect, useState } from "react";

import type { HistoryEntry, Row } from "../../../data/types";
import type {
  EditPrompt,
  EditRowPrompt,
  PendingSeriesEdit,
  SplitPrompt,
} from "../types";

type Params = {
  // Live row list for the active page item. The hygiene effects below
  // drop prompts whose target row has vanished (sheet switch, delete,
  // import) so a stale prompt can't fan out a no-longer-relevant edit.
  activeRows: readonly Row[];
  // Active account id and history map — split-modal hygiene needs
  // these to verify history-row existence (history rows aren't in
  // `activeRows`; they're synthesized from `UserData.history`).
  activeAccountId: string | null | undefined;
  history: Record<string, HistoryEntry[]>;
};

type Result = {
  // Recurring-series / promote entry editor (BudgetEditEntryModal).
  editPrompt: EditPrompt | null;
  setEditPrompt: (next: EditPrompt | null) => void;
  // Generic row editor (BudgetEditEntryFullModal) — opens on long-press or the
  // pen action button. Distinct from `editPrompt`.
  editRowPrompt: EditRowPrompt | null;
  setEditRowPrompt: (next: EditRowPrompt | null) => void;
  // Split-entry modal — opens when the scissors action button is
  // clicked.
  splitPrompt: SplitPrompt | null;
  setSplitPrompt: (next: SplitPrompt | null) => void;
  // Captures the most recent inline edit on a recurring row so the
  // user can fan the change out to every following entry in the
  // series.
  pendingSeriesEdit: PendingSeriesEdit | null;
  setPendingSeriesEdit: (next: PendingSeriesEdit | null) => void;
};

export function useEditPrompts({
  activeRows,
  activeAccountId,
  history,
}: Params): Result {
  const [editPrompt, setEditPrompt] = useState<EditPrompt | null>(null);
  const [editRowPrompt, setEditRowPrompt] = useState<EditRowPrompt | null>(
    null,
  );
  const [splitPrompt, setSplitPrompt] = useState<SplitPrompt | null>(null);
  const [pendingSeriesEdit, setPendingSeriesEdit] =
    useState<PendingSeriesEdit | null>(null);

  // Drop the pending prompt if the row vanishes (sheet switch, delete,
  // import) so a stale prompt can't fan out a no-longer-relevant edit.
  useEffect(() => {
    if (!pendingSeriesEdit) return;
    const exists = activeRows.some((r) => r.id === pendingSeriesEdit.rowId);
    if (!exists) setPendingSeriesEdit(null);
  }, [pendingSeriesEdit, activeRows]);
  // Same guard for the generic edit-row modal: if the row vanishes
  // while the modal is open the user would be staring at a stale
  // snapshot, so close it.
  useEffect(() => {
    if (!editRowPrompt) return;
    const exists = activeRows.some((r) => r.id === editRowPrompt.row.id);
    if (!exists) setEditRowPrompt(null);
  }, [editRowPrompt, activeRows]);
  // Same guard for the split modal. History rows aren't in
  // `activeRows` (they're synthesized from `UserData.history`), so
  // their existence is verified against the active account's history
  // entries instead.
  useEffect(() => {
    if (!splitPrompt) return;
    if (splitPrompt.row.historyEntryId) {
      const entries = (activeAccountId && history[activeAccountId]) || [];
      const exists = entries.some(
        (e) => e.id === splitPrompt.row.historyEntryId,
      );
      if (!exists) setSplitPrompt(null);
      return;
    }
    const exists = activeRows.some((r) => r.id === splitPrompt.row.id);
    if (!exists) setSplitPrompt(null);
  }, [splitPrompt, activeRows, activeAccountId, history]);

  return {
    editPrompt,
    setEditPrompt,
    editRowPrompt,
    setEditRowPrompt,
    splitPrompt,
    setSplitPrompt,
    pendingSeriesEdit,
    setPendingSeriesEdit,
  };
}
