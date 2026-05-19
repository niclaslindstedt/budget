// Wildcard match rules for synthesized history rows. Each rule
// carries a user-typed glob pattern and a set of labels (description /
// category / type) plus two filters (amount sign, transfer mode); when
// a `HistoryEntry` satisfies all three checks, the rule's labels
// overlay the entry's synthesized row at render time.
//
// Patterns are intentionally simple — `*` matches any run of
// characters (including empty), everything else matches literally and
// case-insensitively, the pattern is implicitly anchored. The user
// gets a live preview in the modal so they can iterate without
// learning regex.

import type { HistoryEntry, MatchRule } from "./types";

// Escape every regex metacharacter except `*`, then replace `*` with
// `.*`. The result is anchored with `^…$` so the whole description
// must match — substring matching is opt-in via leading/trailing
// stars in the user's pattern.
export function compilePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${body}$`, "i");
}

// True when the entry passes every filter on the rule. Bogus rules
// (empty pattern) never match — the modal blocks save on empty input
// but a hand-edited file could still smuggle one in.
export function ruleMatchesEntry(
  rule: MatchRule,
  entry: HistoryEntry,
): boolean {
  if (rule.pattern.length === 0) return false;
  const sign = rule.amountSign ?? "any";
  if (sign === "positive" && entry.amount < 0) return false;
  if (sign === "negative" && entry.amount > 0) return false;
  if (rule.amountMin !== undefined && entry.amount < rule.amountMin) {
    return false;
  }
  if (rule.amountMax !== undefined && entry.amount > rule.amountMax) {
    return false;
  }
  const transfer = rule.transferFilter ?? "any";
  const isTransfer = entry.collapsedIntoTransactionId !== undefined;
  if (transfer === "exclude" && isTransfer) return false;
  if (transfer === "only" && !isTransfer) return false;
  let re: RegExp;
  try {
    re = compilePattern(rule.pattern);
  } catch {
    return false;
  }
  return re.test(entry.description);
}

// First rule that matches the entry, or null. Order matters — rules
// earlier in the array win, so the user can layer specific rules on
// top of catch-alls by reordering. Today the modal appends new rules;
// reordering UI lives in a future settings panel.
export function findMatchingRule(
  rules: readonly MatchRule[],
  entry: HistoryEntry,
): MatchRule | null {
  for (const rule of rules) {
    if (ruleMatchesEntry(rule, entry)) return rule;
  }
  return null;
}
