import { describe, expect, it } from "vitest";

import { buildSavingsTotalSeries } from "../src/data/savings/series";
import type { Saving, SavingBalancePoint } from "../src/data/types";

function saving(id: string, points: { date: string; value: number }[]): Saving {
  const balanceHistory: SavingBalancePoint[] = points.map((p, i) => ({
    id: `${id}-${i}`,
    date: p.date,
    value: p.value,
  }));
  return { id, kind: "savings", name: id, balanceHistory };
}

const ms = (iso: string) => Date.parse(iso);

describe("buildSavingsTotalSeries", () => {
  it("returns an empty line when nothing is selected", () => {
    const s = saving("a", [{ date: "2026-01-01", value: 100 }]);
    expect(buildSavingsTotalSeries([s], [])).toEqual([]);
  });

  it("returns an empty line when selected accounts have no history", () => {
    const s = saving("a", []);
    expect(buildSavingsTotalSeries([s], ["a"])).toEqual([]);
  });

  it("charts a single account's snapshots in date order", () => {
    const s = saving("a", [
      { date: "2026-03-01", value: 300 },
      { date: "2026-01-01", value: 100 },
    ]);
    expect(buildSavingsTotalSeries([s], ["a"])).toEqual([
      { x: ms("2026-01-01"), y: 100 },
      { x: ms("2026-03-01"), y: 300 },
    ]);
  });

  it("sums selected accounts, carrying the last balance forward", () => {
    const a = saving("a", [
      { date: "2026-01-01", value: 100 },
      { date: "2026-03-01", value: 150 },
    ]);
    const b = saving("b", [{ date: "2026-02-01", value: 50 }]);
    // Union of dates: Jan (a only), Feb (a carried + b), Mar (a + b carried).
    expect(buildSavingsTotalSeries([a, b], ["a", "b"])).toEqual([
      { x: ms("2026-01-01"), y: 100 },
      { x: ms("2026-02-01"), y: 150 },
      { x: ms("2026-03-01"), y: 200 },
    ]);
  });

  it("contributes 0 for an account before its first snapshot", () => {
    const a = saving("a", [{ date: "2026-01-01", value: 100 }]);
    const b = saving("b", [{ date: "2026-02-01", value: 40 }]);
    const series = buildSavingsTotalSeries([a, b], ["a", "b"]);
    // At Jan, b hasn't started yet, so the total is a's 100 only.
    expect(series[0]).toEqual({ x: ms("2026-01-01"), y: 100 });
  });

  it("excludes accounts that aren't selected", () => {
    const a = saving("a", [{ date: "2026-01-01", value: 100 }]);
    const b = saving("b", [{ date: "2026-01-01", value: 999 }]);
    expect(buildSavingsTotalSeries([a, b], ["a"])).toEqual([
      { x: ms("2026-01-01"), y: 100 },
    ]);
  });

  it("skips malformed dates rather than charting NaN", () => {
    const a = saving("a", [
      { date: "not-a-date", value: 100 },
      { date: "2026-01-01", value: 200 },
    ]);
    expect(buildSavingsTotalSeries([a], ["a"])).toEqual([
      { x: ms("2026-01-01"), y: 200 },
    ]);
  });
});
