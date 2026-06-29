import { describe, expect, it } from "vitest";

import {
  importFlowReducer,
  initialImportFlowState,
  type ImportFlowState,
} from "../src/components/AppShell/hooks/import-flow-reducer";
import type {
  ImportOverlapState,
  ManualTriageState,
  ReconciliationState,
  RenamePredictorState,
} from "../src/components/AppShell/types";

// The reducer forwards these staged payloads opaquely — it never reads
// their contents — so the tests use lightweight sentinels stamped with
// the field types rather than full UserData / PendingImport fixtures.
const reconciliation = {
  accountId: "acc-1",
} as unknown as ReconciliationState;
const renamePredictor = {
  accountId: "acc-1",
  suggestions: [],
  pendingReconciliation: null,
} as unknown as RenamePredictorState;
const manualTriage = {
  accountId: "acc-1",
} as unknown as ManualTriageState;
const overlapConfirm = {
  accountId: "acc-1",
  filename: "statement.xlsx",
  overlap: { start: "2026-01-01", end: "2026-03-01" },
} as unknown as ImportOverlapState;

function makeState(over: Partial<ImportFlowState> = {}): ImportFlowState {
  return { ...initialImportFlowState, ...over };
}

describe("initialImportFlowState", () => {
  it("starts with every modal closed", () => {
    expect(initialImportFlowState).toEqual({
      importHistoryForId: null,
      viewHistoryForId: null,
      cutHistoryForId: null,
      reconciliation: null,
      manualTriage: null,
      renamePredictor: null,
      overlapConfirm: null,
      duplicatesCheckAt: null,
    });
  });
});

describe("importFlowReducer — per-modal setters", () => {
  it("each setter only touches its own field", () => {
    const base = makeState();
    expect(
      importFlowReducer(base, {
        kind: "setImportHistoryForId",
        id: "acc-1",
      }),
    ).toEqual(makeState({ importHistoryForId: "acc-1" }));
    expect(
      importFlowReducer(base, { kind: "setViewHistoryForId", id: "acc-2" }),
    ).toEqual(makeState({ viewHistoryForId: "acc-2" }));
    expect(
      importFlowReducer(base, { kind: "setCutHistoryForId", id: "acc-3" }),
    ).toEqual(makeState({ cutHistoryForId: "acc-3" }));
    expect(
      importFlowReducer(base, { kind: "setManualTriage", value: manualTriage }),
    ).toEqual(makeState({ manualTriage }));
    expect(
      importFlowReducer(base, {
        kind: "setReconciliation",
        value: reconciliation,
      }),
    ).toEqual(makeState({ reconciliation }));
    expect(
      importFlowReducer(base, {
        kind: "setRenamePredictor",
        value: renamePredictor,
      }),
    ).toEqual(makeState({ renamePredictor }));
    expect(
      importFlowReducer(base, { kind: "setDuplicatesCheck", value: 4242 }),
    ).toEqual(makeState({ duplicatesCheckAt: 4242 }));
    expect(
      importFlowReducer(base, {
        kind: "setOverlapConfirm",
        value: overlapConfirm,
      }),
    ).toEqual(makeState({ overlapConfirm }));
  });

  it("setters close their own modal with null", () => {
    const open = makeState({ importHistoryForId: "acc-1" });
    expect(
      importFlowReducer(open, { kind: "setImportHistoryForId", id: null }),
    ).toEqual(makeState());
  });
});

describe("importFlowReducer — stageImport handoff", () => {
  it("commit path just closes the import modal", () => {
    const open = makeState({ importHistoryForId: "acc-1" });
    expect(
      importFlowReducer(open, {
        kind: "stageImport",
        reconciliation: null,
        renamePredictor: null,
      }),
    ).toEqual(makeState());
  });

  it("reconciliation path closes import and opens reconciliation atomically", () => {
    const open = makeState({ importHistoryForId: "acc-1" });
    expect(
      importFlowReducer(open, {
        kind: "stageImport",
        reconciliation,
        renamePredictor: null,
      }),
    ).toEqual(makeState({ reconciliation }));
  });

  it("rename path closes import and opens the rename predictor atomically", () => {
    const open = makeState({ importHistoryForId: "acc-1" });
    expect(
      importFlowReducer(open, {
        kind: "stageImport",
        reconciliation: null,
        renamePredictor,
      }),
    ).toEqual(makeState({ renamePredictor }));
  });
});

describe("importFlowReducer — reconciliationToRename handoff", () => {
  it("closes the reconciliation modal and opens the rename predictor in one step", () => {
    const open = makeState({ reconciliation });
    expect(
      importFlowReducer(open, {
        kind: "reconciliationToRename",
        renamePredictor,
      }),
    ).toEqual(makeState({ renamePredictor }));
  });

  it("leaves other modal flags untouched", () => {
    const open = makeState({
      reconciliation,
      viewHistoryForId: "acc-9",
    });
    expect(
      importFlowReducer(open, {
        kind: "reconciliationToRename",
        renamePredictor,
      }),
    ).toEqual(makeState({ renamePredictor, viewHistoryForId: "acc-9" }));
  });
});
