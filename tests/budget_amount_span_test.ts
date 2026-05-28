import { describe, expect, it } from "vitest";

import {
  amountModeFromRow,
  resolveAmountSpan,
  spanInputStringsFromBounds,
} from "../src/components/budget/budget-amount-span";
import type { Settings } from "../src/data/types";

// Only the decimal separator matters for these conversions.
const settings = { decimalSeparator: "." } as unknown as Settings;

describe("resolveAmountSpan", () => {
  it("exact mode returns the signed amount and no band", () => {
    expect(resolveAmountSpan("exact", false, "800", "", "")).toEqual({
      amount: 800,
      amountMin: null,
      amountMax: null,
    });
    expect(resolveAmountSpan("exact", true, "800", "600", "1200")).toEqual({
      amount: -800,
      amountMin: null,
      amountMax: null,
    });
  });

  it("estimate mode orders a positive band low→high", () => {
    expect(
      resolveAmountSpan("estimate", false, "5500", "5000", "6000"),
    ).toEqual({ amount: 5500, amountMin: 5000, amountMax: 6000 });
  });

  it("estimate mode signs and orders a negative band", () => {
    // Magnitudes min=600 / max=1200 become signed bounds −1200…−600 so
    // amountMin <= amountMax holds for the expense.
    expect(resolveAmountSpan("estimate", true, "800", "600", "1200")).toEqual({
      amount: -800,
      amountMin: -1200,
      amountMax: -600,
    });
  });

  it("estimate mode drops an incomplete band", () => {
    expect(resolveAmountSpan("estimate", true, "800", "600", "")).toEqual({
      amount: -800,
      amountMin: null,
      amountMax: null,
    });
  });

  it("round-trips bounds back into min/max input strings", () => {
    const { amountMin, amountMax } = resolveAmountSpan(
      "estimate",
      true,
      "800",
      "600",
      "1200",
    );
    const strings = spanInputStringsFromBounds(
      amountMin!,
      amountMax!,
      settings,
    );
    expect(strings).toEqual({ min: "600", max: "1200" });
  });
});

describe("amountModeFromRow", () => {
  it("is estimate only when both bounds are present", () => {
    expect(amountModeFromRow(-1200, -600)).toBe("estimate");
    expect(amountModeFromRow(undefined, undefined)).toBe("exact");
    expect(amountModeFromRow(-1200, undefined)).toBe("exact");
  });
});
