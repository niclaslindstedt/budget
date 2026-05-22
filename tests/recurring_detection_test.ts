import { describe, expect, it } from "vitest";

import { detectRecurringCandidates } from "../src/data/recurring-detection";
import type { HistoryEntry } from "../src/data/types";

let counter = 0;
function entry(
  date: string,
  description: string,
  amount: number,
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    date,
    description,
    amount,
    balance: 0,
    importedAt: 0,
    ...overrides,
  };
}

describe("detectRecurringCandidates", () => {
  it("finds a monthly subscription", () => {
    // Real Spotify charges from a bank statement: same merchant
    // string every month, only date and reference number change. The
    // normaliser strips the ISO date the bank prefixes with `Kortköp`
    // so all five rows hash to the same key.
    const entries: HistoryEntry[] = [
      entry("2025-12-01", "Kortköp 2025-12-01 Spotify", -119),
      entry("2026-01-01", "Kortköp 2026-01-01 Spotify", -119),
      entry("2026-02-01", "Kortköp 2026-02-01 Spotify", -119),
      entry("2026-03-01", "Kortköp 2026-03-01 Spotify", -119),
      entry("2026-04-01", "Kortköp 2026-04-01 Spotify", -119),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-04-15",
    });
    expect(out).toHaveLength(1);
    expect(out[0].cadence.kind).toBe("monthly");
    expect(out[0].occurrenceCount).toBe(5);
    expect(out[0].suggestedAmount).toBe(-119);
    expect(out[0].confidence).toBeGreaterThan(0.7);
  });

  it("finds a biweekly salary", () => {
    const entries: HistoryEntry[] = [
      entry("2026-01-12", "Salary employer ab", 32000),
      entry("2026-01-26", "Salary employer ab", 32000),
      entry("2026-02-09", "Salary employer ab", 32000),
      entry("2026-02-23", "Salary employer ab", 32000),
      entry("2026-03-09", "Salary employer ab", 32000),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-03-15",
    });
    expect(out).toHaveLength(1);
    expect(out[0].cadence.kind).toBe("biweekly");
    expect(out[0].suggestedAmount).toBe(32000);
  });

  it("seeds varying amounts from the average of the last three months", () => {
    // A utility bill that swings month to month — the user wants the
    // promoted series seeded with the recent trend, not the median
    // pulled down by a cheap month from a year ago.
    const entries: HistoryEntry[] = [
      entry("2025-11-15", "Electricity provider", -200),
      entry("2025-12-15", "Electricity provider", -250),
      entry("2026-01-15", "Electricity provider", -300),
      entry("2026-02-15", "Electricity provider", -600),
      entry("2026-03-15", "Electricity provider", -900),
      entry("2026-04-15", "Electricity provider", -1200),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-04-20",
    });
    expect(out).toHaveLength(1);
    // Average of the last three: (-600 + -900 + -1200) / 3 = -900.
    // The median across all six would be -450, which would
    // under-seed the series.
    expect(out[0].suggestedAmount).toBe(-900);
  });

  it("rounds the seeded amount to a whole number", () => {
    // Recent amounts average to a repeating decimal (-321.333…). The
    // promote modal should seed with a clean integer, not the raw
    // floating-point tail the bank statement would never have shown.
    const entries: HistoryEntry[] = [
      entry("2026-01-02", "Autogiro IF Skadeförs", -320),
      entry("2026-02-02", "Autogiro IF Skadeförs", -320),
      entry("2026-03-02", "Autogiro IF Skadeförs", -324),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-03-15",
    });
    expect(out).toHaveLength(1);
    expect(out[0].suggestedAmount).toBe(-321);
  });

  it("respects dismissed keys", () => {
    const entries: HistoryEntry[] = [
      entry("2026-01-01", "Spotify", -119),
      entry("2026-02-01", "Spotify", -119),
      entry("2026-03-01", "Spotify", -119),
    ];
    const out = detectRecurringCandidates({
      entries,
      dismissedKeys: new Set(["spotify"]),
      referenceDate: "2026-03-15",
    });
    expect(out).toHaveLength(0);
  });

  it("skips entries hidden or already collapsed", () => {
    const entries: HistoryEntry[] = [
      entry("2026-01-01", "Spotify", -119, { hidden: true }),
      entry("2026-02-01", "Spotify", -119, {
        collapsedIntoTransactionId: "tx1",
      }),
      entry("2026-03-01", "Spotify", -119),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-03-15",
    });
    expect(out).toHaveLength(0);
  });

  it("drops stale patterns past the active window", () => {
    const entries: HistoryEntry[] = [
      entry("2023-01-01", "Old subscription", -50),
      entry("2023-02-01", "Old subscription", -50),
      entry("2023-03-01", "Old subscription", -50),
      entry("2023-04-01", "Old subscription", -50),
    ];
    // referenceDate is years later — well past 3× the monthly cadence.
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-05-01",
    });
    expect(out).toHaveLength(0);
  });

  it("requires at least three occurrences", () => {
    const entries: HistoryEntry[] = [
      entry("2026-01-01", "Spotify", -119),
      entry("2026-02-01", "Spotify", -119),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-02-15",
    });
    expect(out).toHaveLength(0);
  });

  it("emits the most recent description as the representative", () => {
    // All three rows normalise to the same key ("spotify") because
    // the bank-noise prefix and ISO dates are stripped — but the
    // detector keeps the latest row's original-case description as
    // the representative so the user sees a real string from their
    // bank rather than the normalised form.
    const entries: HistoryEntry[] = [
      entry("2026-01-01", "Kortköp 2026-01-01 SPOTIFY", -119),
      entry("2026-02-01", "Kortköp 2026-02-01 Spotify", -119),
      entry("2026-03-01", "Kortköp 2026-03-01 Spotify", -119),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-03-15",
    });
    expect(out).toHaveLength(1);
    expect(out[0].description).toBe("Kortköp 2026-03-01 Spotify");
  });

  it("sorts results by confidence descending", () => {
    const entries: HistoryEntry[] = [
      entry("2026-01-01", "Salary", 30000),
      entry("2026-02-01", "Salary", 30000),
      entry("2026-03-01", "Salary", 30000),
      entry("2026-04-01", "Salary", 30000),
      entry("2026-01-05", "Variable bill", -100),
      entry("2026-02-08", "Variable bill", -250),
      entry("2026-03-02", "Variable bill", -180),
      entry("2026-04-11", "Variable bill", -420),
    ];
    const out = detectRecurringCandidates({
      entries,
      referenceDate: "2026-04-15",
    });
    expect(out).toHaveLength(2);
    expect(out[0].confidence).toBeGreaterThan(out[1].confidence);
  });
});
