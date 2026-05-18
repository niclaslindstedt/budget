import { describe, expect, it } from "vitest";

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../src/data/description-normaliser";

describe("normaliseDescription", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normaliseDescription("  Spotify   Premium  ")).toBe(
      "spotify premium",
    );
  });

  it("strips ISO dates", () => {
    expect(normaliseDescription("Kortköp 2026-05-01 ICA Maxi")).toBe(
      "ica maxi",
    );
  });

  it("strips short dates with various separators", () => {
    expect(normaliseDescription("Coffee 16/5")).toBe("coffee");
    expect(normaliseDescription("Coffee 16/05/2026")).toBe("coffee");
    expect(normaliseDescription("Coffee 16.05.2026")).toBe("coffee");
  });

  it("strips long digit sequences (reference numbers)", () => {
    expect(normaliseDescription("Spotify *1234567")).toBe("spotify");
    expect(normaliseDescription("AMAZON.SE REF 9876543210")).toBe("amazon se");
  });

  it("strips trailing currency tokens", () => {
    // Short amount numbers (≤3 digits) are not generally swept — only
    // the currency suffix is. That's fine because the same merchant
    // tends to either always or never carry an amount suffix, so the
    // pair still collapses to the same key.
    expect(normaliseDescription("Netflix SEK")).toBe("netflix");
    expect(normaliseDescription("Restaurant kr")).toBe("restaurant");
  });

  it("maps cosmetic variations to the same key", () => {
    const a = normaliseDescription("SPOTIFY *abcd");
    const b = normaliseDescription("Spotify *ABCD123456");
    expect(a).toBe(b);
  });

  it("strips Swedish bank-noise prefixes", () => {
    expect(normaliseDescription("Kortköp Pressbyrån T-Centralen")).toBe(
      "pressbyrån t centralen",
    );
    expect(normaliseDescription("ÖVERFÖRING TILL SPARKONTO")).toBe(
      "till sparkonto",
    );
  });

  it("returns empty string when input has no signal", () => {
    expect(normaliseDescription("  ---  ")).toBe("");
    expect(normaliseDescription("123456789")).toBe("");
  });
});

describe("isNormalisedKeyMeaningful", () => {
  it("rejects keys shorter than 3 characters", () => {
    expect(isNormalisedKeyMeaningful("")).toBe(false);
    expect(isNormalisedKeyMeaningful("a")).toBe(false);
    expect(isNormalisedKeyMeaningful("ab")).toBe(false);
  });
  it("accepts keys of three or more characters", () => {
    expect(isNormalisedKeyMeaningful("abc")).toBe(true);
    expect(isNormalisedKeyMeaningful("spotify")).toBe(true);
  });
});
