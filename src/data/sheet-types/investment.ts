import { INVESTMENT_GLYPH_NAMES } from "../constants/taxonomy";
import { newId } from "../sheet";
import type { InvestmentView } from "../types";
import { validateInvestmentView } from "../validate/sheet-items";

import type { SheetTypeDescriptor } from "./index";

// The Investment sheet renders the workspace-wide
// `UserData.investmentHoldings` (broad holdings) and
// `UserData.investmentStocks` (private single stocks) collections rather
// than a per-account ledger, so the item carries no data of its own today
// — the shape exists so future per-sheet config (sort order,
// group-by-wrapper toggle, …) lands here without another migration.
// Mirrors `properties.ts`.
export function createDefaultInvestmentView(): InvestmentView {
  return { id: newId(), type: "investmentView" };
}

export const INVESTMENT_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "investment",
  label: "Investments",
  description: "Track stocks, funds, and other investments and their value.",
  glyph: "trending-up",
  glyphNames: INVESTMENT_GLYPH_NAMES,
  createDefaultItem: () => createDefaultInvestmentView(),
  itemTypes: ["investmentView"],
  validate: (raw, path) => validateInvestmentView(raw, path),
  // No `reduceItem`: the investment catalogs are global state mutated by
  // the `addInvestmentHolding` / `addStockPosition` / … actions in
  // `reducers/investments.ts`, not per-item actions routed through the
  // registry tail. And no `rowsForItem`: the catalogs aren't row-shaped.
};
