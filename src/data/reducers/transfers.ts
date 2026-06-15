import { newId } from "../sheet";
import { recordMerchantHints } from "../merchant-hints";
import type { Action } from "../reducer";
import type { HistoryEntry, Transfer, UserData } from "../types";

export function reduceTransfers(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "createTransfer") {
    const next = {
      ...state,
      transfers: [...state.transfers, action.transfer],
    };
    return recordMerchantHints(
      next,
      [
        {
          description: action.transfer.description,
          typeId: action.transfer.typeId ?? null,
        },
      ],
      Date.now(),
    );
  }
  if (action.type === "createCoverTransfer") {
    // A cover transfer's description is the user's motivation, not a merchant
    // name, so we deliberately skip `recordMerchantHints` here — folding it
    // into the type/merchant memory would pollute future suggestions.
    return {
      ...state,
      transfers: [...state.transfers, action.transfer],
    };
  }
  if (action.type === "updateTransfer") {
    const prev = state.transfers.find((t) => t.id === action.transferId);
    const next = {
      ...state,
      transfers: state.transfers.map((tx) =>
        tx.id === action.transferId ? { ...tx, ...action.patch } : tx,
      ),
    };
    // Only fire a hint recording when the type was actually touched
    // by this update; otherwise unrelated edits (date, amount, …)
    // would re-stamp `lastUsedAt` on an unrelated hint.
    if (prev && action.patch.typeId !== undefined) {
      const description =
        action.patch.description !== undefined
          ? action.patch.description
          : prev.description;
      return recordMerchantHints(
        next,
        [{ description, typeId: action.patch.typeId ?? null }],
        Date.now(),
      );
    }
    return next;
  }
  if (action.type === "deleteTransfer") {
    // Also clear the `collapsedIntoTransferId` backref on any
    // history entry that pointed at this transfer, and un-hide
    // those entries — collapse is reversible only if the entries
    // come back when the transfer goes away. We don't try to
    // distinguish "this transfer was a collapse" from "this was
    // a user-created transfer" because the backref disambiguates: an
    // entry only un-hides if it's pointing at the deleted tx.
    const txId = action.transferId;
    let touchedHistory = false;
    const history: Record<string, HistoryEntry[]> = {};
    for (const [accountId, entries] of Object.entries(state.history)) {
      let touched = false;
      const next = entries.map((e) => {
        if (e.collapsedIntoTransferId !== txId) return e;
        touched = true;
        const restored: HistoryEntry = { ...e };
        delete restored.collapsedIntoTransferId;
        delete restored.hidden;
        return restored;
      });
      history[accountId] = touched ? next : entries;
      if (touched) touchedHistory = true;
    }
    return {
      ...state,
      transfers: state.transfers.filter((tx) => tx.id !== action.transferId),
      history: touchedHistory ? history : state.history,
    };
  }
  if (action.type === "collapseTransferPair") {
    // Mint a new Transfer and stamp the two source entries as
    // collapsed + hidden. Idempotent: a re-run that finds the same
    // pair already carrying a backref skips the action entirely.
    const fromEntries = state.history[action.fromAccountId] ?? [];
    const toEntries = state.history[action.toAccountId] ?? [];
    const fromEntry = fromEntries.find((e) => e.id === action.fromEntryId);
    const toEntry = toEntries.find((e) => e.id === action.toEntryId);
    if (!fromEntry || !toEntry) return state;
    if (fromEntry.collapsedIntoTransferId) return state;
    if (toEntry.collapsedIntoTransferId) return state;
    const transfer: Transfer = {
      id: newId(),
      date: action.date,
      description: action.description,
      amount: action.amount,
      fromAccountId: action.fromAccountId,
      toAccountId: action.toAccountId,
    };
    return {
      ...state,
      transfers: [...state.transfers, transfer],
      history: {
        ...state.history,
        [action.fromAccountId]: fromEntries.map((e) =>
          e.id === action.fromEntryId
            ? {
                ...e,
                hidden: true,
                collapsedIntoTransferId: transfer.id,
              }
            : e,
        ),
        [action.toAccountId]: toEntries.map((e) =>
          e.id === action.toEntryId
            ? {
                ...e,
                hidden: true,
                collapsedIntoTransferId: transfer.id,
              }
            : e,
        ),
      },
    };
  }
  if (action.type === "dismissTransferPair") {
    if (state.transferCollapseDismissals.includes(action.pairKey)) return state;
    return {
      ...state,
      transferCollapseDismissals: [
        ...state.transferCollapseDismissals,
        action.pairKey,
      ],
    };
  }
  if (action.type === "clearTransferDismissals") {
    if (state.transferCollapseDismissals.length === 0) return state;
    return { ...state, transferCollapseDismissals: [] };
  }
  return null;
}
