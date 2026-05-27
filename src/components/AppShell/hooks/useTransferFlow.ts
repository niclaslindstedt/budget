import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  TransferDraft,
  TransferModalRequest,
} from "../../accounts/TransferModal";
import type { ConfirmAction } from "../../ConfirmDialog";
import type { Action } from "../../../data/reducer";
import { newId } from "../../../data/sheet";
import {
  detectTransferCandidates,
  hasCollapsedHistory,
  type TransferCandidate,
} from "../../../data/transfer-collapse";
import type {
  AccountBudget,
  Row,
  Transfer,
  UserData,
} from "../../../data/types";
import { useT } from "../../../i18n";

type Params = {
  data: UserData;
  activeBudget: AccountBudget | null;
  dispatch: (action: Action) => void;
};

type Result = {
  // Transfer modal — null = closed; otherwise the request describes
  // the mode (promote / create / edit). The TransferModal seeds
  // itself from the request.
  transferRequest: TransferModalRequest | null;
  setTransferRequest: (next: TransferModalRequest | null) => void;
  onTransferRequest: (row: Row) => void;
  onOpenCreateTransfer: () => void;
  onOpenEditTransfer: (transferId: string) => void;
  onCreateTransfer: (draft: TransferDraft) => void;
  onEditTransferSave: (transferId: string, draft: TransferDraft) => void;
  onDeleteTransferFromModal: (transferId: string) => void;

  // Imported-pair demote confirm. null = closed; otherwise the id of
  // the merged transfer the user is demoting back to two stand-alone
  // history entries.
  uncollapsePrompt: string | null;
  setUncollapsePrompt: (next: string | null) => void;
  uncollapseActions: ConfirmAction[];
  onUncollapseTransfer: (transferId: string) => void;

  // TransferCollapseModal. Open is driven by the user (a button on
  // the Accounts page) and auto-opens after an import when new
  // candidates are detected.
  transferModalOpen: boolean;
  setTransferModalOpen: (open: boolean) => void;
  onCollapseTransferPair: (candidate: TransferCandidate) => void;
  onDismissTransferPair: (pairKey: string) => void;
};

