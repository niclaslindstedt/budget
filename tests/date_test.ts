import { describe, expect, it } from "vitest";

import { addDaysIso, diffDaysIso } from "../src/utils/date";

describe("diffDaysIso", () => {
  it("returns a positive count when a is later than b", () => {
    expect(diffDaysIso("2026-06-20", "2026-06-18")).toBe(2);
  });

  it("returns a negative count when a is earlier than b", () => {
    expect(diffDaysIso("2026-06-18", "2026-06-20")).toBe(-2);
  });

  it("returns zero for the same date", () => {
    expect(diffDaysIso("2026-06-18", "2026-06-18")).toBe(0);
  });

  it("counts across month and year boundaries", () => {
    expect(diffDaysIso("2026-07-01", "2026-06-29")).toBe(2);
    expect(diffDaysIso("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("is unaffected by DST transitions", () => {
    // Spans the European spring-forward weekend.
    expect(diffDaysIso("2026-03-30", "2026-03-29")).toBe(1);
  });

  it("round-trips with addDaysIso", () => {
    const delta = diffDaysIso("2026-09-12", "2026-06-20");
    expect(addDaysIso("2026-06-20", delta)).toBe("2026-09-12");
  });

  it("returns NaN for an unparseable date", () => {
    expect(Number.isNaN(diffDaysIso("bad", "2026-06-18"))).toBe(true);
    expect(Number.isNaN(diffDaysIso("2026-06-18", ""))).toBe(true);
  });
});
