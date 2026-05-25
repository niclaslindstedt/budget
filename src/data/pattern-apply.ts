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

import { findMatchingRuleForCandidate } from "./match-rules";
import { findColumnByType } from "./sheet";
import type { AccountBudget, MatchRule, Row, Sheet } from "./types";

export function reapplyPatternsToBudget(
  item: AccountBudget,
  rules: readonly MatchRule[],
): AccountBudget {
  const descId = findColumnByType(item.columns, "description")?.id;
  if (descId === undefined) return item;
  const amountId = findColumnByType(item.columns, "amount")?.id;
  let changed = false;
  const nextRows = item.rows.map((row) => {
    if (row.typeIdLocked) return row;
    const desc = row.cells[descId];
    if (typeof desc !== "string" || desc.trim() === "") return row;
    const amount =
      amountId !== undefined && typeof row.cells[amountId] === "number"
        ? (row.cells[amountId] as number)
        : 0;
    const candidate = {
      description: desc,
      amount,
      isTransfer: row.isTransfer === true,
    };
    const rule =
      rules.length === 0
        ? null
        : findMatchingRuleForCandidate(rules, candidate);
    const wantTypeId = rule?.typeId ?? null;
    const currentTypeId = row.typeId ?? null;
    if (wantTypeId === currentTypeId) return row;
    changed = true;
    const updated: Row = { ...row };
    if (wantTypeId === null) delete updated.typeId;
    else updated.typeId = wantTypeId;
    return updated;
  });
  if (!changed) return item;
  return { ...item, rows: nextRows };
}

export function reapplyPatternsToAllSheets(
  sheets: readonly Sheet[],
  rules: readonly MatchRule[],
): Sheet[] {
  let sheetsChanged = false;
  const next = sheets.map((sheet) => {
    let itemsChanged = false;
    const items = sheet.items.map((item) => {
      if (item.type !== "accountBudget") return item;
      const updated = reapplyPatternsToBudget(item, rules);
      if (updated !== item) itemsChanged = true;
      return updated;
    });
    if (!itemsChanged) return sheet;
    sheetsChanged = true;
    return { ...sheet, items };
  });
  return sheetsChanged ? (next as Sheet[]) : (sheets as Sheet[]);
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

// Fold a single walk over every unlocked budget row into a per-rule
// counter. The winning rule for each row is the first match in
// `rules`, mirroring the matcher's "earlier rules win" contract.
// Rows that no rule matches contribute to neither count.
export function countRuleHitsOnSheets(
  sheets: readonly Sheet[],
  rules: readonly MatchRule[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rule of rules) counts.set(rule.id, 0);
  if (rules.length === 0) return counts;
  for (const sheet of sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const descId = findColumnByType(item.columns, "description")?.id;
      if (descId === undefined) continue;
      const amountId = findColumnByType(item.columns, "amount")?.id;
      for (const row of item.rows) {
        if (row.typeIdLocked) continue;
        const desc = row.cells[descId];
        if (typeof desc !== "string" || desc.trim() === "") continue;
        const amount =
          amountId !== undefined && typeof row.cells[amountId] === "number"
            ? (row.cells[amountId] as number)
            : 0;
        const candidate = {
          description: desc,
          amount,
          isTransfer: row.isTransfer === true,
        };
        const winning = findMatchingRuleForCandidate(rules, candidate);
        if (!winning) continue;
        counts.set(winning.id, (counts.get(winning.id) ?? 0) + 1);
      }
    }
  }
  return counts;
}
