import { describe, expect, it } from "vitest";

import { swedishInvestmentCalculator } from "../src/data/tax/se/investment";
import { computeInvestmentNetValue } from "../src/data/tax/engine";
import {
  currentHoldingValue,
  holdingNetValue,
  resolveHoldingValueHistory,
} from "../src/data/investment/holdings";
import { resolveStockPosition } from "../src/data/investment/stock";
import { buildInvestmentTotalSeries } from "../src/data/investment/series";
import { computeNetWorthSnapshot } from "../src/data/insights/networth";
import { freshUserData } from "../src/storage/local";
import type { InvestmentHolding, StockPosition } from "../src/data/types";
import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";

const TODAY = "2026-06-11";

const settings = DEFAULT_SETTINGS;

describe("swedishInvestmentCalculator", () => {
  it("never taxes a sale inside an ISK or KF wrapper", () => {
    for (const treatment of ["isk", "kf"] as const) {
      const r = swedishInvestmentCalculator.computeNetValue({
        treatment,
        value: 200_000,
        costBasis: 50_000,
      });
      expect(r.tax).toBe(0);
      expect(r.taxableGain).toBe(0);
      expect(r.netValue).toBe(200_000);
    }
  });

  it("taxes a private depå gain at 30%", () => {
    const r = swedishInvestmentCalculator.computeNetValue({
      treatment: "depot-private",
      value: 200_000,
      costBasis: 50_000,
    });
    // gain 150k, tax 45k, net 155k
    expect(r.taxableGain).toBe(150_000);
    expect(r.tax).toBeCloseTo(45_000);
    expect(r.netValue).toBeCloseTo(155_000);
  });

  it("taxes a company depå gain at 20.6%", () => {
    const r = swedishInvestmentCalculator.computeNetValue({
      treatment: "depot-company",
      value: 200_000,
      costBasis: 50_000,
    });
    expect(r.tax).toBeCloseTo(150_000 * 0.206);
    expect(r.netValue).toBeCloseTo(200_000 - 150_000 * 0.206);
  });

  it("does not tax a loss", () => {
    const r = swedishInvestmentCalculator.computeNetValue({
      treatment: "depot-private",
      value: 40_000,
      costBasis: 50_000,
    });
    expect(r.taxableGain).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.netValue).toBe(40_000);
  });

  it("routes through the location registry", () => {
    expect(
      computeInvestmentNetValue("SE", {
        treatment: "depot-private",
        value: 100,
        costBasis: 0,
      }).tax,
    ).toBeCloseTo(30);
  });
});

function holding(over: Partial<InvestmentHolding> = {}): InvestmentHolding {
  return {
    id: "h1",
    name: "Fund",
    wrapper: "depot",
    purchaseAmount: 100_000,
    purchaseDate: "2022-01-01",
    valueHistory: [{ id: "v1", date: "2026-01-01", value: 160_000 }],
    ...over,
  };
}

describe("holdings", () => {
  it("folds the purchase in as the first value point", () => {
    const history = resolveHoldingValueHistory(holding());
    expect(history[0]).toMatchObject({ date: "2022-01-01", value: 100_000 });
    expect(currentHoldingValue(holding())).toBe(160_000);
  });

  it("ISK net value is the full value; depå subtracts the gain tax", () => {
    expect(holdingNetValue(holding({ wrapper: "isk" }), 160_000, "SE")).toBe(
      160_000,
    );
    // depå: gain 60k over the 100k basis, 30% = 18k tax
    expect(
      holdingNetValue(holding({ wrapper: "depot" }), 160_000, "SE"),
    ).toBeCloseTo(142_000);
  });
});

function position(over: Partial<StockPosition> = {}): StockPosition {
  return {
    id: "s1",
    name: "Volvo B",
    ownership: "private",
    transactions: [
      { id: "t1", date: "2022-03-15", shares: 100, pricePerShare: 100 },
      { id: "t2", date: "2023-08-01", shares: 100, pricePerShare: 200 },
      { id: "t3", date: "2025-02-10", shares: -50, pricePerShare: 250 },
    ],
    priceHistory: [{ id: "p1", date: "2026-05-01", pricePerShare: 300 }],
    ...over,
  };
}

describe("resolveStockPosition (genomsnittsmetoden)", () => {
  it("blends average cost on a buy and leaves it unchanged on a sell", () => {
    const r = resolveStockPosition(position());
    // 100@100 + 100@200 => 200 shares @ 150 avg; sell 50 => 150 shares @ 150
    expect(r.sharesHeld).toBe(150);
    expect(r.avgCost).toBeCloseTo(150);
    expect(r.costBasis).toBeCloseTo(150 * 150);
    expect(r.pricePerShare).toBe(300);
    expect(r.value).toBeCloseTo(150 * 300);
  });

  it("resolves state as-of an earlier date", () => {
    const r = resolveStockPosition(position(), "2022-12-31");
    expect(r.sharesHeld).toBe(100);
    expect(r.avgCost).toBeCloseTo(100);
    // no price recorded that early
    expect(r.value).toBeUndefined();
  });

  it("clamps an over-sell at zero shares", () => {
    const r = resolveStockPosition(
      position({
        transactions: [
          { id: "t1", date: "2022-01-01", shares: 10, pricePerShare: 100 },
          { id: "t2", date: "2022-02-01", shares: -50, pricePerShare: 100 },
        ],
      }),
    );
    expect(r.sharesHeld).toBe(0);
  });
});

describe("buildInvestmentTotalSeries", () => {
  it("sums holdings and stocks, gross vs net, and clips nothing by default", () => {
    const gross = buildInvestmentTotalSeries(
      [holding({ wrapper: "depot" })],
      [position()],
      settings,
      TODAY,
      { showNetValue: false },
    );
    const net = buildInvestmentTotalSeries(
      [holding({ wrapper: "depot" })],
      [position()],
      settings,
      TODAY,
      { showNetValue: true },
    );
    expect(gross.length).toBeGreaterThan(1);
    const lastGross = gross[gross.length - 1].y;
    const lastNet = net[net.length - 1].y;
    // depå holding 160k + position 150*300=45k => 205k gross
    expect(lastGross).toBeCloseTo(160_000 + 45_000);
    // net is lower (gains taxed)
    expect(lastNet).toBeLessThan(lastGross);
  });
});

describe("net worth includes investments", () => {
  it("adds holding + stock gross value to the investments category", () => {
    const data = {
      ...freshUserData(),
      investmentHoldings: [holding({ wrapper: "isk" })],
      investmentStocks: [position()],
    };
    const snap = computeNetWorthSnapshot(data, undefined, TODAY);
    expect(snap.perCategory.investments).toBeCloseTo(160_000 + 45_000);
    expect(snap.total).toBeCloseTo(160_000 + 45_000);
    expect(snap.entities.some((e) => e.category === "investments")).toBe(true);
  });
});
