import { describe, expect, it } from "vitest";

import { computeItemCurrentValue, isItemOwned } from "../src/data/items/value";
import type { Item } from "../src/data/types";

function item(overrides: Partial<Item>): Item {
  return { id: "i1", name: "Thing", ...overrides };
}

describe("computeItemCurrentValue", () => {
  it("returns 0 for an item with no value information", () => {
    expect(computeItemCurrentValue(item({}), "2026-01-01")).toBe(0);
  });

  it("returns the purchase price when nothing decays it", () => {
    expect(
      computeItemCurrentValue(item({ purchasePrice: 1000 }), "2026-01-01"),
    ).toBe(1000);
  });

  it("lets a manual resale value win over the purchase price", () => {
    expect(
      computeItemCurrentValue(
        item({ purchasePrice: 1000, resaleValue: 400 }),
        "2026-01-01",
      ),
    ).toBe(400);
  });

  it("applies declining-balance depreciation from the acquired date", () => {
    const value = computeItemCurrentValue(
      item({
        purchasePrice: 1000,
        acquiredAt: "2025-01-01",
        depreciation: { method: "percentPerYear", ratePerYear: 20 },
      }),
      "2026-01-01",
    );
    // ~One year at 20 %/yr → ≈800 (a 365-day span is a hair under one
    // 365.25-day year, so the value lands just above 800).
    expect(value).toBeGreaterThan(795);
    expect(value).toBeLessThan(801);
  });

  it("never depreciates below the floor", () => {
    const value = computeItemCurrentValue(
      item({
        purchasePrice: 1000,
        acquiredAt: "2000-01-01",
        depreciation: { method: "percentPerYear", ratePerYear: 50, floor: 100 },
      }),
      "2026-01-01",
    );
    expect(value).toBe(100);
  });

  it("counts a disposed item as its sale proceeds, ignoring decay", () => {
    expect(
      computeItemCurrentValue(
        item({ purchasePrice: 1000, soldFor: 250, disposedAt: "2026-01-01" }),
        "2026-06-01",
      ),
    ).toBe(250);
  });

  it("treats a give-away (disposed, no proceeds) as 0", () => {
    expect(
      computeItemCurrentValue(
        item({ purchasePrice: 1000, disposedAt: "2026-01-01" }),
        "2026-06-01",
      ),
    ).toBe(0);
  });
});

describe("isItemOwned", () => {
  it("is true for an item that has not been disposed", () => {
    expect(isItemOwned(item({ purchasePrice: 1000 }))).toBe(true);
  });

  it("is false once the item is disposed", () => {
    expect(isItemOwned(item({ disposedAt: "2026-01-01" }))).toBe(false);
    expect(isItemOwned(item({ soldFor: 0 }))).toBe(false);
  });
});
