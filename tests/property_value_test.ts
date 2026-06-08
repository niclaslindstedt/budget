import { describe, expect, it } from "vitest";

import {
  PURCHASE_VALUE_POINT_ID,
  currentPropertyValue,
  isPurchaseValuePoint,
  purchaseValuePoint,
  resolveValueHistory,
} from "../src/data/property-value/value";
import type { Property } from "../src/data/types";

function property(overrides: Partial<Property>): Property {
  return {
    id: "p1",
    name: "Cabin",
    valueHistory: [],
    mortgages: [],
    repairs: [],
    files: [],
    ...overrides,
  };
}

describe("purchaseValuePoint", () => {
  it("derives a value point from purchaseAmount at purchaseDate", () => {
    const point = purchaseValuePoint(
      property({ purchaseAmount: 2_950_000, purchaseDate: "2021-09-01" }),
    );
    expect(point).toEqual({
      id: PURCHASE_VALUE_POINT_ID,
      date: "2021-09-01",
      value: 2_950_000,
    });
    expect(isPurchaseValuePoint(point!)).toBe(true);
  });

  it("needs both amount and date to place a point on the timeline", () => {
    expect(purchaseValuePoint(property({ purchaseAmount: 100 }))).toBe(
      undefined,
    );
    expect(purchaseValuePoint(property({ purchaseDate: "2021-09-01" }))).toBe(
      undefined,
    );
  });
});

describe("resolveValueHistory", () => {
  it("folds the purchase in as the first value", () => {
    const history = resolveValueHistory(
      property({
        purchaseAmount: 2_950_000,
        purchaseDate: "2021-09-01",
        valueHistory: [{ id: "v1", date: "2024-01-01", value: 3_300_000 }],
      }),
    );
    expect(history).toEqual([
      { id: PURCHASE_VALUE_POINT_ID, date: "2021-09-01", value: 2_950_000 },
      { id: "v1", date: "2024-01-01", value: 3_300_000 },
    ]);
  });

  it("guarantees one value for a dated purchase with no snapshots", () => {
    const history = resolveValueHistory(
      property({ purchaseAmount: 2_950_000, purchaseDate: "2021-09-01" }),
    );
    expect(history).toHaveLength(1);
    expect(history[0].value).toBe(2_950_000);
  });

  it("does not duplicate a stored snapshot on the purchase date", () => {
    const stored = [{ id: "v1", date: "2021-09-01", value: 2_950_000 }];
    const history = resolveValueHistory(
      property({
        purchaseAmount: 2_950_000,
        purchaseDate: "2021-09-01",
        valueHistory: stored,
      }),
    );
    expect(history).toEqual(stored);
    expect(history.some(isPurchaseValuePoint)).toBe(false);
  });

  it("leaves a property without a dated purchase untouched", () => {
    const stored = [{ id: "v1", date: "2024-01-01", value: 100 }];
    expect(resolveValueHistory(property({ valueHistory: stored }))).toBe(
      stored,
    );
  });
});

describe("currentPropertyValue", () => {
  it("returns the latest value by date, purchase included", () => {
    expect(
      currentPropertyValue(
        property({
          purchaseAmount: 2_950_000,
          purchaseDate: "2021-09-01",
          valueHistory: [
            { id: "v1", date: "2024-01-01", value: 3_300_000 },
            { id: "v2", date: "2026-05-01", value: 3_180_000 },
          ],
        }),
      ),
    ).toBe(3_180_000);
  });

  it("falls back to the purchase price when it is the only value", () => {
    expect(
      currentPropertyValue(
        property({ purchaseAmount: 2_950_000, purchaseDate: "2021-09-01" }),
      ),
    ).toBe(2_950_000);
  });

  it("is undefined without snapshots or a dated purchase", () => {
    expect(currentPropertyValue(property({ purchaseAmount: 100 }))).toBe(
      undefined,
    );
    expect(currentPropertyValue(property({}))).toBe(undefined);
  });
});
