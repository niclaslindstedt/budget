// The Investment sheet tracks investable assets the user holds. It has
// two distinct shapes, rendered as two tables on one page:
//
//   1. `InvestmentHolding` — a broad holdings catalog: a fund, a basket
//      of shares, gold, silver, crypto, a bond. The market value is
//      recorded by hand over time (exactly like a property's value).
//      The `wrapper` it's held in — ISK, KF, or a regular depå — decides
//      how it's taxed when sold, so it's first-class.
//   2. `StockPosition` — a privately-bought single stock, tracked at the
//      share level: buy/sell transactions over time (which drive the
//      share count and the average cost via the Swedish
//      genomsnittsmetoden), plus a hand-recorded current price per share.
//      `ownership` (private vs your company) decides the gain tax.
//
// Both live at the `UserData` level (like `Property` / `Saving`) so the
// workspace-wide Investment sheet renders the whole collection and the
// Insights net-worth roll-up can read them directly. The shapes are
// deliberately open for deferred follow-ups (auto-priced holdings via an
// API key, dividends): readers tolerate and writers preserve fields they
// don't recognise, so those land without a migration — exactly as
// `Property` / `Item` document.

import type { CategoryIcon } from "./categories";

// How a holding is wrapped for tax. Drives the "net value when sold"
// figure via the location's investment tax calculator:
//   - `isk` (Investeringssparkonto) / `kf` (Kapitalförsäkring) — taxed
//     yearly on a schablon, so a sale carries no capital-gains tax; net
//     value is the full market value.
//   - `depot` (a regular aktie-/fonddepå) — capital gains taxed on sale
//     (30 % for a private holder); net value subtracts that tax.
export type InvestmentWrapper = "isk" | "kf" | "depot";

// Broad asset class — presentational today (glyph + grouping), no tax
// effect. The wrapper, not the kind, decides tax.
export type InvestmentKind =
  | "stock"
  | "fund"
  | "bond"
  | "crypto"
  | "metal"
  | "other";

// One manually-entered snapshot of a holding's market value. "Update
// value" appends one of these; the current value is the latest point by
// date. Carries its own `id` (not keyed by `date`) so two snapshots on
// the same day can be edited / deleted independently. Mirrors
// `PropertyValuePoint`.
export type InvestmentValuePoint = {
  id: string;
  date: string; // ISO yyyy-mm-dd the value was recorded for
  value: number; // the market value at that date, in the user's currency
};

// A holding in the broad investments catalog. `purchaseAmount` /
// `purchaseDate` are the cost basis — folded into the value history as
// the first point (like a property's purchase) and used as the basis the
// depå net-value calc deducts the gain tax from. ISK / KF ignore the
// basis (no sale tax). All fields beyond `id` / `name` / `wrapper` are
// optional so a holding can be created with just a name and filled in
// later.
export type InvestmentHolding = {
  id: string;
  name: string;
  wrapper: InvestmentWrapper;
  kind?: InvestmentKind;
  glyph?: CategoryIcon;
  color?: string;
  purchaseAmount?: number; // cost basis; only depå uses it for net value
  purchaseDate?: string; // ISO yyyy-mm-dd the holding was acquired
  valueHistory: InvestmentValuePoint[];
};

// Who owns a private stock position. Decides the gain tax on the net
// value: `private` → the private capital-gains rate (30 % in SE),
// `company` → the corporate rate (20.6 % in SE) on the sale gain.
export type StockOwnership = "private" | "company";

// One buy or sell of a stock position. `shares` is signed: positive is a
// buy (adds shares, blends the average cost), negative is a sell (reduces
// shares, leaves the average cost unchanged — the genomsnittsmetoden).
// `pricePerShare` is the price each share traded at; for a sell it's
// recorded for the history but does not change the remaining basis.
export type StockTransaction = {
  id: string;
  date: string; // ISO yyyy-mm-dd the trade settled
  shares: number; // signed: > 0 buy, < 0 sell
  pricePerShare: number; // price per share at the trade, >= 0
};

// One manually-entered snapshot of a stock's current price per share.
// "Update price" appends one of these; the current price is the latest
// point by date. The update modal can derive it from a total value plus
// a share count, but only the per-share price is stored.
export type StockPricePoint = {
  id: string;
  date: string; // ISO yyyy-mm-dd the price was recorded for
  pricePerShare: number; // current market price for one share, >= 0
};

// A privately-bought single stock position, tracked at the share level.
// Shares held and average cost are derived from `transactions` (never
// stored), so the two can never drift; the current value is
// `sharesHeld × latest priceHistory point`.
export type StockPosition = {
  id: string;
  name: string; // company / ticker, e.g. "Volvo B"
  ownership: StockOwnership;
  glyph?: CategoryIcon;
  color?: string;
  transactions: StockTransaction[]; // buys / sells over time
  priceHistory: StockPricePoint[]; // hand-updated current price per share
};
