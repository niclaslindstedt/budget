import type {
  ManualTriageState,
  ReconciliationState,
  RenamePredictorState,
} from "../types";

// Whole bank-history import / triage modal surface in one slice so the
// pipeline handoffs (import modal → reconciliation / rename, then
// reconciliation → rename) are single atomic transitions instead of a
// close-this-then-open-that setState pair. The six fields back six
// orthogonal modal flows, but a `kind`-discriminated union documents
// "one import modal open at a time" and the dispatcher can express the
// staged-import handoff without the UI ever rendering an intermediate
// two-modals (or no-modal) frame. Same precedent as the modal reducers
// under `components/`: pure reducer, no side effects; the hook owns the
// `dispatch` to the data reducer and the achievement unlocks.
export type ImportFlowState = {
  // Per-account modal toggles — null = closed, otherwise the account id.
  importHistoryForId: string | null;
  viewHistoryForId: string | null;
  cutHistoryForId: string | null;
  // Pipeline modal states — null = closed, otherwise the staged payload.
  reconciliation: ReconciliationState | null;
  manualTriage: ManualTriageState | null;
  renamePredictor: RenamePredictorState | null;
};

export const initialImportFlowState: ImportFlowState = {
  importHistoryForId: null,
  viewHistoryForId: null,
  cutHistoryForId: null,
  reconciliation: null,
  manualTriage: null,
  renamePredictor: null,
};

export type ImportFlowAction =
  | { kind: "setImportHistoryForId"; id: string | null }
  | { kind: "setViewHistoryForId"; id: string | null }
  | { kind: "setCutHistoryForId"; id: string | null }
  | { kind: "setManualTriage"; value: ManualTriageState | null }
  | { kind: "setReconciliation"; value: ReconciliationState | null }
  | { kind: "setRenamePredictor"; value: RenamePredictorState | null }
  // Close the import-history modal and open whatever the matcher
  // pipeline decided in one transition. Commit path leaves both targets
  // null (the modal just closes, the data reducer commits separately);
  // the reconciliation / rename paths carry their staged payload.
  | {
      kind: "stageImport";
      reconciliation: ReconciliationState | null;
      renamePredictor: RenamePredictorState | null;
    }
  // Close the reconciliation modal and open the rename predictor in one
  // transition (the reconciliation-then-rename branch of Apply).
  | { kind: "reconciliationToRename"; renamePredictor: RenamePredictorState };

export function importFlowReducer(
  state: ImportFlowState,
  action: ImportFlowAction,
): ImportFlowState {
  switch (action.kind) {
    case "setImportHistoryForId":
      return { ...state, importHistoryForId: action.id };
    case "setViewHistoryForId":
      return { ...state, viewHistoryForId: action.id };
    case "setCutHistoryForId":
      return { ...state, cutHistoryForId: action.id };
    case "setManualTriage":
      return { ...state, manualTriage: action.value };
    case "setReconciliation":
      return { ...state, reconciliation: action.value };
    case "setRenamePredictor":
      return { ...state, renamePredictor: action.value };
    case "stageImport":
      return {
        ...state,
        importHistoryForId: null,
        reconciliation: action.reconciliation,
        renamePredictor: action.renamePredictor,
      };
    case "reconciliationToRename":
      return {
        ...state,
        reconciliation: null,
        renamePredictor: action.renamePredictor,
      };
  }
}
