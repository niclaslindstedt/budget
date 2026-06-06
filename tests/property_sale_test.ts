import { describe, expect, it } from "vitest";

import { computePropertySale } from "../src/data/tax/engine";
import { SE_CAPITAL_GAINS_TAX_RATE } from "../src/data/tax/se/property-sale";
import type { PropertySaleInputs } from "../src/data/types";

// A clean profit case: no broker, no advertising, no repairs.
const base: PropertySaleInputs = {
  sellPrice: 0,
  purchasePrice: 1_000_000,
  repairs: 0,
  advertisementCost: 0,
  broker: { mode: "none" },
};

describe("computePropertySale (SE)", () => {
  it("taxes a private-residence gain at 22% (keeps 78%)", () => {
    const r = computePropertySale("SE", { ...base, sellPrice: 2_000_000 });
    expect(r.taxableGain).toBe(1_000_000);
    expect(r.tax).toBeCloseTo(1_000_000 * SE_CAPITAL_GAINS_TAX_RATE, 5);
    // gain 1,000,000 → tax 220,000 → net 780,000.
    expect(r.tax).toBeCloseTo(220_000, 5);
    expect(r.netProfit).toBeCloseTo(780_000, 5);
  });

  it("does not tax a loss and reports a negative net profit", () => {
    const r = computePropertySale("SE", { ...base, sellPrice: 800_000 });
    expect(r.taxableGain).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.netProfit).toBe(-200_000); // sold below purchase, no tax
  });

  it("deducts a fixed broker fee from the taxed gain", () => {
    const r = computePropertySale("SE", {
      ...base,
      sellPrice: 2_000_000,
      broker: { mode: "fixed", amount: 100_000 },
    });
    expect(r.taxableGain).toBe(900_000);
    expect(r.netProfit).toBeCloseTo(900_000 * 0.78, 5);
  });

  it("applies a percentage broker fee on the sale price", () => {
    const r = computePropertySale("SE", {
      ...base,
      sellPrice: 2_000_000,
      broker: { mode: "percent", percent: 2.5 },
    });
    // 2.5% of 2,000,000 = 50,000 broker fee.
    expect(r.lineItems.find((it) => it.key === "broker")?.amount).toBe(50_000);
    expect(r.taxableGain).toBe(950_000);
  });

  it("applies a tiered broker fee only above the threshold", () => {
    const below = computePropertySale("SE", {
      ...base,
      sellPrice: 1_500_000,
      broker: {
        mode: "tiered",
        base: 20_000,
        threshold: 2_000_000,
        percent: 5,
      },
    });
    // Below the threshold: only the base fee applies.
    expect(below.lineItems.find((it) => it.key === "broker")?.amount).toBe(
      20_000,
    );

    const above = computePropertySale("SE", {
      ...base,
      sellPrice: 3_000_000,
      broker: {
        mode: "tiered",
        base: 20_000,
        threshold: 2_000_000,
        percent: 5,
      },
    });
    // base 20,000 + 5% of (3,000,000 − 2,000,000) = 20,000 + 50,000.
    expect(above.lineItems.find((it) => it.key === "broker")?.amount).toBe(
      70_000,
    );
  });

  it("deducts advertising and repairs from the gain", () => {
    const r = computePropertySale("SE", {
      ...base,
      sellPrice: 2_000_000,
      advertisementCost: 10_000,
      repairs: 90_000,
    });
    // gain = 2,000,000 − 10,000 − 90,000 − 1,000,000 = 900,000.
    expect(r.taxableGain).toBe(900_000);
  });
});
