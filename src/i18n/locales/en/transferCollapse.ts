import type { Widen } from "./_widen";

const transferCollapse = {
  title: "Cross-account transfers",
  hint: "Mirror pairs found in your imported history. Collapse merges them into a single transfer transaction and hides both source entries; Skip leaves the pair untouched for this session; Never hides the pair from future scans.",
  noMatches:
    "No matching pairs found in your imported history. A pair must have the same magnitude, opposite signs, and dates within three days.",
  allSkipped:
    "Every detected pair has been skipped in this session. Close the dialog to dismiss it.",
  collapsedDone:
    "Done — the matching pairs were collapsed into transfers. The two bank entries behind each one are now hidden under a single transfer.",
  pairsPending: "{n} pair pending",
  pairsPendingPlural: "{n} pairs pending",
  confident: "{n}% confident",
  unknownAccount: "Unknown account",
  collapseAll: "Collapse all",
  collapse: "Collapse",
  skip: "Skip",
  never: "Never",
  skipAll: "Dismiss all",
  none: "No transfer pairs right now.",
} as const;

export type TransferCollapseCatalog = Widen<typeof transferCollapse>;

export default transferCollapse;
