import type { InvestmentCatalog } from "../en/investment";

const investment: InvestmentCatalog = {
  // Page chrome -----------------------------------------------------------
  holdingsTitle: "Innehav",
  stocksTitle: "Privata aktier",
  visualizeValue: "Visualisera värde",
  addHolding: "Lägg till innehav",
  addStock: "Lägg till aktie",
  noHoldings: "Inga innehav ännu.",
  noStocks: "Inga privata aktier ännu.",
  total: "Totalt",
  netTotal: "Netto totalt",

  // Shared field labels ---------------------------------------------------
  name: "Namn",
  namePlaceholder: "t.ex. Global indexfond",
  value: "Värde",
  netValue: "Nettovärde",
  edit: "Redigera",
  delete: "Ta bort",

  // Wrapper (holding account type) ---------------------------------------
  wrapperLabel: "Kontotyp",
  wrapperIsk: "ISK",
  wrapperKf: "KF",
  wrapperDepot: "Depå",
  wrapperIskHint: "Investeringssparkonto — ingen skatt vid försäljning",
  wrapperKfHint: "Kapitalförsäkring — ingen skatt vid försäljning",
  wrapperDepotHint: "Vanligt konto — 30 % skatt på vinsten vid försäljning",

  // Asset kind ------------------------------------------------------------
  kindLabel: "Tillgångstyp",
  kindStock: "Aktie",
  kindFund: "Fond",
  kindBond: "Obligation",
  kindCrypto: "Krypto",
  kindMetal: "Ädelmetall",
  kindOther: "Övrigt",

  // Holding card / modal --------------------------------------------------
  newHoldingTitle: "Nytt innehav",
  editHoldingTitle: "Redigera innehav",
  createHolding: "Lägg till innehav",
  purchaseAmountLabel: "Inköpsbelopp",
  purchaseDateLabel: "Inköpsdatum",
  updateValueAction: "Uppdatera värde",
  deleteHoldingTitle: "Ta bort innehav",
  deleteHoldingBody: "Ta bort {name}? Detta kan inte ångras.",

  // Update holding value modal -------------------------------------------
  updateValueTitle: "Uppdatera värde",
  valueLabel: "Värde",
  valuePlaceholder: "Nuvarande värde",
  asOfLabel: "Per",
  valueHistory: "Registrerade värden",
  noValueHistory: "Inga värden registrerade ännu.",
  purchaseValueTag: "Köp",
  deleteValue: "Ta bort värde",

  // Stock card ------------------------------------------------------------
  shares: "Antal",
  avgCost: "Snittkostnad",
  pricePerShare: "Pris/aktie",
  costBasis: "Anskaffningsvärde",
  updatePriceAction: "Uppdatera pris",
  addTradeAction: "Köp / sälj",
  deleteStockTitle: "Ta bort aktie",
  deleteStockBody: "Ta bort {name}? Detta kan inte ångras.",

  // Ownership -------------------------------------------------------------
  ownershipLabel: "Ägs av",
  ownershipPrivate: "Privat",
  ownershipCompany: "Företag",
  ownershipPrivateHint: "Ägs privat — 30 % skatt på vinsten",
  ownershipCompanyHint: "Ägs av ditt företag — 20,6 % skatt på vinsten",

  // Stock modal -----------------------------------------------------------
  newStockTitle: "Ny aktie",
  editStockTitle: "Redigera aktie",
  createStock: "Lägg till aktie",
  stockNamePlaceholder: "t.ex. Volvo B",

  // Buy / sell modal ------------------------------------------------------
  tradeTitle: "Köp eller sälj",
  tradeKindLabel: "Åtgärd",
  buy: "Köp",
  sell: "Sälj",
  sharesLabel: "Antal aktier",
  priceLabel: "Pris per aktie",
  tradeDateLabel: "Datum",
  tradeHistory: "Transaktioner",
  noTrades: "Inga transaktioner registrerade ännu.",
  tradeBuy: "Köpte {shares}",
  tradeSell: "Sålde {shares}",
  deleteTrade: "Ta bort transaktion",

  // Update price modal ----------------------------------------------------
  updatePriceTitle: "Uppdatera pris",
  priceModePerShare: "Pris per aktie",
  priceModeTotal: "Totalt värde ÷ antal",
  totalValueLabel: "Totalt värde",
  shareCountLabel: "Antal aktier",
  pricePlaceholder: "Nuvarande pris",
  priceHistory: "Registrerade priser",
  noPriceHistory: "Inga priser registrerade ännu.",
  deletePrice: "Ta bort pris",

  // Visualize-value chart -------------------------------------------------
  valueChartTitle: "Portföljvärde",
  valueChartValue: "Värde",
  valueChartNetValue: "Nettovärde",
  valueChartShowNetValue: "Visa nettovärde",
  valueChartShowNetValueHint:
    "Vad portföljen är värd efter skatt vid försäljning",
  valueChartEmpty: "Registrera minst två värden för att se en graf.",
};

export default investment;