// Everything cross-account: the create / edit / delete modal for
// manual transfers, the imported-pair "is this really a transfer?"
// collapse modal that auto-opens after fresh imports, and the
// uncollapse-back-to-two-entries confirmation.
export function useTransferFlow({
  data,
  activeBudget,
  dispatch,
}: Params): Result {
  const t = useT();
  const [transferRequest, setTransferRequest] =
    useState<TransferModalRequest | null>(null);
  const [uncollapsePrompt, setUncollapsePrompt] = useState<string | null>(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  // Open the transfer modal in edit mode for a synthesized
  // transfer row (the inline ↔ button on rows with a transferId).
  const onTransferRequest = useCallback(
    (row: Row) => {
      if (!activeBudget || activeBudget.accountId === null) return;
      if (!row.transferId) return;
      const tx = data.transfers.find((t) => t.id === row.transferId);
      if (!tx) return;
      setTransferRequest({
        kind: "edit",
        transferId: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
        typeId: tx.typeId ?? null,
        completed: tx.completed ?? false,
        isImportedPair: hasCollapsedHistory(data.history, tx.id),
      });
    },
    [activeBudget, data.transfers, data.history],
  );
  const onOpenCreateTransfer = useCallback(() => {
    const today = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    setTransferRequest({
      kind: "create",
      defaultFromId: data.accounts[0]?.id ?? null,
      defaultToId: data.accounts[1]?.id ?? null,
      seedDate: today,
    });
  }, [data.accounts]);
  const onOpenEditTransfer = useCallback(
    (transferId: string) => {
      const tx = data.transfers.find((t) => t.id === transferId);
      if (!tx) return;
      setTransferRequest({
        kind: "edit",
        transferId: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
        typeId: tx.typeId ?? null,
        completed: tx.completed ?? false,
        isImportedPair: hasCollapsedHistory(data.history, tx.id),
      });
    },
    [data.transfers, data.history],
  );
  const onCreateTransfer = useCallback(
    (draft: TransferDraft) => {
      const transfer: Transfer = {
        id: newId(),
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        fromAccountId: draft.fromAccountId,
        toAccountId: draft.toAccountId,
        ...(draft.typeId !== null && { typeId: draft.typeId }),
        ...(draft.completed && { completed: draft.completed }),
      };
      dispatch({ type: "createTransfer", transfer });
      setTransferRequest(null);
    },
    [dispatch],
  );
  const onEditTransferSave = useCallback(
    (transferId: string, draft: TransferDraft) => {
      dispatch({
        type: "updateTransfer",
        transferId,
        patch: {
          date: draft.date,
          description: draft.description,
          amount: draft.amount,
          fromAccountId: draft.fromAccountId,
          toAccountId: draft.toAccountId,
          typeId: draft.typeId,
          completed: draft.completed,
        },
      });
      setTransferRequest(null);
    },
    [dispatch],
  );
  const onDeleteTransferFromModal = useCallback(
    (transferId: string) => {
      dispatch({ type: "deleteTransfer", transferId });
      setTransferRequest(null);
    },
    [dispatch],
  );
  // Imported-pair demote: the user cleared the "is a transfer" toggle
  // in the edit modal. The modal has already closed itself — we open
  // a ConfirmDialog and dispatch `deleteTransfer` on accept (which
  // restores the two underlying history entries via the reducer).
  const onUncollapseTransfer = useCallback((transferId: string) => {
    setUncollapsePrompt(transferId);
  }, []);

  const uncollapseActions: ConfirmAction[] = useMemo(() => {
    if (uncollapsePrompt === null) return [];
    const txId = uncollapsePrompt;
    return [
      {
        label: t("transfer.uncollapseConfirm"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteTransfer", transferId: txId });
          setUncollapsePrompt(null);
        },
      },
    ];
  }, [uncollapsePrompt, dispatch, t]);

  // Snapshot of the candidate count at the previous import so the
  // auto-open trigger only fires when a fresh import actually
  // introduced new pairs (not every render, not after a dismissal).
  const previousImportCountRef = useRef<number>(
    Object.values(data.historyImports).reduce(
      (acc, list) => acc + list.length,
      0,
    ),
  );
  useEffect(() => {
    const totalImports = Object.values(data.historyImports).reduce(
      (acc, list) => acc + list.length,
      0,
    );
    if (totalImports <= previousImportCountRef.current) {
      previousImportCountRef.current = totalImports;
      return;
    }
    previousImportCountRef.current = totalImports;
    const dismissed = new Set(data.transferCollapseDismissals);
    const candidates = detectTransferCandidates({
      history: data.history,
      dismissedPairKeys: dismissed,
    });
    if (candidates.length > 0) setTransferModalOpen(true);
  }, [data.historyImports, data.history, data.transferCollapseDismissals]);

  const onCollapseTransferPair = useCallback(
    (candidate: TransferCandidate) => {
      dispatch({
        type: "collapseTransferPair",
        fromAccountId: candidate.fromAccountId,
        toAccountId: candidate.toAccountId,
        fromEntryId: candidate.fromEntry.id,
        toEntryId: candidate.toEntry.id,
        date: candidate.date,
        description: candidate.fromEntry.description,
        amount: candidate.amount,
      });
    },
    [dispatch],
  );
  const onDismissTransferPair = useCallback(
    (pairKey: string) => {
      dispatch({ type: "dismissTransferPair", pairKey });
    },
    [dispatch],
  );

  return {
    transferRequest,
    setTransferRequest,
    onTransferRequest,
    onOpenCreateTransfer,
    onOpenEditTransfer,
    onCreateTransfer,
    onEditTransferSave,
    onDeleteTransferFromModal,
    uncollapsePrompt,
    setUncollapsePrompt,
    uncollapseActions,
    onUncollapseTransfer,
    transferModalOpen,
    setTransferModalOpen,
    onCollapseTransferPair,
    onDismissTransferPair,
  };
}
