import { describe, expect, it } from "vitest";

import type { Settings } from "../src/data/types";
import {
  amountFormatCode,
  balanceFormatCode,
  dateFormatCode,
  isoToExcelSerial,
} from "../src/utils/xlsx-format";

// Minimal Settings stub — the formatter only touches the format-related
// fields, so the rest are filled with arbitrary defaults.
function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    startOfMonth: 25,
    dateFormat: "YYYY-MM-DD",
    shortDateFormat: "DD/MM",
    currency: "kr",
    currencyPosition: "after",
    currencySpace: true,
    decimalSeparator: ",",
    thousandsSeparator: " ",
    formatNumbers: true,
    showCurrency: true,
    showDecimals: true,
    abbreviateNumbers: false,
    alwaysAbbreviateBalance: false,
    fontScale: 1,
    sessionTimeoutMinutes: 30,
    lastSeenChangelogVersion: null,
    language: "sv",
    hideTransfers: false,
    theme: "system",
    fontFamily: "mono",
    customTheme: {
      colors: {
        pageBg: "#000",
        surface: "#000",
        surface2: "#000",
        surface3: "#000",
        fg: "#fff",
        fgBright: "#fff",
        muted: "#888",
        line: "#222",
        accent: "#0f0",
        meta: "#888",
        link: "#08f",
        path: "#fa0",
        flag: "#f80",
        pipe: "#888",
        danger: "#f00",
        success: "#0f0",
        positive: "#0f0",
        negative: "#f00",
      },
      radius: "md",
      density: "comfortable",
      borderWidth: "normal",
      reduceMotion: false,
    },
    ...overrides,
  };
}

describe("isoToExcelSerial", () => {
  it("maps known dates to their Excel serial values", () => {
    // 1900-03-01 is Excel serial 61 (the day after the phantom leap day).
    expect(isoToExcelSerial("1900-03-01")).toBe(61);
    // 2026-05-18 — Excel's well-known anchor 2024-01-01 is serial
    // 45292, and 2026-05-18 is 868 days later (2024 was a leap year,
    // 2025 not, 2026 partial).
    expect(isoToExcelSerial("2026-05-18")).toBe(46_160);
  });

  it("returns null for empty / malformed input", () => {
    expect(isoToExcelSerial("")).toBeNull();
    expect(isoToExcelSerial("not-a-date")).toBeNull();
    expect(isoToExcelSerial("2026-13-01")).toBeNull();
    expect(isoToExcelSerial("2026-05-32")).toBeNull();
  });
});

describe("dateFormatCode", () => {
  it("maps every DateFormat enum to an Excel format code", () => {
    expect(dateFormatCode("YYYY-MM-DD")).toBe("yyyy-mm-dd");
    expect(dateFormatCode("DD/MM/YYYY")).toBe("dd/mm/yyyy");
    expect(dateFormatCode("MM/DD/YYYY")).toBe("mm/dd/yyyy");
    expect(dateFormatCode("DD.MM.YYYY")).toBe("dd.mm.yyyy");
    // 'D MMM YYYY' falls back to ISO because Excel's 'mmm' is
    // viewer-locale-dependent.
    expect(dateFormatCode("D MMM YYYY")).toBe("yyyy-mm-dd");
  });
});

describe("amountFormatCode / balanceFormatCode", () => {
  it("wraps the currency symbol after the number for Swedish defaults", () => {
    const settings = makeSettings();
    // Swedish locale prefix forces ` ` group and `,` decimal so the
    // template can use literal `,` for grouping inside the format code.
    expect(amountFormatCode(settings)).toBe('[$-41D]#,##0.00 "kr"');
    expect(balanceFormatCode(settings)).toBe('[$-41D]#,##0.00 "kr"');
  });

  it("places the symbol in front when configured", () => {
    const settings = makeSettings({
      currency: "$",
      currencyPosition: "before",
      currencySpace: false,
      decimalSeparator: ".",
      thousandsSeparator: ",",
    });
    expect(amountFormatCode(settings)).toBe('[$-409]"$"#,##0.00');
  });

  it("showDecimals=false strips decimals from both amount and balance", () => {
    // Mirrors the website's `formatNumber`: when the user disables
    // decimals globally, the always-two-decimals balance override
    // short-circuits too, so Amount and Balance read consistently.
    const settings = makeSettings({ showDecimals: false });
    expect(amountFormatCode(settings)).toBe('[$-41D]#,##0 "kr"');
    expect(balanceFormatCode(settings)).toBe('[$-41D]#,##0 "kr"');
  });

  it("balance pins two decimals when showDecimals is on", () => {
    const settings = makeSettings({ showDecimals: true });
    expect(balanceFormatCode(settings)).toBe('[$-41D]#,##0.00 "kr"');
  });

  it("drops the currency wrap when showCurrency is off", () => {
    const settings = makeSettings({ showCurrency: false });
    expect(amountFormatCode(settings)).toBe("[$-41D]#,##0.00");
  });

  it("drops thousands grouping when formatNumbers is off", () => {
    const settings = makeSettings({ formatNumbers: false });
    expect(amountFormatCode(settings)).toBe('[$-41D]0.00 "kr"');
  });

  it("omits the locale prefix for combinations outside the known set", () => {
    // `.` group + `,` decimal is reachable through the picker but not a
    // common locale, so we let Excel render in the viewer's locale.
    const settings = makeSettings({
      decimalSeparator: ",",
      thousandsSeparator: ".",
    });
    expect(amountFormatCode(settings)).toBe('[$-407]#,##0.00 "kr"');
  });
});
