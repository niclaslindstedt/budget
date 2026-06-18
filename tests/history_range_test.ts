import { describe, expect, it } from "vitest";

import { historyDateRange } from "../src/data/history";
import type { HistoryEntry } from "../src/data/types";
import { formatMonthRange } from "../src/utils/format";

function entry(date: string): HistoryEntry {
  return { id: date, date, description: "x", amount: 0, importedAt: 0 };
}

describe("historyDateRange", () => {
  it("returns null for missing or empty input", () => {
    expect(historyDateRange(undefined)).toBeNull();
    expect(historyDateRange([])).toBeNull();
  });

  it("finds the earliest and latest dates regardless of order", () => {
    const range = historyDateRange([
      entry("2025-06-15"),
      entry("2025-01-03"),
      entry("2026-02-28"),
    ]);
    expect(range).toEqual({ start: "2025-01-03", end: "2026-02-28" });
  });

  it("collapses to a single date when all entries share it", () => {
    expect(historyDateRange([entry("2025-04-01")])).toEqual({
      start: "2025-04-01",
      end: "2025-04-01",
    });
  });

  it("ignores entries with malformed dates", () => {
    const range = historyDateRange([
      entry("2025-05-10"),
      { id: "bad", date: "", description: "x", amount: 0, importedAt: 0 },
    ]);
    expect(range).toEqual({ start: "2025-05-10", end: "2025-05-10" });
  });
});

describe("formatMonthRange", () => {
  it("renders a month-year span across two months", () => {
    expect(formatMonthRange("2025-01-03", "2026-02-28", "en")).toBe(
      "Jan 2025 – Feb 2026",
    );
  });

  it("collapses to a single label within one month", () => {
    expect(formatMonthRange("2025-04-01", "2025-04-30", "en")).toBe("Apr 2025");
  });

  it("is language-aware", () => {
    expect(formatMonthRange("2025-01-03", "2026-02-28", "sv")).toBe(
      "jan 2025 – feb 2026",
    );
  });

  it("returns empty string when neither end parses", () => {
    expect(formatMonthRange("", "", "en")).toBe("");
  });
});
