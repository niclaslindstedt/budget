// Wildcard match rules for synthesized history rows. Each rule
// carries a user-typed glob pattern and a set of labels (description /
// category / type) plus two filters (amount sign, transfer mode); when
// a `HistoryEntry` satisfies all three checks, the rule's labels
// overlay the entry's synthesized row at render time.
//
// Patterns are intentionally simple — `*` matches any run of
// characters (including empty), `?` matches exactly one character,
// everything else matches literally and case-insensitively, the
// pattern is implicitly anchored. The user gets a live preview in the
// modal so they can iterate without learning regex.

import type { HistoryEntry, MatchRule } from "./types";

// Escape every regex metacharacter, then translate the wildcards
// back: `*` → `.*` (any run, including empty) and `?` → `.` (exactly
// one char). The result is anchored with `^…$` so the whole
// description must match — substring matching is opt-in via leading
// and trailing stars in the user's pattern.
export function compilePattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\\\?/g, ".");
  return new RegExp(`^${body}$`, "i");
}

// Cache compiled regex per rule object. Keying on the rule object lets
// the reducer's normal immutability invalidate the cache automatically
// when the user edits a rule (a fresh rule object means a fresh
// compile).
const rulePatternCache = new WeakMap<MatchRule, RegExp | null>();

function regexForRule(rule: MatchRule): RegExp | null {
  const cached = rulePatternCache.get(rule);
  if (cached !== undefined) return cached;
  let compiled: RegExp | null;
  try {
    compiled = compilePattern(rule.pattern);
  } catch {
    compiled = null;
  }
  rulePatternCache.set(rule, compiled);
  return compiled;
}

// Minimum surface a candidate needs to be matched against a rule.
// Both `HistoryEntry` (where `isTransfer` is derived from the
// collapsed-into-transfer backref) and a synthesized projection of
// a plain budget row map onto this shape, so the matcher can score
// either kind without growing two near-identical code paths.
export type RuleCandidate = {
  description: string;
  amount: number;
  isTransfer: boolean;
};

export function candidateFromHistoryEntry(entry: HistoryEntry): RuleCandidate {
  return {
    description: entry.description,
    amount: entry.amount,
    isTransfer: entry.collapsedIntoTransferId !== undefined,
  };
}

// True when the candidate passes every filter on the rule. Bogus rules
// (empty pattern) never match — the modal blocks save on empty input
// but a hand-edited file could still smuggle one in.
export function ruleMatchesCandidate(
  rule: MatchRule,
  candidate: RuleCandidate,
): boolean {
  if (rule.pattern.length === 0) return false;
  const sign = rule.amountSign ?? "any";
  if (sign === "positive" && candidate.amount < 0) return false;
  if (sign === "negative" && candidate.amount > 0) return false;
  if (rule.amountMin !== undefined && candidate.amount < rule.amountMin) {
    return false;
  }
  if (rule.amountMax !== undefined && candidate.amount > rule.amountMax) {
    return false;
  }
  const transfer = rule.transferFilter ?? "any";
  if (transfer === "exclude" && candidate.isTransfer) return false;
  if (transfer === "only" && !candidate.isTransfer) return false;
  const re = regexForRule(rule);
  if (re === null) return false;
  return re.test(candidate.description);
}

// Backcompat wrapper kept so existing call sites (history rendering,
// the rule modal preview) don't have to project entries by hand.
export function ruleMatchesEntry(
  rule: MatchRule,
  entry: HistoryEntry,
): boolean {
  return ruleMatchesCandidate(rule, candidateFromHistoryEntry(entry));
}

// First rule that matches the candidate, or null. Order matters —
// rules earlier in the array win, so the user can layer specific
// rules on top of catch-alls by reordering. The Patterns settings
// tab exposes up/down buttons that swap a rule with its neighbour
// (see `moveMatchRule` in the reducer); fresh rules are appended at
// the end so they defer to whatever the user already set up.
export function findMatchingRuleForCandidate(
  rules: readonly MatchRule[],
  candidate: RuleCandidate,
): MatchRule | null {
  for (const rule of rules) {
    if (ruleMatchesCandidate(rule, candidate)) return rule;
  }
  return null;
}

export function findMatchingRule(
  rules: readonly MatchRule[],
  entry: HistoryEntry,
): MatchRule | null {
  return findMatchingRuleForCandidate(rules, candidateFromHistoryEntry(entry));
}
