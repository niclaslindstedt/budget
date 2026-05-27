import { useState } from "react";

import type { CorrectionDeletePrompt, DeletePrompt } from "../types";

type Result = {
  // Confirm-and-delete prompt for an inline row delete. Routes to
  // both the single-row and recurring-series dialogs depending on
  // whether the row carries a `seriesId`.
  deletePrompt: DeletePrompt | null;
  setDeletePrompt: (next: DeletePrompt | null) => void;
  // Balance-correction delete confirmation — appears when the user
  // tries to remove an entry that is anchoring a correction.
  correctionDeletePrompt: CorrectionDeletePrompt | null;
  setCorrectionDeletePrompt: (next: CorrectionDeletePrompt | null) => void;
  // Per-history-entry edit modal. `null` = closed; otherwise the
  // entry id the user clicked the pen button on.
  historyEditPrompt: { entryId: string } | null;
  setHistoryEditPrompt: (next: { entryId: string } | null) => void;
};

export function useDeletePrompts(): Result {
  const [deletePrompt, setDeletePrompt] = useState<DeletePrompt | null>(null);
  const [correctionDeletePrompt, setCorrectionDeletePrompt] =
    useState<CorrectionDeletePrompt | null>(null);
  const [historyEditPrompt, setHistoryEditPrompt] = useState<{
    entryId: string;
  } | null>(null);
  return {
    deletePrompt,
    setDeletePrompt,
    correctionDeletePrompt,
    setCorrectionDeletePrompt,
    historyEditPrompt,
    setHistoryEditPrompt,
  };
}
