import type { Widen } from "./_widen";

const applySeries = {
  title: "Apply to series?",
  titleApplyRecurring: "Apply to recurring entries?",
  justThis: "Just this entry",
  thisAndFuture: "This and future entries in the series",
  applyAllFollowing: "Apply to all following entries",
  promptBody:
    "{field} updated on this entry ({date}). Apply the same change to all following entries in this series?",
  noDate: "no date",
  stopAfterDate: "Stop after a date (temporary change)",
} as const;

export type ApplySeriesCatalog = Widen<typeof applySeries>;

export default applySeries;
