import type { Widen } from "./_widen";

const editHistory = {
  title: "Edit history entry",
  description: "Description",
  descriptionPlaceholder: "Override the bank's description",
  type: "Type",
  company: "Company",
  originalDescription: "Original from bank",
  hint:
    "Renames just this one entry. The bank's record stays untouched " +
    "for reference. To relabel every entry with the same description, " +
    "use the pattern button instead.",
} as const;

export type EditHistoryCatalog = Widen<typeof editHistory>;

export default editHistory;
