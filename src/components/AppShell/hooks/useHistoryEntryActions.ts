import { useCallback } from "react";

import type { Action } from "../../../data/reducer";

type Params = {
  // The active page item's account id. When null (no account attached,
  // e.g. an accounts-sheet placeholder) both callbacks no-op so the UI
  // can stay wired without branching at every call site.
  activeAccountId: string | null | undefined;
  // The currently-open history edit prompt — `{ entryId }` when open,
  // null when closed. `onSubmitHistoryEdit` needs the entry id to
  // dispatch the patch and then clears the prompt itself.
  historyEditPrompt: { entryId: string } | null;
  dispatch: React.Dispatch<Action>;
  setHistoryEditPrompt: (next: { entryId: string } | null) => void;
};

type Result = {
  onSubmitHistoryEdit: (patch: {
    userDescription: string;
    userTypeId: string | null;
    userCompanyId: string | null;
    noCompany: boolean;
  }) => void;
  onSetHistoryEntryPrimaryIncome: (
    entryId: string,
    isPrimaryIncome: boolean,
    anchorDayOfMonth: number | null,
  ) => void;
};

export function useHistoryEntryActions({
  activeAccountId,
  historyEditPrompt,
  dispatch,
  setHistoryEditPrompt,
}: Params): Result {
  const onSubmitHistoryEdit = useCallback(
    (patch: {
      userDescription: string;
      userTypeId: string | null;
      userCompanyId: string | null;
      noCompany: boolean;
    }) => {
      if (!activeAccountId || !historyEditPrompt) return;
      dispatch({
        type: "updateHistoryEntry",
        accountId: activeAccountId,
        entryId: historyEditPrompt.entryId,
        patch,
      });
      setHistoryEditPrompt(null);
    },
    [dispatch, activeAccountId, historyEditPrompt, setHistoryEditPrompt],
  );

  const onSetHistoryEntryPrimaryIncome = useCallback(
    (
      entryId: string,
      isPrimaryIncome: boolean,
      anchorDayOfMonth: number | null,
    ) => {
      if (!activeAccountId) return;
      dispatch({
        type: "setHistoryEntryPrimaryIncome",
        accountId: activeAccountId,
        entryId,
        isPrimaryIncome,
        anchorDayOfMonth,
      });
    },
    [dispatch, activeAccountId],
  );

  return { onSubmitHistoryEdit, onSetHistoryEntryPrimaryIncome };
}
