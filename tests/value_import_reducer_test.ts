import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import type { ImportedPoint } from "../src/data/import/value-import";
import type { Saving, StockPosition, UserData } from "../src/data/types";
import { freshUserData } from "../src/storage/local";

// End-to-end wiring check for the bulk file-import actions: the modal hands
// the reducer a list of `{ date, value }` points and each entity merges
// them one-per-date into its own history array. Covers the two interesting
// cases — a balance history that allows the import verbatim (savings) and
// the stock price history where the imported value maps onto
// `pricePerShare`.

function withSaving(saving: Saving): UserData {
  return { ...freshUserData(), savings: [saving] };
}

function withStock(position: StockPosition): UserData {
  return { ...freshUserData(), investmentStocks: [position] };
}

describe("importSavingBalances", () => {
  it("merges imported balances one-per-date, reusing the existing id", () => {
    const state = withSaving({
      id: "s1",
      kind: "savings",
      name: "Buffer",
      balanceHistory: [{ id: "old", date: "2024-02-01", value: 20 }],
    });
    const points: ImportedPoint[] = [
      { date: "2024-01-01", value: 10 },
      { date: "2024-02-01", value: 99 },
    ];
    const next = reducer(state, {
      type: "importSavingBalances",
      savingId: "s1",
      points,
    });
    const history = next.savings[0].balanceHistory;
    expect(history).toContainEqual({
      id: "old",
      date: "2024-02-01",
      value: 99,
    });
    expect(history).toHaveLength(2);
  });
});

describe("importStockPrices", () => {
  it("maps the imported value onto pricePerShare", () => {
    const state = withStock({
      id: "p1",
      name: "ACME",
      transactions: [],
      priceHistory: [],
    });
    const next = reducer(state, {
      type: "importStockPrices",
      positionId: "p1",
      points: [{ date: "2024-01-01", value: 150.5 }],
    });
    expect(next.investmentStocks[0].priceHistory).toEqual([
      { id: expect.any(String), date: "2024-01-01", pricePerShare: 150.5 },
    ]);
  });
});
