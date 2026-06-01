import { describe, expect, it } from "vitest";

import { discoverSalaries } from "../src/data/salary/discovery";
import { SALARY_TYPE_ID } from "../src/data/salary/salary";
import type { HistoryEntry } from "../src/data/types";

// Monthly ISO dates ("YYYY-MM-DD") on a fixed day, count months from a
// start — the cadence a paycheck lands on.
function monthlyDates(
  startYear: number,
  startMonth: number,
  count: number,
  day = 25,
): string[] {
  const out: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i++) {
    out.push(
      `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function entry(
  id: string,
  date: string,
  amount: number,
  description: string,
  over: Partial<HistoryEntry> = {},
): HistoryEntry {
  return { id, date, description, amount, importedAt: 0, ...over };
}

describe("salary discovery (bank-history scan)", () => {
  it("recovers a steady monthly paycheck across the full range, past-only", () => {
    // Five years of identical deposits — well before any tagging would
    // have reached. The detector should surface every month.
    const dates = monthlyDates(2020, 1, 60);
    const entries = dates.map((d, i) =>
      entry(`s${i}`, d, 30000, "ACME PAYROLL"),
    );
    const { candidates, boundaries, baselineByYear } = discoverSalaries({
      entries,
    });
    expect(candidates).toHaveLength(60);
    expect(candidates[0].monthKey).toBe("2020-01");
    // No future month is ever synthesised past the last real deposit.
    expect(candidates[candidates.length - 1].monthKey).toBe("2024-12");
    expect(candidates.every((c) => c.sourceHistoryId.length > 0)).toBe(true);
    expect(candidates[0].confidence).toBeGreaterThan(0.75);
    expect(boundaries).toEqual([0]);
    expect(baselineByYear.get("2020")).toBe(30000);
  });

  it("segments a sustained raise into a new employer group", () => {
    const dates = monthlyDates(2024, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`s${i}`, d, i < 6 ? 30000 : 35000, "ACME PAYROLL"),
    );
    const { candidates, boundaries } = discoverSalaries({ entries });
    expect(candidates).toHaveLength(12);
    expect(boundaries).toEqual([0, 6]);
    expect(candidates[6].employerGroup).toBe(1);
  });

  it("ignores a one-off non-salary deposit (different description)", () => {
    const dates = monthlyDates(2024, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`s${i}`, d, 30000, "ACME PAYROLL"),
    );
    // A large inheritance lands in March under its own description — it's
    // not part of the recurring series, so it must not be offered.
    entries.push(entry("arv", "2024-03-10", 250000, "INHERITANCE PAYOUT"));
    const { candidates, boundaries } = discoverSalaries({ entries });
    expect(candidates).toHaveLength(12);
    expect(candidates.every((c) => c.net === 30000)).toBe(true);
    expect(boundaries).toEqual([0]);
  });

  it("skips a month already backed by an added salary", () => {
    const dates = monthlyDates(2024, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`s${i}`, d, 30000, "ACME PAYROLL"),
    );
    const { candidates } = discoverSalaries({
      entries,
      excludeHistoryIds: new Set(["s5"]),
    });
    expect(candidates).toHaveLength(11);
    expect(candidates.some((c) => c.monthKey === "2024-06")).toBe(false);
  });

  it("boosts a salary-typed entry without requiring the type", () => {
    const dates = monthlyDates(2024, 1, 4);
    const entries = dates.map((d, i) =>
      entry(`s${i}`, d, 30000, "ACME PAYROLL"),
    );
    // Tag only the second month as salary.
    entries[1] = { ...entries[1], userTypeId: SALARY_TYPE_ID };
    const { candidates } = discoverSalaries({ entries });
    expect(candidates).toHaveLength(4);
    const typed = candidates.find((c) => c.monthKey === "2024-02")!;
    const untyped = candidates.find((c) => c.monthKey === "2024-01")!;
    expect(typed.typedSalary).toBe(true);
    expect(typed.confidence).toBeGreaterThanOrEqual(0.9);
    // The untyped month is still detected — tagging is a signal, not a gate.
    expect(untyped.typedSalary).toBe(false);
    expect(untyped.confidence).toBeLessThan(0.9);
  });

  it("collapses a biweekly cadence to one winner per month", () => {
    // Every 14 days from 2024-01-05 — two-ish deposits a month.
    const dates: string[] = [];
    const start = Date.UTC(2024, 0, 5);
    for (let i = 0; i < 8; i++) {
      const d = new Date(start + i * 14 * 86_400_000);
      dates.push(d.toISOString().slice(0, 10));
    }
    const entries = dates.map((d, i) => entry(`b${i}`, d, 15000, "ACME WAGE"));
    const { candidates } = discoverSalaries({ entries });
    // Distinct months only, each at the single winning amount.
    const months = new Set(candidates.map((c) => c.monthKey));
    expect(candidates.length).toBe(months.size);
    expect(candidates.every((c) => c.net === 15000)).toBe(true);
  });

  it("carries the bank description so the user can eyeball the deposit", () => {
    const dates = monthlyDates(2024, 1, 4);
    const entries = dates.map((d, i) =>
      entry(`s${i}`, d, 30000, "ACME PAYROLL LÖN"),
    );
    const { candidates } = discoverSalaries({ entries });
    expect(candidates).toHaveLength(4);
    expect(candidates.every((c) => c.description === "ACME PAYROLL LÖN")).toBe(
      true,
    );
  });

  it("returns nothing when there's no recurring deposit", () => {
    const entries = [
      entry("a", "2024-01-10", 30000, "ONE OFF"),
      entry("b", "2024-02-14", 12000, "ANOTHER"),
    ];
    const { candidates } = discoverSalaries({ entries });
    expect(candidates).toHaveLength(0);
  });
});
