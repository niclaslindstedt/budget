import { useCallback, useMemo, useState } from "react";

import type { AccountDraft } from "../../accounts/AccountModal";
import type { ConfirmAction } from "../../ConfirmDialog";
import { accountBalance } from "../../../data/accounts/balance";
import type { Action } from "../../../data/reducer";
import { newId } from "../../../data/sheet";
import type { Account, UserData } from "../../../data/types";
import { useT } from "../../../i18n";
import type { useToast } from "../../../hooks";

type Params = {
  data: UserData;
  dispatch: (action: Action) => void;
  toast: ReturnType<typeof useToast>;
};

type AccountModalState = { account: Account | null };
type DeleteAccountPrompt = { accountId: string; name: string };

type Result = {
  // AccountModal — null = closed; { account: null } = create-account
  // modal; otherwise edit.
  accountModal: AccountModalState | null;
  setAccountModal: (next: AccountModalState | null) => void;
  // ConfirmDialog rendered on top of AccountModal so an accidental tap
  // on the trash button doesn't wipe the account, its transfers, and
  // its history entries in one shot.
  deleteAccountPrompt: DeleteAccountPrompt | null;
  setDeleteAccountPrompt: (next: DeleteAccountPrompt | null) => void;
  deleteAccountActions: ConfirmAction[];

  onOpenCreateAccount: () => void;
  onOpenEditAccount: (accountId: string) => void;
  onSaveAccount: (draft: AccountDraft) => void;
  onDeleteFinancialAccount: () => void;
  onRequestDeleteAccount: (accountId: string, name: string) => void;

  // Balance-correction modal. Click on an account's balance opens
  // UpdateBalanceModal; confirming dispatches a correction row.
  updateBalanceForId: string | null;
  setUpdateBalanceForId: (next: string | null) => void;
  updateBalanceAccount: Account | null;
  updateBalanceCurrent: number;
  updateBalanceHasBudget: boolean;
  updateBalanceDate: string;
  onOpenUpdateBalance: (accountId: string) => void;
  onConfirmUpdateBalance: (newBalance: number) => void;
};

