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
import { diffDaysIso } from "../utils/date";
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
  bankName?: string;
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

// Days of overlap allowed before the import flow asks the user to confirm
// they meant to import into this account. A few late-posting card charges
// from the previous statement can legitimately spill into the next one, so
// a small overlap isn't suspicious; a larger one means the statement's
// period is already covered here — likely the wrong account.
export const IMPORT_OVERLAP_SLACK_DAYS = 7;

function dateRange(
  entries: readonly { date: string }[],
): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const e of entries) {
    if (typeof e.date !== "string" || e.date.length < 10) continue;
    if (start === null || e.date < start) start = e.date;
    if (end === null || e.date > end) end = e.date;
  }
  return start !== null && end !== null ? { start, end } : null;
}

// The date range over which the rows this import would ADD overlap the
// account's EXISTING history, when that overlap exceeds the slack. `null`
// when there's no existing history, nothing new to add, the ranges are
// disjoint, or the overlap is within the slack — i.e. the import is a
// clean continuation and needs no confirmation.
export function importOverlap(
  existing: readonly HistoryEntry[],
  newEntries: readonly HistoryEntry[],
  slackDays: number = IMPORT_OVERLAP_SLACK_DAYS,
): { start: string; end: string } | null {
  if (existing.length === 0 || newEntries.length === 0) return null;
  const ex = dateRange(existing);
  const next = dateRange(newEntries);
  if (ex === null || next === null) return null;
  const start = ex.start > next.start ? ex.start : next.start;
  const end = ex.end < next.end ? ex.end : next.end;
  if (start > end) return null; // disjoint ranges
  const days = diffDaysIso(end, start);
  if (!Number.isFinite(days) || days <= slackDays) return null;
  return { start, end };
}

export type StagedImport = {
  // True when the merge skipped at least one parsed entry as a
  // duplicate — the caller fires the `dedupe` achievement.
  dedupeOccurred: boolean;
  // Set when the rows this import would add overlap the account's existing
  // history by more than the slack (see `importOverlap`) — the flow asks
  // the user to confirm before committing. `null` ⇒ no confirmation needed.
  overlap: { start: string; end: string } | null;
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
  // Whether the freshly-added rows overlap the account's existing history
  // enough to warrant a "did you mean this account?" confirmation.
  const overlap = importOverlap(existingHistory, newEntries);

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
    bankName: parsed.bankName,
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
        overlap,
        newEntries,
        pendingImport,
        outcome: { kind: "commit" },
      };
    }
    return {
      dedupeOccurred,
      overlap,
      newEntries,
      pendingImport,
      outcome: { kind: "renamePredictor", suggestions: renameSuggestions },
    };
  }

  return {
    dedupeOccurred,
    overlap,
    newEntries,
    pendingImport,
    outcome: {
      kind: "reconciliation",
      candidates: allCandidates,
      orphans: allOrphans,
    },
  };
}
