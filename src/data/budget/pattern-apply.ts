// Cross-sheet match-rule application. Sits between `match-rules.ts`
// (pure per-candidate matcher) and `reducer.ts` (state mutation) so
// both the reducer and the UI ("how many rows does this rule type?",
// "what would happen if I hit Reapply?") can run the same walk
// without copy-pasting the row-iteration logic.
//
// Two surfaces matter:
//
// * `reapplyPatternsToAllSheets` — produces a fresh `Sheet[]` with
//   every budget row's `typeId` re-evaluated against the current
//   ruleset. Returns the input array unchanged (referential identity
//   preserved) when nothing resolves so the reducer can short-circuit
//   a no-op dispatch into a no-op state diff.
//
// * `countRuleHitsOnSheets` — folds the same walk into a per-rule
//   counter. Used by the Patterns settings tab to render "n rows"
//   chips so the user can see which rules are pulling weight.
//
// Both helpers honour `typeIdLocked: true` (manual type pick) the
// same way `applyPatternsAfterCellEdit` does — locked rows are
// skipped entirely so the user's deliberate label is never
// overwritten and never attributed to a rule that "would have won"
// against an unlocked row.
//
// Patterns are **additive only**: when no rule matches a row (or a
// matching rule carries no `typeId` of its own), the existing
// `typeId` on the row is left untouched. Rules add types, they never
// strip one. Otherwise editing a rule's pattern, creating a fresh
// rule that doesn't catch a long-standing recurring entry, or
// hitting "Reapply all" would silently wipe types the user had set
// long before the patterns feature existed.

import {
  findMatchingRule,
  findMatchingRuleForCandidate,
  ruleMatchesEntry,
} from "../match-rules";
import { candidateFromRow, resolveCandidateColumns } from "../row-candidate";
import { mapAccountBudgets } from "../sheet";
import type {
  AccountBudget,
  HistoryEntry,
  MatchRule,
  Row,
  Sheet,
} from "../types";

export function reapplyPatternsToBudget(
  item: AccountBudget,
  rules: readonly MatchRule[],
): AccountBudget {
  if (rules.length === 0) return item;
  const cols = resolveCandidateColumns(item.columns);
  if (cols.descId === undefined) return item;
  let changed = false;
  const nextRows = item.rows.map((row) => {
    if (row.typeIdLocked) return row;
    const candidate = candidateFromRow(row, cols);
    if (!candidate) return row;
    const rule = findMatchingRuleForCandidate(rules, candidate);
    // Additive only: if no rule wins (or the winning rule itself
    // carries no typeId), keep whatever the row already had. See the
    // header note — rules add types, they never strip them.
    if (!rule || !rule.typeId) return row;
    const ruleCompanyId =
      rule.companyId !== undefined && rule.companyId !== null
        ? rule.companyId
        : undefined;
    const typeNeedsUpdate = rule.typeId !== row.typeId;
    const companyNeedsUpdate =
      ruleCompanyId !== undefined && ruleCompanyId !== row.companyId;
    if (!typeNeedsUpdate && !companyNeedsUpdate) return row;
    changed = true;
    const next: Row = { ...row, typeId: rule.typeId };
    if (ruleCompanyId !== undefined) next.companyId = ruleCompanyId;
    return next;
  });
  if (!changed) return item;
  return { ...item, rows: nextRows };
}

export function reapplyPatternsToAllSheets(
  sheets: readonly Sheet[],
  rules: readonly MatchRule[],
): Sheet[] {
  return mapAccountBudgets(sheets, (item) =>
    reapplyPatternsToBudget(item, rules),
  );
}

