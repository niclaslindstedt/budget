import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";
import type { Settings } from "../src/data/types";
import {
  formatAmount,
  formatAmountForInput,
  formatBalance,
  formatDate,
  formatDayOnly,
  formatNumber,
  formatRunningBalance,
  formatShortDate,
  normalizeAmountInput,
  parseAmount,
} from "../src/utils/format";

function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("formatNumber", () => {
  it("uses configured thousands + decimal separators", () => {
    expect(formatNumber(1234567.89, settings({ showDecimals: true }))).toBe(
      "1 234 567,89",
    );
    expect(
      formatNumber(
        1234567.89,
        settings({
          showDecimals: true,
          thousandsSeparator: ",",
          decimalSeparator: ".",
        }),
      ),
    ).toBe("1,234,567.89");
    expect(
      formatNumber(
        1234567.89,
        settings({
          showDecimals: true,
          thousandsSeparator: ".",
          decimalSeparator: ",",
        }),
      ),
    ).toBe("1.234.567,89");
  });

  it("drops thousands grouping when formatNumbers is off", () => {
    expect(
      formatNumber(
        1234567.89,
        settings({ showDecimals: true, formatNumbers: false }),
      ),
    ).toBe("1234567,89");
  });

  it("omits trailing zeros for whole numbers unless asked", () => {
    expect(formatNumber(100, settings({ showDecimals: true }))).toBe("100");
    expect(
      formatNumber(100, settings({ showDecimals: true }), {
        alwaysTwoFractionDigits: true,
      }),
    ).toBe("100,00");
  });

  it("rounds floats to two decimals to hide drift", () => {
    expect(formatNumber(0.1 + 0.2, settings({ showDecimals: true }))).toBe(
      "0,3",
    );
  });

  it("formats negatives with a leading minus", () => {
    expect(formatNumber(-1234.5, settings({ showDecimals: true }))).toBe(
      "-1 234,5",
    );
  });

  it("hides the fractional part when showDecimals is off (default)", () => {
    expect(formatNumber(1234.56, settings())).toBe("1 235");
    expect(formatNumber(1234.4, settings())).toBe("1 234");
    expect(formatNumber(-0.5, settings())).toBe("0");
    expect(
      formatNumber(100, settings(), { alwaysTwoFractionDigits: true }),
    ).toBe("100");
  });

  it("abbreviates values >= 10 000 when abbreviateNumbers is on", () => {
    const s = settings({ abbreviateNumbers: true });
    // Below the threshold the regular pipeline still runs.
    expect(formatNumber(9999, s)).toBe("9 999");
    expect(formatNumber(10_000, s)).toBe("10K");
    expect(formatNumber(12_894, s)).toBe("13K");
    expect(formatNumber(999_499, s)).toBe("999K");
    // Edge case: 999 500 would round to 1000K, so we bump to M.
    expect(formatNumber(999_500, s)).toBe("1M");
    expect(formatNumber(1_000_000, s)).toBe("1M");
    expect(formatNumber(12_500_000, s)).toBe("13M");
  });

  it("keeps one fractional digit on sub-10M abbreviations when showDecimals is on", () => {
    const s = settings({ abbreviateNumbers: true, showDecimals: true });
    expect(formatNumber(1_234_567, s)).toBe("1,2M");
    // Trailing ".0" is stripped so "1M" stays clean.
    expect(formatNumber(1_000_000, s)).toBe("1M");
    expect(formatNumber(9_950_000, s)).toBe("10M");
  });

  it("rounds abbreviated millions to an integer when showDecimals is off", () => {
    const s = settings({ abbreviateNumbers: true });
    expect(formatNumber(1_234_567, s)).toBe("1M");
    expect(formatNumber(1_500_000, s)).toBe("2M");
  });

  it("preserves the sign on abbreviated values", () => {
    const s = settings({ abbreviateNumbers: true });
    expect(formatNumber(-12_894, s)).toBe("-13K");
    expect(formatNumber(-1_500_000, s)).toBe("-2M");
  });

  it("uses the configured decimal char in fractional millions", () => {
    expect(
      formatNumber(
        1_234_567,
        settings({
          abbreviateNumbers: true,
          showDecimals: true,
          decimalSeparator: ".",
        }),
      ),
    ).toBe("1.2M");
  });

  it("bypasses the threshold when alwaysAbbreviate is on", () => {
    const s = settings({ abbreviateNumbers: true });
    expect(formatNumber(0, s, { alwaysAbbreviate: true })).toBe("0K");
    expect(formatNumber(900, s, { alwaysAbbreviate: true })).toBe("1K");
    expect(formatNumber(9_999, s, { alwaysAbbreviate: true })).toBe("10K");
  });

  it("ignores alwaysAbbreviate when abbreviateNumbers is off", () => {
    const s = settings({ abbreviateNumbers: false });
    expect(formatNumber(9_999, s, { alwaysAbbreviate: true })).toBe("9 999");
  });
});

