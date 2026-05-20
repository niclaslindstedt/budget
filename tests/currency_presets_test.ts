import { afterEach, describe, expect, it } from "vitest";

import { CURRENCY_PRESETS, REGION_TO_CURRENCY_ID } from "../src/data/constants";
import { detectInitialCurrency } from "../src/i18n/locale";

describe("CURRENCY_PRESETS", () => {
  it("has unique ids", () => {
    const ids = CURRENCY_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has well-formed entries", () => {
    for (const p of CURRENCY_PRESETS) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.codes.length).toBeGreaterThan(0);
      for (const code of p.codes) {
        expect(code.length).toBeGreaterThan(0);
      }
      expect(p.symbol.length).toBeGreaterThan(0);
      expect(["before", "after"]).toContain(p.position);
      expect(typeof p.space).toBe("boolean");
      expect(p.nameKey.startsWith("settings.format.currencyName.")).toBe(true);
    }
  });

  it("REGION_TO_CURRENCY_ID only references known preset ids", () => {
    const ids = new Set(CURRENCY_PRESETS.map((p) => p.id));
    for (const [region, id] of Object.entries(REGION_TO_CURRENCY_ID)) {
      expect(ids.has(id), `region ${region} → unknown preset ${id}`).toBe(true);
    }
  });

  // Presets that render identically (same symbol, position, spacing)
  // are collapsed into a single entry whose `codes` list joins the
  // covered ISO codes. Keeps the picker short and avoids the false
  // impression that picking SEK vs NOK changes anything about how
  // amounts are stored or formatted.
  it("has no two presets sharing the same display triplet", () => {
    const groups = new Map<string, string[]>();
    for (const p of CURRENCY_PRESETS) {
      const key = `${p.symbol}|${p.position}|${p.space}`;
      const ids = groups.get(key) ?? [];
      ids.push(p.id);
      groups.set(key, ids);
    }
    const collisions = [...groups.values()].filter((ids) => ids.length > 1);
    expect(collisions).toEqual([]);
  });

  it("collapses the kronor and dollar presets", () => {
    const nordic = CURRENCY_PRESETS.find((p) => p.id === "nordic-kr");
    expect(nordic?.codes).toEqual(["SEK", "NOK", "DKK", "ISK"]);
    expect(nordic?.symbol).toBe("kr");

    const dollar = CURRENCY_PRESETS.find((p) => p.id === "dollar");
    expect(dollar?.codes).toEqual(["USD", "CAD"]);
    expect(dollar?.symbol).toBe("$");
  });
});

describe("detectInitialCurrency", () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

  function setLanguage(value: string | undefined) {
    Object.defineProperty(globalThis, "navigator", {
      value: value === undefined ? {} : { language: value },
      configurable: true,
    });
  }

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalDescriptor);
    } else {
      // The original environment had no navigator — wipe ours.
      Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  it("picks SEK for sv-SE", () => {
    setLanguage("sv-SE");
    expect(detectInitialCurrency()).toEqual({
      currency: "kr",
      currencyPosition: "after",
      currencySpace: true,
    });
  });

  it("picks USD for en-US", () => {
    setLanguage("en-US");
    expect(detectInitialCurrency()).toEqual({
      currency: "$",
      currencyPosition: "before",
      currencySpace: false,
    });
  });

  it("picks GBP for en-GB", () => {
    setLanguage("en-GB");
    expect(detectInitialCurrency()).toEqual({
      currency: "£",
      currencyPosition: "before",
      currencySpace: false,
    });
  });

  it("picks CHF for de-CH", () => {
    setLanguage("de-CH");
    expect(detectInitialCurrency()).toEqual({
      currency: "CHF",
      currencyPosition: "before",
      currencySpace: true,
    });
  });

  it("picks EUR for fi-FI (Finland)", () => {
    setLanguage("fi-FI");
    expect(detectInitialCurrency()).toEqual({
      currency: "€",
      currencyPosition: "before",
      currencySpace: false,
    });
  });

  it("falls back to USD for unmapped regions", () => {
    setLanguage("ja-JP");
    expect(detectInitialCurrency()).toEqual({
      currency: "$",
      currencyPosition: "before",
      currencySpace: false,
    });
  });

  it("falls back to USD when the language tag has no region", () => {
    setLanguage("en");
    expect(detectInitialCurrency()).toEqual({
      currency: "$",
      currencyPosition: "before",
      currencySpace: false,
    });
  });

  it("falls back to USD when navigator.language is undefined", () => {
    setLanguage(undefined);
    expect(detectInitialCurrency()).toEqual({
      currency: "$",
      currencyPosition: "before",
      currencySpace: false,
    });
  });
});