// Workspace-level Account CRUD + balance-correction. The matching
// per-history flows (import / view / cut) live separately in the
// import flow hook because they share the reconciliation pipeline.
export function useAccountDialog({ data, dispatch, toast }: Params): Result {
  const t = useT();
  const [accountModal, setAccountModal] = useState<AccountModalState | null>(
    null,
  );
  const [deleteAccountPrompt, setDeleteAccountPrompt] =
    useState<DeleteAccountPrompt | null>(null);
  const [updateBalanceForId, setUpdateBalanceForId] = useState<string | null>(
    null,
  );

  const onOpenCreateAccount = useCallback(() => {
    setAccountModal({ account: null });
  }, []);
  const onOpenEditAccount = useCallback(
    (accountId: string) => {
      const target = data.accounts.find((a) => a.id === accountId);
      if (target) setAccountModal({ account: target });
    },
    [data.accounts],
  );

  const onSaveAccount = useCallback(
    (draft: AccountDraft) => {
      // Strip empty strings from optional fields so a cleared input
      // restores "unset" rather than persisting an empty value the
      // schema would carry through every export.
      const patch: Partial<Account> = {
        name: draft.name,
        description: draft.description || undefined,
        glyph: draft.glyph ?? undefined,
        color: draft.color ?? undefined,
        bank: draft.bank || undefined,
        clearing: draft.clearing || undefined,
        accountNumber: draft.accountNumber || undefined,
        iban: draft.iban || undefined,
        bic: draft.bic || undefined,
        currency: draft.currency || undefined,
      };
      if (accountModal?.account) {
        dispatch({
          type: "updateAccount",
          accountId: accountModal.account.id,
          patch,
        });
      } else {
        const account: Account = {
          id: newId(),
          name: draft.name,
          ...(draft.description && { description: draft.description }),
          ...(draft.glyph && { glyph: draft.glyph }),
          ...(draft.color && { color: draft.color }),
          ...(draft.bank && { bank: draft.bank }),
          ...(draft.clearing && { clearing: draft.clearing }),
          ...(draft.accountNumber && { accountNumber: draft.accountNumber }),
          ...(draft.iban && { iban: draft.iban }),
          ...(draft.bic && { bic: draft.bic }),
          ...(draft.currency && { currency: draft.currency }),
        };
        dispatch({ type: "createAccount", account });
      }
      setAccountModal(null);
    },
    [dispatch, accountModal],
  );

  const onDeleteFinancialAccount = useCallback(() => {
    if (!accountModal?.account) return;
    setDeleteAccountPrompt({
      accountId: accountModal.account.id,
      name: accountModal.account.name,
    });
  }, [accountModal]);

  // Same flow used by AccountsPage's trash button — feed the
  // prompt directly so the swipe-delete doesn't need to detour
  // through the edit modal first.
  const onRequestDeleteAccount = useCallback(
    (accountId: string, name: string) => {
      setDeleteAccountPrompt({ accountId, name });
    },
    [],
  );

  const deleteAccountActions: ConfirmAction[] = useMemo(() => {
    if (!deleteAccountPrompt) return [];
    const target = deleteAccountPrompt;
    return [
      {
        label: t("app.deleteAccount"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteAccount", accountId: target.accountId });
          setDeleteAccountPrompt(null);
          setAccountModal(null);
          toast.push({
            kind: "success",
            message: t("toast.accountDeleted", { name: target.name }),
          });
        },
      },
    ];
  }, [deleteAccountPrompt, dispatch, t, toast]);

  // Balance-correction flow. The Accounts page surfaces a clickable
  // balance per account; clicking opens UpdateBalanceModal, which lets
  // the user assert a new balance and confirms a correction row will
  // be added on today's date.
  const onOpenUpdateBalance = useCallback((accountId: string) => {
    setUpdateBalanceForId(accountId);
  }, []);
  const updateBalanceAccount = useMemo(
    () =>
      updateBalanceForId
        ? (data.accounts.find((a) => a.id === updateBalanceForId) ?? null)
        : null,
    [updateBalanceForId, data.accounts],
  );
  const updateBalanceCurrent = useMemo(
    () =>
      updateBalanceAccount ? accountBalance(data, updateBalanceAccount.id) : 0,
    [data, updateBalanceAccount],
  );
  const updateBalanceHasBudget = useMemo(() => {
    if (!updateBalanceAccount) return false;
    return data.sheets.some((s) =>
      s.items.some(
        (it) =>
          it.type === "accountBudget" &&
          it.accountId === updateBalanceAccount.id,
      ),
    );
  }, [updateBalanceAccount, data.sheets]);
  const updateBalanceDate = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const onConfirmUpdateBalance = useCallback(
    (newBalance: number) => {
      if (!updateBalanceAccount) return;
      const delta = newBalance - updateBalanceCurrent;
      if (delta === 0) {
        setUpdateBalanceForId(null);
        return;
      }
      dispatch({
        type: "correctAccountBalance",
        accountId: updateBalanceAccount.id,
        date: updateBalanceDate,
        amount: delta,
      });
      setUpdateBalanceForId(null);
    },
    [dispatch, updateBalanceAccount, updateBalanceCurrent, updateBalanceDate],
  );

  return {
    accountModal,
    setAccountModal,
    deleteAccountPrompt,
    setDeleteAccountPrompt,
    deleteAccountActions,
    onOpenCreateAccount,
    onOpenEditAccount,
    onSaveAccount,
    onDeleteFinancialAccount,
    onRequestDeleteAccount,
    updateBalanceForId,
    setUpdateBalanceForId,
    updateBalanceAccount,
    updateBalanceCurrent,
    updateBalanceHasBudget,
    updateBalanceDate,
    onOpenUpdateBalance,
    onConfirmUpdateBalance,
  };
}