describe("formatAmount / formatBalance", () => {
  it("appends currency when showCurrency is on", () => {
    expect(formatAmount(1234, settings({ showDecimals: true }))).toBe(
      "1 234 kr",
    );
    expect(formatBalance(1234, settings({ showDecimals: true }))).toBe(
      "1 234,00 kr",
    );
  });

  it("omits currency when showCurrency is off", () => {
    expect(
      formatAmount(1234, settings({ showDecimals: true, showCurrency: false })),
    ).toBe("1 234");
    expect(
      formatBalance(
        1234,
        settings({ showDecimals: true, showCurrency: false }),
      ),
    ).toBe("1 234,00");
  });

  it("honours a user-typed currency string", () => {
    expect(
      formatAmount(50, settings({ showDecimals: true, currency: "$" })),
    ).toBe("50 $");
  });

  it("hides decimals on amounts and balances when showDecimals is off", () => {
    // Default settings have showDecimals off — balances drop their
    // ".00" tail and amounts round to whole units.
    expect(formatAmount(1234.56, settings())).toBe("1 235 kr");
    expect(formatBalance(1234.5, settings())).toBe("1 235 kr");
    expect(formatBalance(1234, settings())).toBe("1 234 kr");
  });

  it("places the symbol before the amount when configured", () => {
    expect(
      formatAmount(
        1234,
        settings({ showDecimals: true, currencyPosition: "before" }),
      ),
    ).toBe("kr 1 234");
    expect(
      formatBalance(
        1234,
        settings({ showDecimals: true, currencyPosition: "before" }),
      ),
    ).toBe("kr 1 234,00");
  });

  it("drops the space between symbol and amount when configured", () => {
    expect(
      formatAmount(
        1234,
        settings({ showDecimals: true, currencySpace: false }),
      ),
    ).toBe("1 234kr");
    expect(
      formatAmount(
        1234,
        settings({
          showDecimals: true,
          currencyPosition: "before",
          currencySpace: false,
        }),
      ),
    ).toBe("kr1 234");
  });

  it("applies position and spacing to any user-typed symbol", () => {
    expect(
      formatAmount(
        50,
        settings({
          showDecimals: true,
          currency: "$",
          currencyPosition: "before",
          currencySpace: false,
        }),
      ),
    ).toBe("$50");
    expect(
      formatAmount(
        50,
        settings({
          showDecimals: true,
          currency: "$",
          currencyPosition: "before",
          currencySpace: true,
        }),
      ),
    ).toBe("$ 50");
  });

  it("omits the symbol regardless of position when showCurrency is off", () => {
    expect(
      formatAmount(
        1234,
        settings({
          showDecimals: true,
          showCurrency: false,
          currencyPosition: "before",
          currencySpace: false,
        }),
      ),
    ).toBe("1 234");
  });
});

describe("formatRunningBalance", () => {
  it("matches formatBalance when alwaysAbbreviateBalance is off", () => {
    const s = settings({
      abbreviateNumbers: true,
      alwaysAbbreviateBalance: false,
    });
    expect(formatRunningBalance(1234, s)).toBe(formatBalance(1234, s));
    expect(formatRunningBalance(12_345, s)).toBe(formatBalance(12_345, s));
  });

  it("abbreviates small balances when both toggles are on", () => {
    const s = settings({
      abbreviateNumbers: true,
      alwaysAbbreviateBalance: true,
    });
    expect(formatRunningBalance(1234, s)).toBe("1K kr");
    expect(formatRunningBalance(9_999, s)).toBe("10K kr");
    // Above the threshold the same compact form appears either way.
    expect(formatRunningBalance(12_500, s)).toBe("13K kr");
  });

  it("falls back to the precise pipeline when abbreviation is off", () => {
    const s = settings({
      abbreviateNumbers: false,
      alwaysAbbreviateBalance: true,
      showDecimals: true,
    });
    expect(formatRunningBalance(1234, s)).toBe("1 234,00 kr");
  });
});

