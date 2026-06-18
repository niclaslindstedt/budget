import { describe, expect, it } from "vitest";

import { historyDateRange, historyStaleness } from "../src/data/history";
import type { HistoryEntry } from "../src/data/types";

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

describe("historyStaleness", () => {
  const today = "2026-06-18";

  it("buckets by age in whole days", () => {
    expect(historyStaleness("2026-06-18", today)).toBe("fresh"); // today
    expect(historyStaleness("2026-06-17", today)).toBe("fresh"); // yesterday
    expect(historyStaleness("2026-06-16", today)).toBe("recent"); // 2 days
    expect(historyStaleness("2026-06-15", today)).toBe("recent"); // 3 days
    expect(historyStaleness("2026-06-14", today)).toBe("aging"); // 4 days
    expect(historyStaleness("2026-06-12", today)).toBe("aging"); // 6 days
    expect(historyStaleness("2026-06-11", today)).toBe("stale"); // 7 days
    expect(historyStaleness("2026-01-01", today)).toBe("stale"); // months
  });

  it("treats a future-dated entry as fresh", () => {
    expect(historyStaleness("2026-06-20", today)).toBe("fresh");
  });

  it("returns null for an unparseable date", () => {
    expect(historyStaleness("", today)).toBeNull();
  });
});
