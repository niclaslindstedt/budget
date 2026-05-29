import { useCallback, useMemo, useState } from "react";

import type { ReconciliationApply } from "../../accounts/AccountReconciliationModal";
import type { RenameDecision } from "../../accounts/AccountRenamePredictorModal";
import type {
  ConflictHistoryStamp,
  ConflictUserRowPatch,
} from "../../budget/BudgetFindConflictsModal";
import { unlock as unlockAchievement } from "../../../data/achievements";
import { stageHistoryImport } from "../../../data/import-staging";
import { findOrphans } from "../../../data/reconciliation";
import type { Action } from "../../../data/reducer";
import { predictRenames } from "../../../data/rename-patterns";
import { findColumnByType } from "../../../data/sheet";
import type { Account, AccountBudget, UserData } from "../../../data/types";
import type { ParsedBankFile } from "../../../storage/banks";
import type {
  ManualTriageState,
  ReconciliationState,
  RenamePredictorState,
} from "../types";

type Params = {
  data: UserData;
  activeItem: AccountBudget;
  sheetId: string;
  itemId: string;
  dispatch: (action: Action) => void;
};

type Result = {
  // Import-history modal — null = closed.
  importHistoryAccount: Account | null;
  setImportHistoryForId: (next: string | null) => void;
  onOpenImportHistory: (accountId: string) => void;
  onConfirmImportHistory: (parsed: ParsedBankFile, filename: string) => void;

  // History viewer modal — null = closed.
  viewHistoryAccount: Account | null;
  setViewHistoryForId: (next: string | null) => void;
  onOpenViewHistory: (accountId: string) => void;

  // Cut-history modal — drops imported entries + cross-account
  // transfers dated before a user-chosen cutoff date.
  cutHistoryAccount: Account | null;
  setCutHistoryForId: (next: string | null) => void;
  onOpenCutHistory: (accountId: string) => void;
  onConfirmCutHistory: (cutoffDate: string) => void;

  // Post-import reconciliation modal state. Populated when an import
  // produces candidate merges or orphans the user should triage.
  reconciliation: ReconciliationState | null;
  onApplyReconciliation: (decisions: ReconciliationApply) => void;
  onCancelReconciliation: () => void;

  // Retrospective orphan-triage modal state. Populated when the user
  // taps a covered month's "N entries to move or delete" footer
  // button in the budget page.
  manualTriage: ManualTriageState | null;
  setManualTriage: (next: ManualTriageState | null) => void;
  onTriageMonth: (monthKey: string) => void;
  onApplyManualTriage: (decisions: ReconciliationApply) => void;

  // Last step of the import pipeline — set after the reconciliation
  // pass (or the quiet-path skip-reconciliation branch) when
  // `predictRenames` finds learned mappings for entries the user is
  // about to import.
  renamePredictor: RenamePredictorState | null;
  onCommitRenamePredictor: (decisions: RenameDecision[]) => void;
  onCancelRenamePredictor: () => void;

  // BudgetFindConflictsModal hooks.
  onMergeConflictIntoHistory: (
    accountId: string,
    mergedRowIds: string[],
    overrides: readonly ConflictHistoryStamp[],
  ) => void;
  onMergeConflictUserRows: (
    winnerId: string,
    loserIds: string[],
    patch: ConflictUserRowPatch,
  ) => void;
};