describe("normalizeAmountInput", () => {
  it("snaps the alternate decimal char to the configured one", () => {
    // Period is decimal: comma in input becomes a period.
    expect(
      normalizeAmountInput("100,99", settings({ decimalSeparator: "." })),
    ).toBe("100.99");
    // Comma is decimal: period in input becomes a comma.
    expect(
      normalizeAmountInput("100.99", settings({ decimalSeparator: "," })),
    ).toBe("100,99");
  });

  it("strips the configured thousands separator", () => {
    expect(
      normalizeAmountInput(
        "1 234,99",
        settings({ thousandsSeparator: " ", decimalSeparator: "," }),
      ),
    ).toBe("1234,99");
  });

  it("matches the example: '100,990' becomes '100.99' with dot decimal", () => {
    const out = normalizeAmountInput(
      "100,990",
      settings({ decimalSeparator: ".", thousandsSeparator: "" }),
    );
    // After normalisation the text is "100.990"; parsing collapses the
    // trailing zero, so the user sees the value 100.99.
    expect(out).toBe("100.990");
    expect(parseAmount(out)).toBe(100.99);
  });
});

describe("parseAmount", () => {
  it("handles either decimal char", () => {
    expect(parseAmount("100.99")).toBe(100.99);
    expect(parseAmount("100,99")).toBe(100.99);
  });

  it("treats the last separator as the decimal", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });

  it("strips spaces used as thousands separators", () => {
    expect(parseAmount("1 234,56")).toBe(1234.56);
  });

  it("returns null for empty or sign-only input", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
    expect(parseAmount("-")).toBeNull();
  });

  it("tolerates a trailing separator while typing", () => {
    expect(parseAmount("5,")).toBe(5);
    expect(parseAmount("5.")).toBe(5);
  });
});

describe("formatAmountForInput", () => {
  it("seeds an input field with the configured decimal char", () => {
    expect(
      formatAmountForInput(100.5, settings({ decimalSeparator: "," })),
    ).toBe("100,5");
    expect(formatAmountForInput(100, settings({ decimalSeparator: "," }))).toBe(
      "100",
    );
  });
});

describe("formatDate", () => {
  it("renders each supported format from an ISO date", () => {
    expect(formatDate("2026-05-16", "YYYY-MM-DD")).toBe("2026-05-16");
    expect(formatDate("2026-05-16", "DD/MM/YYYY")).toBe("16/05/2026");
    expect(formatDate("2026-05-16", "MM/DD/YYYY")).toBe("05/16/2026");
    expect(formatDate("2026-05-16", "DD.MM.YYYY")).toBe("16.05.2026");
    expect(formatDate("2026-05-16", "D MMM YYYY")).toBe("16 May 2026");
  });

  it("returns an empty string for malformed input", () => {
    expect(formatDate("", "YYYY-MM-DD")).toBe("");
    expect(formatDate("abc", "YYYY-MM-DD")).toBe("");
  });
});

describe("formatDayOnly", () => {
  it("returns the day number with no leading zero", () => {
    expect(formatDayOnly("2026-05-01")).toBe("1");
    expect(formatDayOnly("2026-05-09")).toBe("9");
    expect(formatDayOnly("2026-05-16")).toBe("16");
    expect(formatDayOnly("2026-12-31")).toBe("31");
  });

  it("returns an empty string for malformed input", () => {
    expect(formatDayOnly("")).toBe("");
    expect(formatDayOnly("abc")).toBe("");
    expect(formatDayOnly("2026-05")).toBe("");
  });
});

describe("formatShortDate", () => {
  it("renders day + month for each supported format, no leading zeros", () => {
    expect(formatShortDate("2026-05-16", "DD/MM")).toBe("16/5");
    expect(formatShortDate("2026-05-16", "MM/DD")).toBe("5/16");
    expect(formatShortDate("2026-05-16", "DD.MM")).toBe("16.5");
    expect(formatShortDate("2026-05-16", "MM-DD")).toBe("5-16");
    expect(formatShortDate("2026-05-16", "D MMM")).toBe("16 May");
  });

  it("strips leading zeros from both day and month", () => {
    expect(formatShortDate("2026-05-01", "DD/MM")).toBe("1/5");
    expect(formatShortDate("2026-12-31", "DD/MM")).toBe("31/12");
  });

  it("returns an empty string for malformed input", () => {
    expect(formatShortDate("", "DD/MM")).toBe("");
    expect(formatShortDate("abc", "DD/MM")).toBe("");
  });
});
