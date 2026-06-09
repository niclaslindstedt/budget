import { useCallback, useMemo, useState } from "react";

import type { ConfirmAction } from "../../ConfirmDialog";
import type { Action } from "../../../data/reducer";
import { newId } from "../../../data/sheet";
import type { Saving, SavingBalancePoint, UserData } from "../../../data/types";
import { useT } from "../../../i18n";
import { todayIso } from "../../../utils/date";
import { parseAmount } from "../../../utils/format";
import type { useToast } from "../../../hooks";
import type { SavingDraft } from "../../savings/SavingsModal";

type Params = {
  data: UserData;
  dispatch: (action: Action) => void;
  toast: ReturnType<typeof useToast>;
};

type SavingModalState = { saving: Saving | null };
type DeleteSavingPrompt = { savingId: string; name: string };

type Result = {
  // SavingsModal — null = closed; { saving: null } = create; otherwise edit.
  savingModal: SavingModalState | null;
  setSavingModal: (next: SavingModalState | null) => void;
  // Delete confirmation, shared by the row trash button and the edit modal's
  // Delete button (deleting a savings account drops its balance history,
  // transactions, and transfers — worth a confirm).
  deleteSavingPrompt: DeleteSavingPrompt | null;
  setDeleteSavingPrompt: (next: DeleteSavingPrompt | null) => void;
  deleteSavingActions: ConfirmAction[];

  onOpenCreateSaving: () => void;
  onOpenEditSaving: (savingId: string) => void;
  onSaveSaving: (draft: SavingDraft) => void;
  onDeleteSavingFromModal: () => void;
  onRequestDeleteSaving: (savingId: string, name: string) => void;

  // Dated-balance update modal.
  updateBalanceForId: string | null;
  setUpdateBalanceForId: (next: string | null) => void;
  updateBalanceSaving: Saving | null;
  onOpenUpdateBalance: (savingId: string) => void;
  onAddSavingBalance: (savingId: string, point: SavingBalancePoint) => void;
  onDeleteSavingBalance: (savingId: string, pointId: string) => void;
};

// Workspace-level savings-account CRUD + dated-balance updates. Mirrors
// `useAccountDialog`, but the balance flow appends a dated `SavingBalancePoint`
// (like the property value modal) rather than minting a budget correction row.
export function useSavingDialog({ data, dispatch, toast }: Params): Result {
  const t = useT();
  const [savingModal, setSavingModal] = useState<SavingModalState | null>(null);
  const [deleteSavingPrompt, setDeleteSavingPrompt] =
    useState<DeleteSavingPrompt | null>(null);
  const [updateBalanceForId, setUpdateBalanceForId] = useState<string | null>(
    null,
  );

  const onOpenCreateSaving = useCallback(() => {
    setSavingModal({ saving: null });
  }, []);
  const onOpenEditSaving = useCallback(
    (savingId: string) => {
      const target = data.savings.find((s) => s.id === savingId);
      if (target) setSavingModal({ saving: target });
    },
    [data.savings],
  );

  const onSaveSaving = useCallback(
    (draft: SavingDraft) => {
      const patch: Partial<Saving> = {
        name: draft.name,
        description: draft.description || undefined,
        glyph: draft.glyph ?? undefined,
        color: draft.color ?? undefined,
        bank: draft.bank || undefined,
        clearing: draft.clearing || undefined,
        accountNumber: draft.accountNumber || undefined,
      };
      if (savingModal?.saving) {
        // Edit: patch metadata only — balance changes go through the Update
        // balance flow, so `balanceHistory` is left untouched.
        dispatch({
          type: "updateSaving",
          savingId: savingModal.saving.id,
          patch,
        });
      } else {
        // Create: seed the opening balance as the first dated point.
        const opening =
          draft.currentBalance === ""
            ? null
            : parseAmount(draft.currentBalance);
        const balanceHistory: SavingBalancePoint[] =
          opening === null
            ? []
            : [{ id: newId(), date: todayIso(), value: opening }];
        const saving: Saving = {
          id: newId(),
          kind: "savings",
          name: draft.name,
          balanceHistory,
          ...(draft.description && { description: draft.description }),
          ...(draft.glyph && { glyph: draft.glyph }),
          ...(draft.color && { color: draft.color }),
          ...(draft.bank && { bank: draft.bank }),
          ...(draft.clearing && { clearing: draft.clearing }),
          ...(draft.accountNumber && { accountNumber: draft.accountNumber }),
        };
        dispatch({ type: "createSaving", saving });
      }
      setSavingModal(null);
    },
    [dispatch, savingModal],
  );

  const onDeleteSavingFromModal = useCallback(() => {
    if (!savingModal?.saving) return;
    setDeleteSavingPrompt({
      savingId: savingModal.saving.id,
      name: savingModal.saving.name,
    });
  }, [savingModal]);

  const onRequestDeleteSaving = useCallback(
    (savingId: string, name: string) => {
      setDeleteSavingPrompt({ savingId, name });
    },
    [],
  );

  const deleteSavingActions: ConfirmAction[] = useMemo(() => {
    if (!deleteSavingPrompt) return [];
    const target = deleteSavingPrompt;
    return [
      {
        label: t("common.delete"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteSaving", savingId: target.savingId });
          setDeleteSavingPrompt(null);
          setSavingModal(null);
          toast.push({
            kind: "success",
            message: t("savingsSheet.deleteAria", { name: target.name }),
          });
        },
      },
    ];
  }, [deleteSavingPrompt, dispatch, t, toast]);

  const onOpenUpdateBalance = useCallback((savingId: string) => {
    setUpdateBalanceForId(savingId);
  }, []);
  const updateBalanceSaving = useMemo(
    () =>
      updateBalanceForId
        ? (data.savings.find((s) => s.id === updateBalanceForId) ?? null)
        : null,
    [updateBalanceForId, data.savings],
  );
  const onAddSavingBalance = useCallback(
    (savingId: string, point: SavingBalancePoint) => {
      dispatch({ type: "addSavingBalance", savingId, point });
    },
    [dispatch],
  );
  const onDeleteSavingBalance = useCallback(
    (savingId: string, pointId: string) => {
      dispatch({ type: "deleteSavingBalance", savingId, pointId });
    },
    [dispatch],
  );

  return {
    savingModal,
    setSavingModal,
    deleteSavingPrompt,
    setDeleteSavingPrompt,
    deleteSavingActions,
    onOpenCreateSaving,
    onOpenEditSaving,
    onSaveSaving,
    onDeleteSavingFromModal,
    onRequestDeleteSaving,
    updateBalanceForId,
    setUpdateBalanceForId,
    updateBalanceSaving,
    onOpenUpdateBalance,
    onAddSavingBalance,
    onDeleteSavingBalance,
  };
}