// Count budget rows whose persisted typeId would be touched by a
// fresh reapply. Locked rows are excluded — they don't move on
// reapply, so counting them as "changed" would mislead the toast
// preview the caller usually shows.
export function countRowsAffectedByReapply(
  prev: readonly Sheet[],
  next: readonly Sheet[],
): number {
  if (prev === next) return 0;
  let count = 0;
  for (let i = 0; i < prev.length; i += 1) {
    const prevSheet = prev[i];
    const nextSheet = next[i];
    if (prevSheet === nextSheet) continue;
    for (let j = 0; j < prevSheet.items.length; j += 1) {
      const prevItem = prevSheet.items[j];
      const nextItem = nextSheet.items[j];
      if (prevItem === nextItem) continue;
      if (prevItem.type !== "accountBudget") continue;
      if (nextItem.type !== "accountBudget") continue;
      const prevById = new Map<string, Row>();
      for (const r of prevItem.rows) prevById.set(r.id, r);
      for (const nextRow of nextItem.rows) {
        const prevRow = prevById.get(nextRow.id);
        if (!prevRow) continue;
        if ((prevRow.typeId ?? null) !== (nextRow.typeId ?? null)) count += 1;
      }
    }
  }
  return count;
}

// Fold a single walk over every unlocked budget row plus every visible
// history entry into a per-rule counter. The winning rule for each
// candidate is the first match in `rules`, mirroring the matcher's
// "earlier rules win" contract. Candidates that no rule matches
// contribute to no count.
//
// Two surfaces feed the count, matching what the user sees in the
// budget view (`buildVisibleRows`):
//   1. Explicit budget rows — manually-typed or recurring. Skipped
//      when `typeIdLocked` (manual type pick wins over the rule).
//   2. Synthesized history rows — every non-hidden history entry on
//      every account renders as a row via `synthesizeHistoryRow`.
//      Split entries are excluded because each split brings its own
//      description / typeId; the rule's labels don't apply to them.
//
// History overrides (`userTypeId`, `userDescription`) are intentionally
// NOT excluded — the MatchRuleModal preview that drives the user's
// expectation counts every match, and re-subtracting overrides here
// would re-open the same gap from the other side.
export function countRuleHitsOnSheets(
  sheets: readonly Sheet[],
  rules: readonly MatchRule[],
  history: Readonly<Record<string, HistoryEntry[]>> = {},
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(rule.id, 0);
  if (rules.length === 0) return counts;
  for (const sheet of sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const cols = resolveCandidateColumns(item.columns);
      if (cols.descId === undefined) continue;
      for (const row of item.rows) {
        if (row.typeIdLocked) continue;
        const candidate = candidateFromRow(row, cols);
        if (!candidate) continue;
        const winning = findMatchingRuleForCandidate(rules, candidate);
        if (!winning) continue;
        counts.set(winning.id, (counts.get(winning.id) ?? 0) + 1);
      }
    }
  }
  for (const accountId of Object.keys(history)) {
    const entries = history[accountId];
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.hidden) continue;
      if (entry.splits && entry.splits.length > 0) continue;
      const winning = findMatchingRule(rules, entry);
      if (!winning) continue;
      counts.set(winning.id, (counts.get(winning.id) ?? 0) + 1);
    }
  }
  return counts;
}

