import { describe, expect, it } from "vitest";

import {
  amountRangeIO,
  monthRangeIO,
} from "../src/components/form/RangeBoundsEditor";
import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";
import type { Settings } from "../src/data/types";
import { isoToMonthNum, monthNumToKey } from "../src/utils/date";

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("amountRangeIO", () => {
  it("seeds the input with the unformatted figure and parses it back", () => {
    const io = amountRangeIO(settings({ decimalSeparator: "," }));
    const seeded = io.seed(1234.5);
    expect(seeded).toBe("1234,5");
    expect(io.parse(seeded)).toBe(1234.5);
  });

  it("accepts either decimal separator and grouped input", () => {
    const io = amountRangeIO(settings());
    expect(io.parse("1 234.50")).toBe(1234.5);
    expect(io.parse("1.234,50")).toBe(1234.5);
  });

  it("returns null for empty / malformed text so the bound is left alone", () => {
    const io = amountRangeIO(settings());
    expect(io.parse("")).toBeNull();
    expect(io.parse("   ")).toBeNull();
    expect(io.parse("-")).toBeNull();
  });
});

describe("monthRangeIO", () => {
  it("round-trips a month number through the YYYY-MM input value", () => {
    const io = monthRangeIO();
    const monthNum = isoToMonthNum("2024-05-01");
    expect(io.seed(monthNum)).toBe("2024-05");
    expect(io.parse(io.seed(monthNum))).toBe(monthNum);
  });

  it("maps the YYYY-MM value onto the month-number domain", () => {
    const io = monthRangeIO();
    expect(io.parse("2022-01")).toBe(isoToMonthNum("2022-01-01"));
    expect(monthNumToKey(io.parse("2026-12") ?? -1)).toBe("2026-12");
  });

  it("rejects empty / malformed month text", () => {
    const io = monthRangeIO();
    expect(io.parse("")).toBeNull();
    expect(io.parse("2024")).toBeNull();
    expect(io.parse("2024-5")).toBeNull();
    expect(io.parse("not-a-month")).toBeNull();
  });
});
