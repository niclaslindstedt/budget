import type { Widen } from "./_widen";

// Cross-account duplicate finder (accounts page). Distinct from the
// budget-page `conflicts` namespace: duplicates span different accounts
// and are always bank history on both sides.
const duplicates = {
  title: "Find duplicates",
  intro:
    "Pick which account each transaction belongs to; the copies in the other accounts are deleted. Tap a row to see the surrounding bank history — a balance flagged in red doesn't sit on that account's running total.",
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
  balanceError: "This balance doesn't sit on the account's running total",
} as const;

export type DuplicatesCatalog = Widen<typeof duplicates>;

export default duplicates;
