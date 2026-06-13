import { describe, expect, it } from "vitest";

import {
  dayFirstFromDateFormat,
  excelSerialToIso,
  inferDayFirst,
  parseFlexibleDate,
} from "../src/utils/parse-date";

describe("parseFlexibleDate", () => {
  it("parses ISO and year-first variants", () => {
    expect(parseFlexibleDate("2024-01-15", true)).toBe("2024-01-15");
    expect(parseFlexibleDate("2024/01/15", true)).toBe("2024-01-15");
    expect(parseFlexibleDate("2024.1.5", true)).toBe("2024-01-05");
  });

  it("honours day-first vs month-first for ambiguous numeric dates", () => {
    expect(parseFlexibleDate("03/04/2024", true)).toBe("2024-04-03");
    expect(parseFlexibleDate("03/04/2024", false)).toBe("2024-03-04");
  });

  it("disambiguates by an out-of-range part regardless of preference", () => {
    // 15 can't be a month, so this is day-first even when asked for mdy.
    expect(parseFlexibleDate("15/04/2024", false)).toBe("2024-04-15");
    // 13 can't be a month in the second slot, so this is month-first.
    expect(parseFlexibleDate("04/13/2024", true)).toBe("2024-04-13");
  });

  it("expands two-digit years", () => {
    expect(parseFlexibleDate("05/06/24", true)).toBe("2024-06-05");
    expect(parseFlexibleDate("05/06/85", true)).toBe("1985-06-05");
  });

  it("strips a trailing time component", () => {
    expect(parseFlexibleDate("2024-01-15 13:45:00", true)).toBe("2024-01-15");
    expect(parseFlexibleDate("2024-01-15T08:00", true)).toBe("2024-01-15");
  });

  it("parses month-name forms in English and Swedish", () => {
    expect(parseFlexibleDate("15 Jan 2024", true)).toBe("2024-01-15");
    expect(parseFlexibleDate("Jan 15, 2024", true)).toBe("2024-01-15");
    expect(parseFlexibleDate("15 maj 2024", true)).toBe("2024-05-15");
    expect(parseFlexibleDate("15 mars 2024", true)).toBe("2024-03-15");
    expect(parseFlexibleDate("3 okt 2024", true)).toBe("2024-10-03");
  });

  it("reads Excel serial numbers", () => {
    // 45306 is 2024-01-15 under the 1899-12-30 epoch.
    expect(parseFlexibleDate(45306, true)).toBe("2024-01-15");
  });

  it("rejects nonsense and impossible dates", () => {
    expect(parseFlexibleDate("not a date", true)).toBeNull();
    expect(parseFlexibleDate("2024-02-31", true)).toBeNull();
    expect(parseFlexibleDate("", true)).toBeNull();
    expect(parseFlexibleDate(null, true)).toBeNull();
  });
});

describe("excelSerialToIso", () => {
  it("converts within the plausible window and rejects outside it", () => {
    expect(excelSerialToIso(45306)).toBe("2024-01-15");
    expect(excelSerialToIso(5)).toBeNull();
    expect(excelSerialToIso(99999)).toBeNull();
  });
});

describe("inferDayFirst", () => {
  it("detects day-first from an unambiguous cell", () => {
    expect(inferDayFirst(["01/02/2024", "25/02/2024"], false)).toBe(true);
  });

  it("detects month-first from an unambiguous cell", () => {
    expect(inferDayFirst(["01/02/2024", "12/25/2024"], true)).toBe(false);
  });

  it("falls back when every cell is ambiguous", () => {
    expect(inferDayFirst(["01/02/2024", "03/04/2024"], true)).toBe(true);
    expect(inferDayFirst(["01/02/2024", "03/04/2024"], false)).toBe(false);
  });
});

describe("dayFirstFromDateFormat", () => {
  it("treats MM/DD/YYYY as month-first and everything else as day-first", () => {
    expect(dayFirstFromDateFormat("MM/DD/YYYY")).toBe(false);
    expect(dayFirstFromDateFormat("DD/MM/YYYY")).toBe(true);
    expect(dayFirstFromDateFormat("YYYY-MM-DD")).toBe(true);
  });
});
