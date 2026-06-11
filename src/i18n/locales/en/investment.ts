import type { Widen } from "./_widen";

// Investment sheet — the holdings catalog, the private-stocks table, and
// the value-visualization chart. Mirrors the savings / properties sheet
// namespaces.
const investment = {
  // Page chrome -----------------------------------------------------------
  holdingsTitle: "Holdings",
  stocksTitle: "Private stocks",
  visualizeValue: "Visualize value",
  addHolding: "Add holding",
  addStock: "Add stock",
  noHoldings: "No holdings yet.",
  noStocks: "No private stocks yet.",
  total: "Total",
  netTotal: "Net total",

  // Shared field labels ---------------------------------------------------
  name: "Name",
  namePlaceholder: "e.g. Global index fund",
  value: "Value",
  netValue: "Net value",
  edit: "Edit",
  delete: "Delete",

  // Wrapper (holding account type) ---------------------------------------
  wrapperLabel: "Account type",
  wrapperIsk: "ISK",
  wrapperKf: "KF",
  wrapperDepot: "Depå",
  wrapperIskHint: "Investeringssparkonto — no tax when sold",
  wrapperKfHint: "Kapitalförsäkring — no tax when sold",
  wrapperDepotHint: "Regular account — 30% tax on the gain when sold",

  // Asset kind ------------------------------------------------------------
  kindLabel: "Asset type",
  kindStock: "Stock",
  kindFund: "Fund",
  kindBond: "Bond",
  kindCrypto: "Crypto",
  kindMetal: "Precious metal",
  kindOther: "Other",

  // Holding card / modal --------------------------------------------------
  newHoldingTitle: "New holding",
  editHoldingTitle: "Edit holding",
  createHolding: "Add holding",
  purchaseAmountLabel: "Purchase amount",
  purchaseDateLabel: "Purchase date",
  updateValueAction: "Update value",
  deleteHoldingTitle: "Delete holding",
  deleteHoldingBody: "Delete {name}? This can't be undone.",

  // Update holding value modal -------------------------------------------
  updateValueTitle: "Update value",
  valueLabel: "Value",
  valuePlaceholder: "Current value",
  asOfLabel: "As of",
  valueHistory: "Recorded values",
  noValueHistory: "No values recorded yet.",
  purchaseValueTag: "Purchase",
  deleteValue: "Delete value",

  // Stock card ------------------------------------------------------------
  shares: "Shares",
  avgCost: "Avg cost",
  pricePerShare: "Price/share",
  costBasis: "Cost basis",
  updatePriceAction: "Update price",
  addTradeAction: "Buy / sell",
  deleteStockTitle: "Delete stock",
  deleteStockBody: "Delete {name}? This can't be undone.",

  // Ownership -------------------------------------------------------------
  ownershipLabel: "Owned by",
  ownershipPrivate: "Private",
  ownershipCompany: "Company",
  ownershipPrivateHint: "Held privately — 30% tax on the gain",
  ownershipCompanyHint: "Held by your company — 20.6% tax on the gain",

  // Stock modal -----------------------------------------------------------
  newStockTitle: "New stock",
  editStockTitle: "Edit stock",
  createStock: "Add stock",
  stockNamePlaceholder: "e.g. Volvo B",

  // Buy / sell modal ------------------------------------------------------
  tradeTitle: "Buy or sell",
  tradeKindLabel: "Action",
  buy: "Buy",
  sell: "Sell",
  sharesLabel: "Number of shares",
  priceLabel: "Price per share",
  tradeDateLabel: "Date",
  tradeHistory: "Trades",
  noTrades: "No trades recorded yet.",
  tradeBuy: "Bought {shares}",
  tradeSell: "Sold {shares}",
  deleteTrade: "Delete trade",

  // Update price modal ----------------------------------------------------
  updatePriceTitle: "Update price",
  priceModePerShare: "Price per share",
  priceModeTotal: "Total value ÷ shares",
  totalValueLabel: "Total value",
  shareCountLabel: "Number of shares",
  pricePlaceholder: "Current price",
  priceHistory: "Recorded prices",
  noPriceHistory: "No prices recorded yet.",
  deletePrice: "Delete price",

  // Visualize-value chart -------------------------------------------------
  valueChartTitle: "Portfolio value",
  valueChartValue: "Value",
  valueChartNetValue: "Net value",
  valueChartShowNetValue: "Show net value",
  valueChartShowNetValueHint: "What the portfolio is worth after tax if sold",
  valueChartEmpty: "Record at least two values to see a chart.",
} as const;

export type InvestmentCatalog = Widen<typeof investment>;

export default investment;
