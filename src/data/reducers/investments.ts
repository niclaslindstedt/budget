import { mergeImportedPoints } from "../import/value-import";
import { newId } from "../sheet";
import { applyPatch } from "./patch";
import type { Action } from "../reducer";
import type { InvestmentHolding, StockPosition, UserData } from "../types";

// Rewrite one holding by id, leaving the rest of the array untouched.
function updateHoldingById(
  state: UserData,
  holdingId: string,
  fn: (holding: InvestmentHolding) => InvestmentHolding,
): UserData {
  return {
    ...state,
    investmentHoldings: state.investmentHoldings.map((h) =>
      h.id === holdingId ? fn(h) : h,
    ),
  };
}

// Rewrite one stock position by id, leaving the rest of the array
// untouched.
function updateStockById(
  state: UserData,
  positionId: string,
  fn: (position: StockPosition) => StockPosition,
): UserData {
  return {
    ...state,
    investmentStocks: state.investmentStocks.map((p) =>
      p.id === positionId ? fn(p) : p,
    ),
  };
}

// CRUD for the two Investment catalogs: `UserData.investmentHoldings`
// (broad holdings with a dated value history) and
// `UserData.investmentStocks` (privately-bought single stocks with a
// buy/sell transaction log and a dated price history). Both are entirely
// user-curated — no presets — so there's no preset-immutability guard
// here. Deleting either is a plain filter: a holding's value points and a
// position's transactions / price points nest under it, so dropping the
// parent drops them with it — no cross-collection cascade is needed (an
// investment isn't a transfer endpoint and has no `history` bucket).
export function reduceInvestments(
  state: UserData,
  action: Action,
): UserData | null {
  // Holdings -------------------------------------------------------------
  if (action.type === "addInvestmentHolding") {
    return {
      ...state,
      investmentHoldings: [...state.investmentHoldings, action.holding],
    };
  }
  if (action.type === "updateInvestmentHolding") {
    return updateHoldingById(state, action.holdingId, (h) =>
      applyPatch(h, action.patch),
    );
  }
  if (action.type === "deleteInvestmentHolding") {
    return {
      ...state,
      investmentHoldings: state.investmentHoldings.filter(
        (h) => h.id !== action.holdingId,
      ),
    };
  }
  if (action.type === "addInvestmentHoldingValue") {
    return updateHoldingById(state, action.holdingId, (h) => ({
      ...h,
      valueHistory: [...h.valueHistory, action.point],
    }));
  }
  if (action.type === "importInvestmentHoldingValues") {
    return updateHoldingById(state, action.holdingId, (h) => ({
      ...h,
      valueHistory: mergeImportedPoints(
        h.valueHistory,
        action.points,
        newId,
        (p) => ({ id: p.id, date: p.date, value: p.value }),
      ),
    }));
  }
  if (action.type === "deleteInvestmentHoldingValue") {
    return updateHoldingById(state, action.holdingId, (h) => ({
      ...h,
      valueHistory: h.valueHistory.filter((pt) => pt.id !== action.pointId),
    }));
  }

  // Stocks ---------------------------------------------------------------
  if (action.type === "addStockPosition") {
    return {
      ...state,
      investmentStocks: [...state.investmentStocks, action.position],
    };
  }
  if (action.type === "updateStockPosition") {
    return updateStockById(state, action.positionId, (p) =>
      applyPatch(p, action.patch),
    );
  }
  if (action.type === "deleteStockPosition") {
    return {
      ...state,
      investmentStocks: state.investmentStocks.filter(
        (p) => p.id !== action.positionId,
      ),
    };
  }
  if (action.type === "addStockTransaction") {
    return updateStockById(state, action.positionId, (p) => ({
      ...p,
      transactions: [...p.transactions, action.transaction],
    }));
  }
  if (action.type === "deleteStockTransaction") {
    return updateStockById(state, action.positionId, (p) => ({
      ...p,
      transactions: p.transactions.filter(
        (tx) => tx.id !== action.transactionId,
      ),
    }));
  }
  if (action.type === "addStockPrice") {
    return updateStockById(state, action.positionId, (p) => ({
      ...p,
      priceHistory: [...p.priceHistory, action.point],
    }));
  }
  if (action.type === "importStockPrices") {
    // The imported value maps onto `pricePerShare`; a price per share is a
    // magnitude, so clamp the sign defensively.
    return updateStockById(state, action.positionId, (p) => ({
      ...p,
      priceHistory: mergeImportedPoints(
        p.priceHistory.map((pt) => ({
          id: pt.id,
          date: pt.date,
          value: pt.pricePerShare,
        })),
        action.points,
        newId,
        (pt) => ({ id: pt.id, date: pt.date, value: pt.value }),
      ).map((pt) => ({
        id: pt.id,
        date: pt.date,
        pricePerShare: Math.abs(pt.value),
      })),
    }));
  }
  if (action.type === "deleteStockPrice") {
    return updateStockById(state, action.positionId, (p) => ({
      ...p,
      priceHistory: p.priceHistory.filter((pt) => pt.id !== action.pointId),
    }));
  }
  return null;
}
