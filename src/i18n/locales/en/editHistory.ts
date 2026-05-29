import type { Widen } from "./_widen";

const editHistory = {
  title: "Edit history entry",
  description: "Description",
  descriptionPlaceholder: "Override the bank's description",
  type: "Type",
  company: "Company",
  tags: "Tags",
  originalDescription: "Original from bank",
  hint:
    "Renames just this one entry. The bank's record stays untouched " +
    "for reference. To relabel every entry with the same description, " +
    "use the pattern button instead.",
  primaryIncomeTitle: "Primary income",
  primaryIncomeToggle: "Mark this merchant as primary income",
  primaryIncomeHelp:
    "Bank entries with this exact description (now and in future imports) get pushed into the next fiscal month when they land before the real payday. A job change just means adding the new bank's pattern alongside — the old one keeps tagging history.",
  primaryIncomeAnchorDay: "Real payday (day of month)",
} as const;

export type EditHistoryCatalog = Widen<typeof editHistory>;

export default editHistory;
