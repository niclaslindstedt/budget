// Pure staging pipeline for bank-history imports.
//
// Given the pre-import snapshot and a freshly parsed bank file, this
// decides whether the import can commit straight away, needs the
// rename-predictor modal, or needs the full reconciliation modal — and
// returns the data each path consumes. No React, no dispatch, no side
// effects: the caller (`useImportFlow`) wraps the result into the
// component-layer modal state and fires the achievement / dispatches.
//
// Pulling the pipeline out of the hook's `useCallback` closure makes
// the matcher orchestration (merge → auto-rule pass → coverage delta →
// candidate / orphan detection → rename prediction) testable in
// isolation against a fixed `now`, which the closure form was not.

import { coverageDelta, coveredMonths } from "./coverage";
import {
  findCandidates,
  findOrphans,
  findRuleDrivenCandidates,
  type MatchCandidate,
  type OrphanRow,
} from "./reconciliation";
import { predictRenames, type RenameSuggestion } from "./rename-patterns";
import type { Column, HistoryEntry, Row, UserData } from "./types";
import {
  mergeHistory,
  type ParsedBankEntry,
  type ParsedBankFile,
} from "../storage/banks";

// Parsed bank file held in memory until the import commits. Dispatched
// verbatim as the `importBankHistory` payload when the user clicks
// Apply or Skip all; dropped on cancel.
export type PendingImport = {
  bankParserId: string;
  bankClearing?: string;
  bankAccountNumber?: string;
  filename: string;
  entries: ParsedBankEntry[];
  now: number;
};

// Which modal the import flows into once staged.
export type StagedImportOutcome =
  // Nothing to triage and no learned renames — commit immediately.
  | { kind: "commit" }
  // Nothing to triage but learned renames to review — open the
  // rename-predictor modal as the only step.
  | { kind: "renamePredictor"; suggestions: RenameSuggestion[] }
  // Candidates and/or orphans to triage — open the reconciliation
  // modal; rename prediction runs after it applies.
  | {
      kind: "reconciliation";
      candidates: MatchCandidate[];
      orphans: OrphanRow[];
    };

export type StagedImport = {
  // True when the merge skipped at least one parsed entry as a
  // duplicate — the caller fires the `dedupe` achievement.
  dedupeOccurred: boolean;
  // Entries that WILL be added when the import commits (the freshly
  // parsed rows minus those that dedup against the existing history).
  newEntries: HistoryEntry[];
  pendingImport: PendingImport;
  outcome: StagedImportOutcome;
};

// Stage an import against `preImportData` (the world the user confirmed
// against). `now` is passed in rather than read from `Date.now()` so
// the merge timestamps and the result stay deterministic for tests.
export function stageHistoryImport(
  preImportData: UserData,
  accountId: string,
  parsed: ParsedBankFile,
  filename: string,
  now: number,
): StagedImport {
  const existingHistory = preImportData.history[accountId] ?? [];
  const { merged, addedIds } = mergeHistory(
    existingHistory,
    parsed.entries,
    now,
  );
  const newEntries = merged.filter((e) => addedIds.has(e.id));
  // Any parsed row that didn't make it into `addedIds` was a duplicate
  // the merge skipped — the `dedupe` gesture.
  const dedupeOccurred = addedIds.size < parsed.entries.length;

  // Walk every account-budget that tracks this account; the matcher
  // works per (rows, columns) tuple so each item runs independently but
  // contributes to the same candidate pool.
  const rowsForAccount: Array<{
    sheetId: string;
    itemId: string;
    rows: Row[];
    columns: Column[];
  }> = [];
  for (const sheet of preImportData.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      if (item.accountId !== accountId) continue;
      rowsForAccount.push({
        sheetId: sheet.id,
        itemId: item.id,
        rows: item.rows,
        columns: item.columns,
      });
    }
  }

  // Auto-rule-driven matches (mirrors the reducer's silent pass) so we
  // exclude those rows from the user-facing candidate set.
  const autoMatchedRowIds = new Set<string>();
  for (const { rows, columns } of rowsForAccount) {
    const auto = findRuleDrivenCandidates(
      preImportData.seriesMatchRules,
      newEntries,
      rows,
      columns,
    );
    for (const m of auto) autoMatchedRowIds.add(m.rowId);
  }

  // Coverage snapshot: months covered by history before vs. after this
  // import. Orphan detection scopes to the diff.
  const beforeCovered =
    rowsForAccount.length > 0
      ? coveredMonths(
          existingHistory,
          rowsForAccount.flatMap((r) => r.rows),
          rowsForAccount[0].columns,
          preImportData.settings.startOfMonth,
        )
      : new Set<string>();
  // Apply silent auto-deletions before computing post-coverage so the
  // rule's actions don't accidentally suppress coverage.
  const afterRowsForAccount = rowsForAccount.map((r) => ({
    ...r,
    rows: r.rows.filter((row) => !autoMatchedRowIds.has(row.id)),
  }));
  const afterCovered =
    afterRowsForAccount.length > 0
      ? coveredMonths(
          merged,
          afterRowsForAccount.flatMap((r) => r.rows),
          afterRowsForAccount[0].columns,
          preImportData.settings.startOfMonth,
        )
      : new Set<string>();
  const newlyCovered = coverageDelta(beforeCovered, afterCovered);

  const allCandidates: MatchCandidate[] = [];
  const allOrphans: OrphanRow[] = [];
  for (const { rows, columns } of afterRowsForAccount) {
    const candidates = findCandidates(newEntries, rows, columns).filter(
      (c) => !autoMatchedRowIds.has(c.rowId),
    );
    for (const c of candidates) allCandidates.push(c);
    const claimedIds = new Set(candidates.map((c) => c.rowId));
    const orphans = findOrphans(
      rows,
      columns,
      newlyCovered,
      claimedIds,
      preImportData.settings.startOfMonth,
    );
    for (const o of orphans) allOrphans.push(o);
  }

  const pendingImport: PendingImport = {
    bankParserId: parsed.bankParserId,
    bankClearing: parsed.bankClearing,
    bankAccountNumber: parsed.bankAccountNumber,
    filename,
    entries: parsed.entries,
    now,
  };

  // Compute rename predictions against the same pre-import snapshot the
  // rest of the matcher saw. Only surfaced on the quiet path; the
  // reconciliation path re-runs prediction after the modal applies.
  const renameSuggestions = predictRenames(
    preImportData.renamePatterns,
    accountId,
    newEntries,
  );

  // Quiet path — nothing to triage on the reconciliation side. Commit
  // immediately unless we have rename predictions to review.
  if (allCandidates.length === 0 && allOrphans.length === 0) {
    if (renameSuggestions.length === 0) {
      return {
        dedupeOccurred,
        newEntries,
        pendingImport,
        outcome: { kind: "commit" },
      };
    }
    return {
      dedupeOccurred,
      newEntries,
      pendingImport,
      outcome: { kind: "renamePredictor", suggestions: renameSuggestions },
    };
  }

  return {
    dedupeOccurred,
    newEntries,
    pendingImport,
    outcome: {
      kind: "reconciliation",
      candidates: allCandidates,
      orphans: allOrphans,
    },
  };
}