// One-shot application of a rule that the user explicitly chose NOT
// to persist (the "Save pattern" checkbox in MatchRuleModal). Stamps
// every match as if the user had manually labelled each row / entry:
// budget rows pick up `typeId` plus `typeIdLocked: true`, history
// entries pick up `userTypeId` (and `userDescription` when the rule
// carries one). Locking matches the user's framing — they're using
// the modal as a bulk-label tool, not authoring a rule that should
// keep watching for future imports. Returns the input shapes
// unchanged when the rule wouldn't change anything so the reducer
// can short-circuit a no-op dispatch.
export function applyMatchRuleOnceToBudget(
  item: AccountBudget,
  rule: MatchRule,
): AccountBudget {
  const ruleTypeId = rule.typeId;
  const ruleCompanyId =
    rule.companyId !== undefined && rule.companyId !== null
      ? rule.companyId
      : undefined;
  // Bail when the rule has no labels to stamp — both the type and
  // company are missing.
  if (!ruleTypeId && ruleCompanyId === undefined) return item;
  const cols = resolveCandidateColumns(item.columns);
  if (cols.descId === undefined) return item;
  let changed = false;
  // Locked rows are NOT skipped — `typeIdLocked` exists to protect
  // against automatic sweeps (a new saved rule, "Reapply all"), not
  // against a deliberate user action. "Label similar" without saving
  // is a deliberate action, so the user expects locked rows to be
  // relabelled the same as any other manual pick would relabel them.
  const nextRows = item.rows.map((row) => {
    const candidate = candidateFromRow(row, cols);
    if (!candidate) return row;
    if (!findMatchingRuleForCandidate([rule], candidate)) return row;
    const typeMatches = ruleTypeId
      ? row.typeId === ruleTypeId && row.typeIdLocked === true
      : true;
    const companyMatches =
      ruleCompanyId === undefined || row.companyId === ruleCompanyId;
    if (typeMatches && companyMatches) return row;
    changed = true;
    const next: Row = { ...row };
    if (ruleTypeId) {
      next.typeId = ruleTypeId;
      next.typeIdLocked = true;
    }
    if (ruleCompanyId !== undefined) next.companyId = ruleCompanyId;
    return next;
  });
  if (!changed) return item;
  return { ...item, rows: nextRows };
}

export function applyMatchRuleOnceToAllSheets(
  sheets: readonly Sheet[],
  rule: MatchRule,
): Sheet[] {
  return mapAccountBudgets(sheets, (item) =>
    applyMatchRuleOnceToBudget(item, rule),
  );
}

// Stamp `userTypeId` (and `userDescription` when set on the rule) on
// every non-hidden history entry the rule matches. Split entries are
// skipped — each split carries its own description / typeId and the
// rule's labels don't apply to them, matching the contract in
// `countRuleHitsOnSheets`. Returns the input map unchanged when
// nothing moves.
export function applyMatchRuleOnceToHistory(
  history: Readonly<Record<string, HistoryEntry[]>>,
  rule: MatchRule,
): Record<string, HistoryEntry[]> {
  const ruleTypeId = rule.typeId ?? undefined;
  const ruleCompanyId =
    rule.companyId !== undefined && rule.companyId !== null
      ? rule.companyId
      : undefined;
  const ruleDescription =
    typeof rule.description === "string" && rule.description !== ""
      ? rule.description
      : undefined;
  if (
    ruleTypeId === undefined &&
    ruleCompanyId === undefined &&
    ruleDescription === undefined
  )
    return history as Record<string, HistoryEntry[]>;
  let mapChanged = false;
  const out: Record<string, HistoryEntry[]> = {};
  for (const accountId of Object.keys(history)) {
    const entries = history[accountId];
    if (!entries) {
      out[accountId] = entries;
      continue;
    }
    let listChanged = false;
    const nextEntries = entries.map((entry) => {
      if (entry.hidden) return entry;
      if (entry.splits && entry.splits.length > 0) return entry;
      if (!ruleMatchesEntry(rule, entry)) return entry;
      const next: HistoryEntry = { ...entry };
      let touched = false;
      if (ruleTypeId !== undefined && next.userTypeId !== ruleTypeId) {
        next.userTypeId = ruleTypeId;
        touched = true;
      }
      if (ruleCompanyId !== undefined && next.userCompanyId !== ruleCompanyId) {
        next.userCompanyId = ruleCompanyId;
        touched = true;
      }
      if (
        ruleDescription !== undefined &&
        next.userDescription !== ruleDescription
      ) {
        next.userDescription = ruleDescription;
        touched = true;
      }
      if (!touched) return entry;
      listChanged = true;
      return next;
    });
    if (listChanged) {
      mapChanged = true;
      out[accountId] = nextEntries;
    } else {
      out[accountId] = entries;
    }
  }
  return mapChanged ? out : (history as Record<string, HistoryEntry[]>);
}
