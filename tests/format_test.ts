import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import type { Settings } from "../src/data/types";
import {
  formatAmount,
  formatAmountForInput,
  formatBalance,
  formatDate,
  formatNumber,
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
