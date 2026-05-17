import { describe, expect, it } from "vitest";

import { monthColorVar, monthNumberFromKey } from "../src/utils/monthColor";

describe("monthColorVar", () => {
  it("returns the matching CSS variable for each month", () => {
    expect(monthColorVar(1)).toBe("var(--month-1)");
    expect(monthColorVar(5)).toBe("var(--month-5)");
    expect(monthColorVar(12)).toBe("var(--month-12)");
  });

  it("returns undefined for out-of-range or non-integer input", () => {
    expect(monthColorVar(0)).toBeUndefined();
    expect(monthColorVar(13)).toBeUndefined();
    expect(monthColorVar(-1)).toBeUndefined();
    expect(monthColorVar(5.5)).toBeUndefined();
    expect(monthColorVar(NaN)).toBeUndefined();
  });
});

describe("monthNumberFromKey", () => {
  it("parses the month from an ISO date or a fiscal-month key", () => {
    expect(monthNumberFromKey("2026-05-16")).toBe(5);
    expect(monthNumberFromKey("2026-05")).toBe(5);
    expect(monthNumberFromKey("2026-01-01")).toBe(1);
    expect(monthNumberFromKey("2026-12-31")).toBe(12);
  });

  it("returns null for undated or malformed input", () => {
    expect(monthNumberFromKey("undated")).toBeNull();
    expect(monthNumberFromKey("")).toBeNull();
    expect(monthNumberFromKey("2026")).toBeNull();
    expect(monthNumberFromKey("2026-99-01")).toBeNull();
    expect(monthNumberFromKey("2026-xx-01")).toBeNull();
  });
});
