import { mergeImportedPoints } from "../import/value-import";
import { newId } from "../sheet";
import { applyPatch } from "./patch";
import type { Action } from "../reducer";
import type { Saving, UserData } from "../types";

// Rewrite one savings account by id, leaving the rest of the array untouched.
function updateSavingById(
  state: UserData,
  savingId: string,
  fn: (saving: Saving) => Saving,
): UserData {
  return {
    ...state,
    savings: state.savings.map((s) => (s.id === savingId ? fn(s) : s)),
  };
}

// CRUD for the savings catalog (`UserData.savings`) and the dated balance
// points nested under each savings account. Entirely user-curated — no
// presets — so there's no preset-immutability guard here.
//
// `deleteSaving` cascades like `deleteAccount`: a savings account's
// transactions live in `history` keyed by its id and it can be a transfer
// endpoint, so dropping it must also drop that history / import audit and any
// transfers touching it — otherwise the validator's transfer-endpoint and
// history-key invariants break on the next load.
export function reduceSavings(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "createSaving") {
    return { ...state, savings: [...state.savings, action.saving] };
  }
  if (action.type === "updateSaving") {
    return updateSavingById(state, action.savingId, (s) =>
      applyPatch(s, action.patch),
    );
  }
  if (action.type === "deleteSaving") {
    const nextHistory = { ...state.history };
    delete nextHistory[action.savingId];
    const nextHistoryImports = { ...state.historyImports };
    delete nextHistoryImports[action.savingId];
    return {
      ...state,
      savings: state.savings.filter((s) => s.id !== action.savingId),
      transfers: state.transfers.filter(
        (tx) =>
          tx.fromAccountId !== action.savingId &&
          tx.toAccountId !== action.savingId,
      ),
      history: nextHistory,
      historyImports: nextHistoryImports,
    };
  }
  if (action.type === "addSavingBalance") {
    return updateSavingById(state, action.savingId, (s) => ({
      ...s,
      balanceHistory: [...s.balanceHistory, action.point],
    }));
  }
  if (action.type === "importSavingBalances") {
    return updateSavingById(state, action.savingId, (s) => ({
      ...s,
      balanceHistory: mergeImportedPoints(
        s.balanceHistory,
        action.points,
        newId,
        (p) => ({ id: p.id, date: p.date, value: p.value }),
      ),
    }));
  }
  if (action.type === "updateSavingBalance") {
    return updateSavingById(state, action.savingId, (s) => ({
      ...s,
      balanceHistory: s.balanceHistory.map((pt) =>
        pt.id === action.pointId ? applyPatch(pt, action.patch) : pt,
      ),
    }));
  }
  if (action.type === "deleteSavingBalance") {
    return updateSavingById(state, action.savingId, (s) => ({
      ...s,
      balanceHistory: s.balanceHistory.filter((pt) => pt.id !== action.pointId),
    }));
  }
  return null;
}
