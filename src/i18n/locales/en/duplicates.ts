import type { Widen } from "./_widen";

// Cross-account duplicate finder (accounts page). Distinct from the
// budget-page `conflicts` namespace: duplicates span different accounts
// and are always bank history on both sides.
const duplicates = {
  title: "Find duplicates",
  intro:
    "Transactions imported into more than one account — the same date, bank description, and amount. Pick which account each one belongs to; the copies in the other accounts are deleted.",
  minAmountLabel: "Minimum amount",
  empty: "No duplicate imports found.",
  emptyHint: "Lower the minimum amount to widen the search.",
  countOne: "{n} duplicate",
  countOther: "{n} duplicates",
  ownerLabel: "Owner",
  suggestedBadge: "suggested",
  // Per-account balance verdicts, shown next to each copy.
  reconcilesBadge: "balance fits",
  reconcilesTitle: "This account's balance chain explains this transaction.",
  gapBadge: "balance gap",
  gapTitle:
    "This account's balance jumps here with no transaction to explain it — a likely wrong import.",
  noBalanceBadge: "no balance",
  noBalanceTitle: "This statement carried no running balance to check.",
  balanceLabel: "Balance",
  keepAll: "Keep all (not a duplicate)",
  resolve: "Resolve",
  resolveAria: "Delete the duplicate copies, keeping the chosen owner",
  acceptAll: "Accept all suggestions",
  acceptAllAria: "Resolve every duplicate using the suggested owner",
  resolvedOne: "Removed 1 duplicate entry.",
  resolvedOther: "Removed {n} duplicate entries.",
} as const;

export type DuplicatesCatalog = Widen<typeof duplicates>;

export default duplicates;
