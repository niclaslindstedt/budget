import { useCallback, useMemo, useState } from "react";

import type { ConfirmAction } from "../../ConfirmDialog";
import type { SheetDraft } from "../../SheetModal";
import type { Action } from "../../../data/reducer";
import { createDefaultSheet, newId } from "../../../data/sheet";
import type {
  Account,
  AccountBudget,
  Sheet,
  SalaryView,
} from "../../../data/types";
import { useT } from "../../../i18n";
import type { useToast } from "../../../hooks";

type Params = {
  sheets: readonly Sheet[];
  dispatch: (action: Action) => void;
  toast: ReturnType<typeof useToast>;
};

type SheetModalState = { sheet: Sheet | null };
type DeleteSheetPrompt = { sheetId: string; name: string };

type Result = {
  // null = closed; { sheet: null } = new-sheet modal; { sheet: <Sheet> } = edit.
  sheetModal: SheetModalState | null;
  setSheetModal: (next: SheetModalState | null) => void;
  // null = closed; otherwise the sheet queued for deletion. Rendered
  // as a ConfirmDialog on top of the SheetModal so the user has a
  // chance to back out before the dispatch fires.
  deleteSheetPrompt: DeleteSheetPrompt | null;
  setDeleteSheetPrompt: (next: DeleteSheetPrompt | null) => void;
  deleteSheetActions: ConfirmAction[];

  onOpenNewSheet: () => void;
  onOpenEditSheet: (id: string) => void;
  onSaveSheet: (draft: SheetDraft) => void;
  onDeleteSheet: () => void;
};

// Sheet-meta CRUD: open / close the SheetModal in create or edit
// mode, save edits (including the inline "new account" minting), and
// route the trash button through a ConfirmDialog.
export function useSheetMetaDialog({
  sheets,
  dispatch,
  toast,
}: Params): Result {
  const t = useT();
  const [sheetModal, setSheetModal] = useState<SheetModalState | null>(null);
  const [deleteSheetPrompt, setDeleteSheetPrompt] =
    useState<DeleteSheetPrompt | null>(null);

  const onOpenNewSheet = useCallback(() => {
    setSheetModal({ sheet: null });
  }, []);
  const onOpenEditSheet = useCallback(
    (id: string) => {
      const target = sheets.find((s) => s.id === id);
      if (target) setSheetModal({ sheet: target });
    },
    [sheets],
  );

  const onSaveSheet = useCallback(
    (draft: SheetDraft) => {
      // Resolve the final accountId. When the user typed a name into
      // the inline "new account" form we mint the account here, then
      // bind the sheet's budget item to its fresh id in the same
      // dispatch batch so a refresh mid-save can't strand the budget
      // pointing at nothing.
      let finalAccountId = draft.accountId;
      if (draft.newAccountName) {
        const account: Account = { id: newId(), name: draft.newAccountName };
        dispatch({ type: "createAccount", account });
        finalAccountId = account.id;
      }

      if (sheetModal?.sheet) {
        const target = sheetModal.sheet;
        dispatch({
          type: "updateSheetMeta",
          sheetId: target.id,
          meta: draft,
        });
        // Update the account binding on the sheet's account-bound item
        // if it changed. Both the budget ledger (`accountBudget`) and
        // the salary sheet (`salaryView`) carry an `accountId`; finding
        // the first such item mirrors the picker in the view, which
        // exposes one binding per sheet.
        const accountItem = target.items.find(
          (it): it is AccountBudget | SalaryView =>
            it.type === "accountBudget" || it.type === "salaryView",
        );
        if (accountItem && accountItem.accountId !== finalAccountId) {
          dispatch({
            type: "setItemAccount",
            sheetId: target.id,
            itemId: accountItem.id,
            accountId: finalAccountId,
          });
        }
      } else {
        const sheet = createDefaultSheet(draft.name, finalAccountId, {
          type: draft.type,
          glyph: draft.glyph,
          color: draft.color,
          description: draft.description,
        });
        dispatch({ type: "addSheet", sheet });
      }
    },
    [dispatch, sheetModal],
  );

  const onDeleteSheet = useCallback(() => {
    if (!sheetModal?.sheet) return;
    setDeleteSheetPrompt({
      sheetId: sheetModal.sheet.id,
      name: sheetModal.sheet.name,
    });
  }, [sheetModal]);

  const deleteSheetActions: ConfirmAction[] = useMemo(() => {
    if (!deleteSheetPrompt) return [];
    const target = deleteSheetPrompt;
    return [
      {
        label: t("app.deleteSheet"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteSheet", sheetId: target.sheetId });
          setDeleteSheetPrompt(null);
          setSheetModal(null);
          toast.push({
            kind: "success",
            message: t("toast.sheetDeleted", { name: target.name }),
          });
        },
      },
    ];
  }, [deleteSheetPrompt, dispatch, t, toast]);

  return {
    sheetModal,
    setSheetModal,
    deleteSheetPrompt,
    setDeleteSheetPrompt,
    deleteSheetActions,
    onOpenNewSheet,
    onOpenEditSheet,
    onSaveSheet,
    onDeleteSheet,
  };
}
