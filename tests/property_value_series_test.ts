import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";
import { buildPropertyValueSeries } from "../src/data/property-value/series";
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

const opts = (
  o: Partial<{ includeRepairs: boolean; showNetValue: boolean }>,
) => ({
  includeRepairs: false,
  showNetValue: false,
  ...o,
});

describe("buildPropertyValueSeries", () => {
  it("returns an empty line for an empty property", () => {
    const series = buildPropertyValueSeries(
      property({}),
      DEFAULT_SETTINGS,
      opts({}),
    );
    expect(series).toEqual([]);
  });

  it("sorts the value line by date ascending", () => {
    const series = buildPropertyValueSeries(
      property({
        valueHistory: [
          { id: "b", date: "2024-06-01", value: 1_000_000 },
          { id: "a", date: "2024-01-01", value: 900_000 },
        ],
      }),
      DEFAULT_SETTINGS,
      opts({}),
    );
    expect(series.map((p) => p.y)).toEqual([900_000, 1_000_000]);
    expect(series[0].x).toBeLessThan(series[1].x);
  });

  it("raises the line by cumulative repair spend when includeRepairs is on", () => {
    const series = buildPropertyValueSeries(
      property({
        valueHistory: [
          { id: "a", date: "2024-01-01", value: 900_000 },
          { id: "b", date: "2024-06-01", value: 1_000_000 },
        ],
        // One repair before the second snapshot, one after the last — the
        // later repair never enters either snapshot's cumulative sum.
        repairs: [
          {
            id: "r1",
            date: "2024-03-01",
            amount: 50_000,
            description: "Roof",
            typeId: "preset-type-repairs",
          },
          {
            id: "r2",
            date: "2024-12-01",
            amount: 20_000,
            description: "Paint",
            typeId: "preset-type-renovations",
          },
        ],
      }),
      DEFAULT_SETTINGS,
      opts({ includeRepairs: true }),
    );
    // Jan: no repairs yet → unchanged. Jun: +50 000 from the March repair.
    expect(series.map((p) => p.y)).toEqual([900_000, 1_050_000]);
  });

  it("turns the line into full net profit per snapshot when showNetValue is on", () => {
    const series = buildPropertyValueSeries(
      property({
        purchaseAmount: 800_000,
        valueHistory: [
          { id: "a", date: "2024-01-01", value: 900_000 },
          { id: "b", date: "2024-06-01", value: 1_000_000 },
        ],
        repairs: [
          {
            id: "r1",
            date: "2024-03-01",
            amount: 50_000,
            description: "Roof",
            typeId: "preset-type-repairs",
          },
        ],
      }),
      DEFAULT_SETTINGS,
      opts({ showNetValue: true }),
    );
    // SE: net = gain − 22% tax, gain = sell − repairs − purchase (no broker/ad).
    // Jan: gain = 900k − 0 − 800k = 100k → net = 100k − 22k = 78 000.
    // Jun: gain = 1 000k − 50k − 800k = 150k → net = 150k − 33k = 117 000.
    expect(series.map((p) => p.y)).toEqual([78_000, 117_000]);
  });

  it("adds repairs back on top of net profit when both toggles are on", () => {
    const series = buildPropertyValueSeries(
      property({
        purchaseAmount: 800_000,
        valueHistory: [
          { id: "a", date: "2024-01-01", value: 900_000 },
          { id: "b", date: "2024-06-01", value: 1_000_000 },
        ],
        repairs: [
          {
            id: "r1",
            date: "2024-03-01",
            amount: 50_000,
            description: "Roof",
            typeId: "preset-type-repairs",
          },
        ],
      }),
      DEFAULT_SETTINGS,
      opts({ includeRepairs: true, showNetValue: true }),
    );
    // Net profit (above) plus the cumulative repair spend added back on top.
    // Jan: 78 000 + 0 = 78 000. Jun: 117 000 + 50 000 = 167 000.
    expect(series.map((p) => p.y)).toEqual([78_000, 167_000]);
  });

  it("skips snapshots with a malformed date", () => {
    const series = buildPropertyValueSeries(
      property({
        valueHistory: [
          { id: "a", date: "not-a-date", value: 1 },
          { id: "b", date: "2024-01-01", value: 900_000 },
        ],
      }),
      DEFAULT_SETTINGS,
      opts({}),
    );
    expect(series).toHaveLength(1);
    expect(series[0].y).toBe(900_000);
  });
});
