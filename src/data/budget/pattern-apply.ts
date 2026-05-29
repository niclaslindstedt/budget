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
  compilePattern,
  findMatchingRule,
  findMatchingRuleForCandidate,
  mergeTagIds,
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
    // Additive only: if no rule wins, keep whatever the row already
    // had. A rule that carries no labels of its own (no type, company,
    // or tags) leaves the row untouched too. See the header note —
    // rules add labels, they never strip them.
    if (!rule) return row;
    const ruleCompanyId =
      rule.companyId !== undefined && rule.companyId !== null
        ? rule.companyId
        : undefined;
    const nextTagIds = mergeTagIds(row.tagIds, rule.tagIds);
    const typeNeedsUpdate =
      rule.typeId !== undefined &&
      rule.typeId !== null &&
      rule.typeId !== row.typeId;
    const companyNeedsUpdate =
      ruleCompanyId !== undefined && ruleCompanyId !== row.companyId;
    const tagsNeedUpdate = nextTagIds !== row.tagIds;
    if (!typeNeedsUpdate && !companyNeedsUpdate && !tagsNeedUpdate) return row;
    changed = true;
    const next: Row = { ...row };
    if (typeNeedsUpdate && rule.typeId) next.typeId = rule.typeId;
    if (ruleCompanyId !== undefined) next.companyId = ruleCompanyId;
    if (tagsNeedUpdate && nextTagIds) next.tagIds = [...nextTagIds];
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

// Count budget rows whose persisted labels would be touched by a
// fresh reapply — the type, company, or tag set changing all count, so
// a tags-only or company-only rule still reports honest numbers in the
// toast the caller shows. Locked rows are excluded — they don't move
// on reapply, so counting them as "changed" would mislead the preview.
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
        if (
          (prevRow.typeId ?? null) !== (nextRow.typeId ?? null) ||
          (prevRow.companyId ?? null) !== (nextRow.companyId ?? null) ||
          !sameTagIds(prevRow.tagIds, nextRow.tagIds)
        ) {
          count += 1;
        }
      }
    }
  }
  return count;
}

