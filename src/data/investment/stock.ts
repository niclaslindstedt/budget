import { computeInvestmentNetValue } from "../tax/engine";
import type {
  StockOwnership,
  StockPosition,
  StockTransaction,
  TaxLocation,
} from "../types";
import type { InvestmentTaxTreatment } from "../tax/types";

// Derived state of a private stock position at a point in time. Shares
// held and the average cost are computed from the transaction log via
// the Swedish moving-average method (genomsnittsmetoden) — never stored —
// so they can't drift from the trades. The current price is the latest
// recorded price-per-share snapshot.
export type ResolvedStockPosition = {
  sharesHeld: number; // net shares owned (buys − sells)
  avgCost: number; // average acquisition cost per held share
  costBasis: number; // sharesHeld × avgCost — total basis of the holding
  pricePerShare: number | undefined; // latest recorded price, or undefined
  value: number | undefined; // sharesHeld × pricePerShare, or undefined
};

// Sort a transaction log oldest-first. A stable tiebreak on id keeps two
// trades on the same day in a deterministic order so the running average
// is reproducible.
function sortedTransactions(
  transactions: readonly StockTransaction[],
): StockTransaction[] {
  return [...transactions].sort((a, b) =>
    a.date < b.date
      ? -1
      : a.date > b.date
        ? 1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  );
}

// The latest recorded price-per-share on or before `iso`, or undefined
// when none has landed yet.
function priceAt(position: StockPosition, iso: string): number | undefined {
  let latest: { date: string; pricePerShare: number } | undefined;
  for (const point of position.priceHistory) {
    if (point.date > iso) continue;
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.pricePerShare;
}

// Walk the buys / sells up to and including `iso` with the
// genomsnittsmetoden: a buy blends its cost into the running average
// `(prevTotalCost + shares × price) / (prevShares + shares)`; a sell
// removes `shares × avgCost` from the total cost and leaves the average
// untouched (only the share count drops). Returns the share count and the
// average cost of the shares still held.
function holdingAt(
  position: StockPosition,
  iso: string,
): { sharesHeld: number; avgCost: number } {
  let shares = 0;
  let avgCost = 0;
  for (const tx of sortedTransactions(position.transactions)) {
    if (tx.date > iso) break;
    if (tx.shares > 0) {
      const prevTotalCost = shares * avgCost;
      const addedCost = tx.shares * tx.pricePerShare;
      shares += tx.shares;
      avgCost = shares > 0 ? (prevTotalCost + addedCost) / shares : 0;
    } else if (tx.shares < 0) {
      // A sell reduces the share count at the current average; the basis
      // per remaining share is unchanged. Clamp at zero so an over-sell
      // (more sold than held, e.g. a mis-entry) can't go negative.
      shares = Math.max(0, shares + tx.shares);
      if (shares === 0) avgCost = 0;
    }
  }
  return { sharesHeld: shares, avgCost };
}

// Resolve a position's derived state at `iso` (defaults to "latest"):
// shares held, average cost, cost basis, current price, and value.
export function resolveStockPosition(
  position: StockPosition,
  iso = "9999-12-31",
): ResolvedStockPosition {
  const { sharesHeld, avgCost } = holdingAt(position, iso);
  const pricePerShare = priceAt(position, iso);
  const value =
    pricePerShare === undefined ? undefined : sharesHeld * pricePerShare;
  return {
    sharesHeld,
    avgCost,
    costBasis: sharesHeld * avgCost,
    pricePerShare,
    value,
  };
}

// Which tax treatment a position's ownership maps to — private holdings
// pay the private capital-gains rate, company holdings the corporate rate.
export function stockTaxTreatment(
  ownership: StockOwnership,
): InvestmentTaxTreatment {
  return ownership === "company" ? "depot-company" : "depot-private";
}

// A position's net value if sold today — the market value less the gain
// tax for its ownership (30 % private, 20.6 % company on the profit over
// the cost basis). Undefined when no current value is known.
export function stockNetValue(
  position: StockPosition,
  resolved: ResolvedStockPosition,
  location: TaxLocation,
): number | undefined {
  if (resolved.value === undefined) return undefined;
  return computeInvestmentNetValue(location, {
    treatment: stockTaxTreatment(position.ownership),
    value: resolved.value,
    costBasis: resolved.costBasis,
  }).netValue;
}
