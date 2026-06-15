import { useEffect, useState } from "react";

import type { HistoryEntry, Row } from "../../../data/types";
import type {
  EditPrompt,
  EditRowPrompt,
  InfoPrompt,
  LineItemsPrompt,
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
  // Line-items modal — opens from the entry "…" menu to tie part of the
  // entry's amount to owned items.
  lineItemsPrompt: LineItemsPrompt | null;
  setLineItemsPrompt: (next: LineItemsPrompt | null) => void;
  // Captures the most recent inline edit on a recurring row so the
  // user can fan the change out to every following entry in the
  // series.
  pendingSeriesEdit: PendingSeriesEdit | null;
  setPendingSeriesEdit: (next: PendingSeriesEdit | null) => void;
  // Read-only entry-info modal — opens from the info action button / menu.
  infoPrompt: InfoPrompt | null;
  setInfoPrompt: (next: InfoPrompt | null) => void;
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
  const [lineItemsPrompt, setLineItemsPrompt] =
    useState<LineItemsPrompt | null>(null);
  const [pendingSeriesEdit, setPendingSeriesEdit] =
    useState<PendingSeriesEdit | null>(null);
  const [infoPrompt, setInfoPrompt] = useState<InfoPrompt | null>(null);

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
    const promptRow = splitPrompt.row;
    if (promptRow.kind === "historic") {
      const entries = (activeAccountId && history[activeAccountId]) || [];
      const exists = entries.some((e) => e.id === promptRow.historyEntryId);
      if (!exists) setSplitPrompt(null);
      return;
    }
    const exists = activeRows.some((r) => r.id === promptRow.id);
    if (!exists) setSplitPrompt(null);
  }, [splitPrompt, activeRows, activeAccountId, history]);
  // Same guard for the line-items modal — identical history-vs-user-row
  // existence check as the split modal.
  useEffect(() => {
    if (!lineItemsPrompt) return;
    const promptRow = lineItemsPrompt.row;
    if (promptRow.kind === "historic") {
      const entries = (activeAccountId && history[activeAccountId]) || [];
      const exists = entries.some((e) => e.id === promptRow.historyEntryId);
      if (!exists) setLineItemsPrompt(null);
      return;
    }
    const exists = activeRows.some((r) => r.id === promptRow.id);
    if (!exists) setLineItemsPrompt(null);
  }, [lineItemsPrompt, activeRows, activeAccountId, history]);

  // Same guard for the read-only info modal — identical history-vs-user-row
  // existence check as the split / line-items modals.
  useEffect(() => {
    if (!infoPrompt) return;
    const promptRow = infoPrompt.row;
    if (promptRow.kind === "historic") {
      const entries = (activeAccountId && history[activeAccountId]) || [];
      const exists = entries.some((e) => e.id === promptRow.historyEntryId);
      if (!exists) setInfoPrompt(null);
      return;
    }
    const exists = activeRows.some((r) => r.id === promptRow.id);
    if (!exists) setInfoPrompt(null);
  }, [infoPrompt, activeRows, activeAccountId, history]);

  return {
    editPrompt,
    setEditPrompt,
    editRowPrompt,
    setEditRowPrompt,
    splitPrompt,
    setSplitPrompt,
    lineItemsPrompt,
    setLineItemsPrompt,
    pendingSeriesEdit,
    setPendingSeriesEdit,
    infoPrompt,
    setInfoPrompt,
  };
}
