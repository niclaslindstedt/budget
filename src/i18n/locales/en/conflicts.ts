import type { Widen } from "./_widen";

const conflicts = {
  title: "Find conflicts",
  intro:
    "Same-day pairs in the same category with amounts within 5% of each other. Smaller sums and the Food category are skipped.",
  minAmountLabel: "Minimum amount",
  minAmountHint: "Hide pairs smaller than this.",
  empty: "No conflicts found.",
  emptyHint: "Lower the minimum amount to widen the search.",
  foodExcludedHint: "Food-category entries are excluded from this scan.",
  winnerBadge: "keep",
  historyBadge: "bank",
  untypedLabel: "(no type)",
  uncategorizedLabel: "(no category)",
  merge: "Merge",
  mergeAria: "Merge {n} duplicates",
  mergedOne: "Merged 1 duplicate.",
  mergedOther: "Merged {n} duplicates.",
  countOne: "{n} conflict",
  countOther: "{n} conflicts",
} as const;

export type ConflictsCatalog = Widen<typeof conflicts>;

export default conflicts;