// Everything related to bank-history import / triage:
//
//   - `onConfirmImportHistory` is the entry point — it parses a bank
//     file, runs the matcher, and decides whether to open the
//     reconciliation modal, the rename-predictor modal, or commit the
//     import straight away.
//   - The reconciliation / rename-predictor pipeline is deferred via
//     `commitStagedImport` so the same dispatch order (importBankHistory
//     → applyReconciliation → applyImportRenames) holds for both the
//     reconciliation-then-rename path and the quiet path.
//   - Manual orphan triage (`onTriageMonth`) reuses the same
//     AccountReconciliationModal scoped to a single month's orphan rows.
//   - The `onMergeConflict*` handlers wire BudgetFindConflictsModal merges
//     back through `applyReconciliation` (history winner) or three
//     sequential reducer dispatches (user-row winner).
export function useImportFlow({
  data,
  activeItem,
  sheetId,
  itemId,
  dispatch,
}: Params): Result {
  const [importHistoryForId, setImportHistoryForId] = useState<string | null>(
    null,
  );
  const [viewHistoryForId, setViewHistoryForId] = useState<string | null>(null);
  const [cutHistoryForId, setCutHistoryForId] = useState<string | null>(null);
  const [reconciliation, setReconciliation] =
    useState<ReconciliationState | null>(null);
  const [manualTriage, setManualTriage] = useState<ManualTriageState | null>(
    null,
  );
  const [renamePredictor, setRenamePredictor] =
    useState<RenamePredictorState | null>(null);

  const onOpenImportHistory = useCallback((accountId: string) => {
    setImportHistoryForId(accountId);
  }, []);
  const onOpenViewHistory = useCallback((accountId: string) => {
    setViewHistoryForId(accountId);
  }, []);
  const onOpenCutHistory = useCallback((accountId: string) => {
    setCutHistoryForId(accountId);
  }, []);
  const cutHistoryAccount = useMemo(
    () =>
      cutHistoryForId
        ? (data.accounts.find((a) => a.id === cutHistoryForId) ?? null)
        : null,
    [cutHistoryForId, data.accounts],
  );
  const onConfirmCutHistory = useCallback(
    (cutoffDate: string) => {
      if (!cutHistoryAccount) return;
      dispatch({
        type: "cutAccountHistory",
        accountId: cutHistoryAccount.id,
        cutoffDate,
      });
      setCutHistoryForId(null);
    },
    [cutHistoryAccount, dispatch],
  );
  const importHistoryAccount = useMemo(
    () =>
      importHistoryForId
        ? (data.accounts.find((a) => a.id === importHistoryForId) ?? null)
        : null,
    [importHistoryForId, data.accounts],
  );
  const viewHistoryAccount = useMemo(
    () =>
      viewHistoryForId
        ? (data.accounts.find((a) => a.id === viewHistoryForId) ?? null)
        : null,
    [viewHistoryForId, data.accounts],
  );

  const onConfirmImportHistory = useCallback(
    (parsed: ParsedBankFile, filename: string) => {
      if (!importHistoryAccount) return;
      const accountId = importHistoryAccount.id;
      // Snapshot pre-import state (`data`) so the staged matcher view
      // is computed against the same world the user just confirmed
      // against, then dispatch / open the modal the outcome calls for.
      const staged = stageHistoryImport(
        data,
        accountId,
        parsed,
        filename,
        Date.now(),
      );
      // The bus dedupes the unlock itself, so re-imports fire it at
      // most once.
      if (staged.dedupeOccurred) unlockAchievement("dedupe");
      setImportHistoryForId(null);

      const { newEntries, pendingImport, outcome } = staged;
      if (outcome.kind === "commit") {
        dispatch({ type: "importBankHistory", accountId, ...pendingImport });
        return;
      }
      if (outcome.kind === "renamePredictor") {
        setRenamePredictor({
          accountId,
          suggestions: outcome.suggestions,
          pendingImport,
          pendingReconciliation: null,
        });
        return;
      }
      setReconciliation({
        accountId,
        preImportData: data,
        newEntries,
        candidates: outcome.candidates,
        orphans: outcome.orphans,
        pendingImport,
      });
    },
    [data, dispatch, importHistoryAccount],
  );

  // Single chokepoint for the deferred-commit pipeline. Called from
  // both the quiet path (no reconciliation, rename predictor only) and
  // the reconciliation-then-rename path so the dispatch order — import
  // first, then applyReconciliation, then applyImportRenames — is
  // identical in both branches and the rename-pattern bump can find
  // the entries it needs to refresh.
  const commitStagedImport = useCallback(
    (
      accountId: string,
      pendingImport: ReconciliationState["pendingImport"],
      reconciliationDecisions: ReconciliationApply | null,
      renames: RenameDecision[],
    ) => {
      dispatch({
        type: "importBankHistory",
        accountId,
        ...pendingImport,
      });
      if (
        reconciliationDecisions &&
        (reconciliationDecisions.mergedRowIds.length > 0 ||
          reconciliationDecisions.entryOverrides.length > 0 ||
          reconciliationDecisions.seriesRules.length > 0 ||
          reconciliationDecisions.orphans.length > 0)
      ) {
        dispatch({
          type: "applyReconciliation",
          accountId,
          mergedRowIds: reconciliationDecisions.mergedRowIds,
          entryOverrides: reconciliationDecisions.entryOverrides,
          seriesRules: reconciliationDecisions.seriesRules,
          orphans: reconciliationDecisions.orphans,
        });
      }
      if (renames.length > 0) {
        dispatch({
          type: "applyImportRenames",
          accountId,
          renames: renames.map((r) => ({
            entryId: r.entryId,
            userDescription: r.userDescription,
          })),
        });
      }
    },
    [dispatch],
  );

  const onApplyReconciliation = useCallback(
    (decisions: ReconciliationApply) => {
      if (!reconciliation) return;
      const { accountId, newEntries, pendingImport, preImportData } =
        reconciliation;
      // Look up rename predictions against the same pre-import
      // snapshot the reconciliation modal worked from. Entries the
      // user already labelled (e.g. via reconciliation
      // `entryOverrides`) are filtered out inside `predictRenames` —
      // its skip-if-userDescription guard covers per-entry overrides
      // we'd otherwise re-suggest a rename for.
      const renameSuggestions = predictRenames(
        preImportData.renamePatterns,
        accountId,
        newEntries,
      );
      // Suppress suggestions for entries the reconciliation flow is
      // about to stamp a userDescription onto — those entries will be
      // labelled by the merged row's description in a moment, so a
      // parallel rename suggestion would race the reconciliation
      // stamp.
      const stampedEntryIds = new Set<string>();
      for (const o of decisions.entryOverrides) {
        if (o.userDescription) stampedEntryIds.add(o.historyEntryId);
      }
      const filteredSuggestions = renameSuggestions.filter(
        (s) => !stampedEntryIds.has(s.entryId),
      );
      if (filteredSuggestions.length === 0) {
        commitStagedImport(accountId, pendingImport, decisions, []);
        setReconciliation(null);
        return;
      }
      setReconciliation(null);
      setRenamePredictor({
        accountId,
        suggestions: filteredSuggestions,
        pendingImport,
        pendingReconciliation: { decisions },
      });
    },
    [reconciliation, commitStagedImport],
  );

  // Apply-predictor handler. Empty `decisions` from the modal means
  // "Skip" (commit without renames); a non-empty array means "Apply"
  // (commit with the accepted renames stamped).
  const onCommitRenamePredictor = useCallback(
    (decisions: RenameDecision[]) => {
      if (!renamePredictor) return;
      commitStagedImport(
        renamePredictor.accountId,
        renamePredictor.pendingImport,
        renamePredictor.pendingReconciliation?.decisions ?? null,
        decisions,
      );
      setRenamePredictor(null);
    },
    [renamePredictor, commitStagedImport],
  );

  // Discard the staged import without dispatching. Wired to the
  // modal's Cancel button, X, Escape, and click-outside.
  const onCancelRenamePredictor = useCallback(() => {
    setRenamePredictor(null);
  }, []);

  // Discard the pending import unread. Wired to the modal's X /
  // Escape / click-outside so dismissing the dialog rolls back to
  // pre-pick state — the parsed file is dropped, nothing lands in
  // `state.history`, no `HistoryImport` log entry is written.
  const onCancelReconciliation = useCallback(() => {
    setReconciliation(null);
  }, []);

  // BudgetFindConflictsModal — merge a duplicate group whose winner is a
  // history-backed row. Routes through `applyReconciliation` with
  // empty `seriesRules` / `orphans`, so the existing blanks-only
  // stamp on `userDescription` / `userTypeId` applies and the loser
  // rows are deleted in the same pass. Distinct from
  // `onApplyReconciliation` above because that one assumes a
  // deferred `importBankHistory` is pending — here there is none.
  const onMergeConflictIntoHistory = useCallback(
    (
      accountId: string,
      mergedRowIds: string[],
      overrides: readonly ConflictHistoryStamp[],
    ) => {
      if (mergedRowIds.length === 0 && overrides.length === 0) return;
      dispatch({
        type: "applyReconciliation",
        accountId,
        mergedRowIds: [...mergedRowIds],
        entryOverrides: [...overrides],
        seriesRules: [],
        orphans: [],
      });
      unlockAchievement("doppelganger");
    },
    [dispatch],
  );

  // BudgetPage BudgetMonthTable footer — when the user taps "N entries to
  // move or delete" on a covered fiscal month, find the orphan rows
  // for that month and open the reconciliation modal scoped to them.
  // No import is in flight, so `pendingImport` is null and the apply
  // handler dispatches `applyReconciliation` directly (no
  // `importBankHistory`).
  const onTriageMonth = useCallback(
    (monthKey: string) => {
      const accountId = activeItem.accountId;
      if (!accountId) return;
      const orphans = findOrphans(
        activeItem.rows,
        activeItem.columns,
        new Set([monthKey]),
        new Set(),
        data.settings.startOfMonth,
      );
      if (orphans.length === 0) return;
      // Snapshot the workspace at trigger time so the modal's row
      // lookups stay stable even if the user keeps editing other
      // sheets in the background while the modal is open.
      setManualTriage({
        accountId,
        preImportData: data,
        orphans,
      });
    },
    [activeItem, data],
  );

  const onApplyManualTriage = useCallback(
    (decisions: ReconciliationApply) => {
      if (!manualTriage) return;
      const { accountId } = manualTriage;
      if (decisions.orphans.length > 0) {
        dispatch({
          type: "applyReconciliation",
          accountId,
          mergedRowIds: [],
          entryOverrides: [],
          seriesRules: [],
          orphans: decisions.orphans,
        });
      }
      setManualTriage(null);
    },
    [dispatch, manualTriage],
  );

  // BudgetFindConflictsModal — merge a duplicate group whose winner is a
  // user-authored row. Three sequential dispatches: fill `typeId` on
  // the winner via `bulkUpdate` (it already handles the typeId slot),
  // fill the winner's description cell via `updateCell` when the
  // patch includes one, then delete the loser rows.
  const onMergeConflictUserRows = useCallback(
    (winnerId: string, loserIds: string[], patch: ConflictUserRowPatch) => {
      if (loserIds.length === 0) return;
      if (patch.typeId !== undefined) {
        dispatch({
          type: "bulkUpdate",
          sheetId,
          itemId,
          rowIds: [winnerId],
          patch: { typeId: patch.typeId },
        });
      }
      if (patch.description !== undefined) {
        const descCol = findColumnByType(activeItem.columns, "description");
        if (descCol) {
          dispatch({
            type: "updateCell",
            sheetId,
            itemId,
            rowId: winnerId,
            columnId: descCol.id,
            value: patch.description,
          });
        }
      }
      dispatch({
        type: "deleteRows",
        sheetId,
        itemId,
        rowIds: loserIds,
      });
      unlockAchievement("doppelganger");
    },
    [activeItem.columns, dispatch, itemId, sheetId],
  );

  return {
    importHistoryAccount,
    setImportHistoryForId,
    onOpenImportHistory,
    onConfirmImportHistory,
    viewHistoryAccount,
    setViewHistoryForId,
    onOpenViewHistory,
    cutHistoryAccount,
    setCutHistoryForId,
    onOpenCutHistory,
    onConfirmCutHistory,
    reconciliation,
    onApplyReconciliation,
    onCancelReconciliation,
    manualTriage,
    setManualTriage,
    onTriageMonth,
    onApplyManualTriage,
    renamePredictor,
    onCommitRenamePredictor,
    onCancelRenamePredictor,
    onMergeConflictIntoHistory,
    onMergeConflictUserRows,
  };
}
