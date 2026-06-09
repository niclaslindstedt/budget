import type { Widen } from "./_widen";

const presetCategories = {
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  health: "Health",
  bills: "Bills",
  subscriptions: "Subscriptions",
  entertainment: "Entertainment",
  savings: "Savings",
  loans: "Loans",
  income: "Income",
  family: "Family",
  personal: "Personal",
  consumption: "Consumption",
  travel: "Travel",
  other: "Other",
  unknown: "Unknown",
} as const;

export type PresetCategoriesCatalog = Widen<typeof presetCategories>;

export default presetCategories;
