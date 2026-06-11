import type { Widen } from "./_widen";

const insightsSheet = {
  // Net worth mode.
  netWorthTitle: "Net worth",
  netWorthSeries: "Net worth",
  breakdownTitle: "Breakdown",
  chartTitle: "Over time",
  chartEmpty: "Not enough dated data to chart yet.",
  noData:
    "Nothing to sum up yet. Add accounts, savings, items, properties, or loans and they all roll up here.",

  // Category rows in the breakdown. Mortgages are listed apart from the
  // other loans because they ride with their property's share setting.
  categoryAccounts: "Accounts",
  categorySavings: "Savings",
  categoryItems: "Items",
  categoryProperties: "Properties",
  categoryMortgages: "Mortgages",
  categoryLoans: "Other loans",

  // Net-worth settings modal.
  settingsAction: "Net worth settings",
  settingsTitle: "Net worth settings",
  settingsIntro:
    "Choose what counts toward your net worth. Set an ownership share for anything you don't own alone — a co-owned home, an account shared with a spouse. A property's share applies to its mortgages too.",
  includeAria: "Include {name}",
  shareLabel: "Share",
  shareAria: "Ownership share for {name}, in percent",
  linkedLoansNote:
    "Loans linked to a property's mortgage follow that property's setting and aren't listed here.",
  propertyMortgages: "mortgages {amount}",
} as const;

export type InsightsSheetCatalog = Widen<typeof insightsSheet>;

export default insightsSheet;
