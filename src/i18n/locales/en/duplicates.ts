import type { Widen } from "./_widen";

// Cross-account duplicate finder (accounts page). Distinct from the
// budget-page `conflicts` namespace: duplicates span different accounts
// and are always bank history on both sides.
const duplicates = {
  title: "Find duplicates",
  intro:
    "Transactions imported into more than one account with the same date, bank description, amount, and running balance — the fingerprint of a statement imported into the wrong account. Pick which account each one belongs to; the copies in the other accounts are deleted. Tap a row to see the surrounding bank history and check the balances line up.",
  empty: "No duplicate imports found.",
  emptyHint: "Every imported transaction lives in just one account.",
  countOne: "{n} duplicate",
  countOther: "{n} duplicates",
  ownerLabel: "Owner",
  keepAll: "Keep all (not a duplicate)",
  resolve: "Resolve",
  resolveAria: "Delete the duplicate copies, keeping the chosen owner",
  acceptAll: "Accept all",
  acceptAllAria: "Resolve every duplicate using the suggested owner",
  resolvedOne: "Removed 1 duplicate entry.",
  resolvedOther: "Removed {n} duplicate entries.",
  ignore: "Ignore",
  ignoreAria: "Never flag this charge as a duplicate again",
  ignored: "Ignored. This charge won't be flagged as a duplicate again.",
  showContextAria: "Show the surrounding bank history",
  hideContextAria: "Hide the surrounding bank history",
  contextNone: "No surrounding history on this account.",
  contextThisEntry: "this transaction",
} as const;

export type DuplicatesCatalog = Widen<typeof duplicates>;

export default duplicates;
