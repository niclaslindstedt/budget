import { describe, expect, it } from "vitest";

import { expandRecurrence, isIsoDate } from "../src/data/recurrence";

describe("isIsoDate", () => {
  it("accepts well-formed dates", () => {
    expect(isIsoDate("2026-05-16")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap day
  });
  it("rejects malformed or impossible dates", () => {
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-5-1")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("expandRecurrence", () => {
  it("once returns the single date when valid", () => {
    expect(expandRecurrence({ kind: "once", date: "2026-05-16" })).toEqual([
      "2026-05-16",
    ]);
  });

  it("once drops invalid dates", () => {
    expect(expandRecurrence({ kind: "once", date: "nope" })).toEqual([]);
  });

  it("dates sorts and de-dupes", () => {
    expect(
      expandRecurrence({
        kind: "dates",
        dates: ["2026-05-10", "2026-05-01", "2026-05-10", "garbage"],
      }),
    ).toEqual(["2026-05-01", "2026-05-10"]);
  });

  it("everyNDays walks from start to end inclusive", () => {
    const out = expandRecurrence({
      kind: "everyNDays",
      start: "2026-01-01",
      end: "2026-01-15",
      intervalDays: 7,
    });
    expect(out).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  it("everyNDays clamps when end < start", () => {
    expect(
      expandRecurrence({
        kind: "everyNDays",
        start: "2026-05-10",
        end: "2026-05-01",
        intervalDays: 1,
      }),
    ).toEqual([]);
  });

  it("everyNMonths monthly with negative offset (rent example)", () => {
    // day 1 of each month, paid 2 days before. From Feb → Apr 2026:
    // anchor 2026-02-01 → 2026-01-30
    // anchor 2026-03-01 → 2026-02-27
    // anchor 2026-04-01 → 2026-03-30
    const out = expandRecurrence({
      kind: "everyNMonths",
      intervalMonths: 1,
      dayOfMonth: 1,
      offsetDays: -2,
      start: "2026-01-01",
      end: "2026-04-15",
    });
    expect(out).toEqual(["2026-01-30", "2026-02-27", "2026-03-30"]);
  });

  it("everyNMonths quarterly stride", () => {
    const out = expandRecurrence({
      kind: "everyNMonths",
      intervalMonths: 3,
      dayOfMonth: 15,
      offsetDays: 0,
      start: "2026-01-15",
      end: "2026-12-31",
    });
    expect(out).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ]);
  });

  it("everyNMonths yearly stride", () => {
    const out = expandRecurrence({
      kind: "everyNMonths",
      intervalMonths: 12,
      dayOfMonth: 1,
      offsetDays: 0,
      start: "2026-06-01",
      end: "2028-12-31",
    });
    expect(out).toEqual(["2026-06-01", "2027-06-01", "2028-06-01"]);
  });

  it("everyNMonths clamps day to month length", () => {
    // anchor day=31 in February drops to Feb 28 (2026 is not a leap year)
    const out = expandRecurrence({
      kind: "everyNMonths",
      intervalMonths: 1,
      dayOfMonth: 31,
      offsetDays: 0,
      start: "2026-02-01",
      end: "2026-03-31",
    });
    expect(out).toEqual(["2026-02-28", "2026-03-31"]);
  });

  it("everyNMonths handles leap years", () => {
    const out = expandRecurrence({
      kind: "everyNMonths",
      intervalMonths: 12,
      dayOfMonth: 29,
      offsetDays: 0,
      start: "2024-02-01",
      end: "2025-12-31",
    });
    // 2024 is a leap year, 2025 is not
    expect(out).toEqual(["2024-02-29", "2025-02-28"]);
  });

  it("everyNMonths returns empty for invalid input", () => {
    expect(
      expandRecurrence({
        kind: "everyNMonths",
        intervalMonths: 0,
        dayOfMonth: 1,
        offsetDays: 0,
        start: "2026-01-01",
        end: "2026-12-31",
      }),
    ).toEqual([]);
  });
});
