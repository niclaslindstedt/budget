import type { Widen } from "./_widen";

const insightsSheet = {
  // Net worth mode.
  netWorthTitle: "Net worth",
  netWorthSeries: "Net worth",
  breakdownTitle: "Breakdown",
  chartTitle: "Over time",
  chartEmpty: "Not enough dated data to chart yet.",
  chartNoneInRange: "No data in this range. Pick a longer one.",
  chartAllHidden: "No bands selected. Tick one to chart it.",
  noData:
    "Nothing to sum up yet. Add accounts, savings, items, properties, or loans and they all roll up here.",

  // Category rows in the breakdown / bands in the chart. The chart folds a
  // property's mortgages into its own net-equity band (`categoryPropertiesNet`)
  // so the two figures that dwarf everything else move as one toggle;
  // `categoryProperties` is the settings-modal section header, which still
  // lists properties on their own.
  categoryAccounts: "Accounts",
  categorySavings: "Savings",
  categoryItems: "Items",
  categoryInvestments: "Investments",
  categoryCars: "Cars",
  categoryProperties: "Properties",
  categoryPropertiesNet: "Properties & mortgages",
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