// Order-insensitive equality for two optional tag-id arrays. A reapply
// only ever appends (never reorders) so a length + membership check is
// enough to tell a real change from a no-op.
function sameTagIds(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  const aLen = a?.length ?? 0;
  const bLen = b?.length ?? 0;
  if (aLen !== bLen) return false;
  if (aLen === 0) return true;
  const setA = new Set(a);
  for (const id of b ?? []) if (!setA.has(id)) return false;
  return true;
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
// NOT excluded — the BudgetMatchRuleModal preview that drives the user's
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
// to persist (the "Save pattern" checkbox in BudgetMatchRuleModal). Stamps
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
  const hasRuleTags = rule.tagIds !== undefined && rule.tagIds.length > 0;
  // Bail when the rule has no labels to stamp — type, company, and
  // tags are all missing.
  if (!ruleTypeId && ruleCompanyId === undefined && !hasRuleTags) return item;
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
    const nextTagIds = mergeTagIds(row.tagIds, rule.tagIds);
    const tagsMatch = nextTagIds === row.tagIds;
    if (typeMatches && companyMatches && tagsMatch) return row;
    changed = true;
    const next: Row = { ...row };
    if (ruleTypeId) {
      next.typeId = ruleTypeId;
      next.typeIdLocked = true;
    }
    if (ruleCompanyId !== undefined) next.companyId = ruleCompanyId;
    if (!tagsMatch && nextTagIds) next.tagIds = [...nextTagIds];
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
// Metadata-mode bulk apply. Stamps the labels the user just gave one
// history entry onto its lookalikes — every other entry on the same
// account whose RAW bank description matches a glob `pattern` derived
// from the source entry (dates / ref numbers stripped, see
// `pattern-derive.ts`). Unlike `applyMatchRuleOnceToHistory`, which
// overwrites, this fills BLANK fields only: an entry that already
// carries its own type / company / description override is left alone,
// so the sweep never clobbers a deliberate per-entry label. Tags are
// additive (unioned). Companies are skipped on entries the user already
// flagged `noCompany`. The source entry is excluded — it's saved
// through `updateHistoryEntry` separately so its rename-learning and
// changed-only-field semantics still apply.
export type HistoryMetadataPatch = {
  // Each field is "apply this value where the entry lacks it". Absent
  // means "don't touch this field". Description / type / company fill
  // blanks; tags union; `noCompany` fills the "no company applies"
  // decision on entries that don't yet have a company (or an explicit
  // omit). `userCompanyId` and `noCompany` are mutually exclusive — the
  // metadata form only ever sets one, and company wins if both arrive.
  userDescription?: string;
  userTypeId?: string;
  userCompanyId?: string;
  userTagIds?: readonly string[];
  noCompany?: boolean;
};

// An entry "lacks a company decision" when it neither carries a company
// override nor has been flagged as not needing one — the same blank the
// metadata walk surfaces. Both the company-fill and the omit-company
// stamp gate on this so neither overrides a decision the user (or a
// previous sweep) already made on the matching entry.
function lacksCompanyDecision(entry: HistoryEntry): boolean {
  return entry.userCompanyId === undefined && !entry.noCompany;
}

// Structural exclusions mirror `entryNeedsMetadata` in
// `BudgetMetadataModal`: hidden / collapsed / transfer / split entries
// never take a metadata stamp.
function isMetadataBulkCandidate(
  entry: HistoryEntry,
  compiled: RegExp,
  excludeEntryId: string,
): boolean {
  if (entry.id === excludeEntryId) return false;
  if (entry.hidden) return false;
  if (entry.collapsedIntoTransferId) return false;
  if (entry.isTransfer) return false;
  if (entry.splits && entry.splits.length > 0) return false;
  return compiled.test(entry.description);
}

// The patch fills `userDescription` when the entry has neither a real
// override nor the explicit-clear empty string — an entry the user
// deliberately blanked keeps its blank.
function lacksDescription(entry: HistoryEntry): boolean {
  return entry.userDescription === undefined;
}

function metadataPatchChangesEntry(
  entry: HistoryEntry,
  patch: HistoryMetadataPatch,
): boolean {
  if (patch.userTypeId !== undefined && entry.userTypeId === undefined) {
    return true;
  }
  if (patch.userCompanyId !== undefined && lacksCompanyDecision(entry)) {
    return true;
  }
  if (
    patch.noCompany === true &&
    patch.userCompanyId === undefined &&
    lacksCompanyDecision(entry)
  ) {
    return true;
  }
  if (patch.userDescription !== undefined && lacksDescription(entry)) {
    return true;
  }
  if (patch.userTagIds && patch.userTagIds.length > 0) {
    if (mergeTagIds(entry.userTagIds, patch.userTagIds) !== entry.userTagIds) {
      return true;
    }
  }
  return false;
}

function applyMetadataPatch(
  entry: HistoryEntry,
  patch: HistoryMetadataPatch,
): HistoryEntry {
  let next: HistoryEntry | null = null;
  const draft = (): HistoryEntry => (next ??= { ...entry });
  if (patch.userTypeId !== undefined && entry.userTypeId === undefined) {
    draft().userTypeId = patch.userTypeId;
  }
  if (patch.userCompanyId !== undefined && lacksCompanyDecision(entry)) {
    draft().userCompanyId = patch.userCompanyId;
  } else if (
    patch.noCompany === true &&
    patch.userCompanyId === undefined &&
    lacksCompanyDecision(entry)
  ) {
    draft().noCompany = true;
  }
  if (patch.userDescription !== undefined && lacksDescription(entry)) {
    draft().userDescription = patch.userDescription;
  }
  if (patch.userTagIds && patch.userTagIds.length > 0) {
    const merged = mergeTagIds(entry.userTagIds, patch.userTagIds);
    if (merged !== entry.userTagIds && merged) {
      draft().userTagIds = [...merged];
    }
  }
  return next ?? entry;
}

// How many entries the bulk apply would actually change — drives the
// "apply to N similar entries" count in the modal. A bad pattern (or
// one that compiles to nothing) counts zero rather than throwing.
export function countMatchingMetadataTargets(
  entries: readonly HistoryEntry[],
  pattern: string,
  patch: HistoryMetadataPatch,
  excludeEntryId: string,
): number {
  if (pattern.length === 0) return 0;
  let compiled: RegExp;
  try {
    compiled = compilePattern(pattern);
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (!isMetadataBulkCandidate(entry, compiled, excludeEntryId)) continue;
    if (metadataPatchChangesEntry(entry, patch)) count += 1;
  }
  return count;
}

// Apply the fill-blanks stamp to every matching entry. Returns the
// input array reference unchanged when nothing moves so the reducer can
// short-circuit a no-op dispatch.
export function applyMetadataToMatchingEntries(
  entries: readonly HistoryEntry[],
  pattern: string,
  patch: HistoryMetadataPatch,
  excludeEntryId: string,
): HistoryEntry[] {
  if (pattern.length === 0) return entries as HistoryEntry[];
  let compiled: RegExp;
  try {
    compiled = compilePattern(pattern);
  } catch {
    return entries as HistoryEntry[];
  }
  let changed = false;
  const next = entries.map((entry) => {
    if (!isMetadataBulkCandidate(entry, compiled, excludeEntryId)) return entry;
    const updated = applyMetadataPatch(entry, patch);
    if (updated !== entry) changed = true;
    return updated;
  });
  return changed ? next : (entries as HistoryEntry[]);
}

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
  const hasRuleTags = rule.tagIds !== undefined && rule.tagIds.length > 0;
  if (
    ruleTypeId === undefined &&
    ruleCompanyId === undefined &&
    ruleDescription === undefined &&
    !hasRuleTags
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
      const nextTagIds = mergeTagIds(entry.userTagIds, rule.tagIds);
      if (nextTagIds !== entry.userTagIds && nextTagIds) {
        next.userTagIds = [...nextTagIds];
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
