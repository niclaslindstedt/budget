import { describe, expect, it } from "vitest";

import { derivePatternFromDescription } from "../src/data/budget/pattern-derive";
import { compilePattern } from "../src/data/match-rules";

describe("derivePatternFromDescription", () => {
  it("returns an empty pattern for an empty description", () => {
    expect(derivePatternFromDescription("")).toBe("");
    expect(derivePatternFromDescription("   ")).toBe("");
  });

  it("strips ISO dates and wraps the merchant with stars", () => {
    expect(derivePatternFromDescription("ICA KVANTUM 2024-05-12")).toBe(
      "*ICA KVANTUM*",
    );
  });

  it("strips a leading ISO date (bank-export shape)", () => {
    // Skandia and similar banks ship `<date> <merchant>` history lines.
    // The Label-similar modal must strip the date so the seed pattern
    // matches future imports rather than only this one transaction. The
    // comma between merchant words becomes a wildcard, not a literal
    // space — the pattern is matched against the raw bank text, which
    // still carries the comma.
    expect(
      derivePatternFromDescription("2026-05-11 Apoteket Tranan, Vänersborg"),
    ).toBe("*Apoteket Tranan*Vänersborg*");
  });

  it("produces a pattern that matches its own source despite punctuation", () => {
    // Regression: the deriver stripped the comma from the pattern but
    // matching runs against the raw bank text that still has it, so a
    // literal "SU VANERSBORG" never matched "SU, VANERSBORG" and the
    // "label N similar" offer silently stayed at zero. The comma's slot
    // is now a wildcard.
    const source = "2026-04-01 HEMKOP VANERSBORG SU, VANERSBORG";
    const lookalike = "2026-04-02 HEMKOP VANERSBORG SU, VANERSBORG";
    const pattern = derivePatternFromDescription(source);
    expect(pattern).toBe("*HEMKOP VANERSBORG SU*VANERSBORG*");
    expect(compilePattern(pattern).test(source)).toBe(true);
    expect(compilePattern(pattern).test(lookalike)).toBe(true);
  });

  it("strips slash and dot dates", () => {
    expect(derivePatternFromDescription("SPOTIFY 12/05/2024")).toBe(
      "*SPOTIFY*",
    );
    expect(derivePatternFromDescription("SPOTIFY 12.05")).toBe("*SPOTIFY*");
  });

  it("strips Swedish and English month names at word boundaries", () => {
    expect(derivePatternFromDescription("Hyra maj 2024")).toBe("*Hyra*");
    expect(derivePatternFromDescription("Rent May 2024")).toBe("*Rent*");
  });

  it("does not strip month tokens that are substrings of merchant names", () => {
    // "MAJOR" contains "MAJ" but should not match because of the word
    // boundary in the regex.
    expect(derivePatternFromDescription("MAJOR TOM")).toBe("*MAJOR TOM*");
  });

  it("strips card-tail markers", () => {
    expect(derivePatternFromDescription("STORE ****1234")).toBe("*STORE*");
    expect(derivePatternFromDescription("STORE XXXX5678")).toBe("*STORE*");
  });

  it("strips reference numbers and hash refs", () => {
    expect(derivePatternFromDescription("ICA REF: 9988")).toBe("*ICA*");
    expect(derivePatternFromDescription("ICA #4823")).toBe("*ICA*");
    expect(derivePatternFromDescription("ICA VERIFIKAT 12345")).toBe("*ICA*");
  });

  it("strips long digit runs but keeps short numeric merchant suffixes", () => {
    expect(derivePatternFromDescription("ACCOUNT 123456789")).toBe("*ACCOUNT*");
    expect(derivePatternFromDescription("STORE 24")).toBe("*STORE*");
  });

  it("falls back to wrapping the original when stripping leaves nothing", () => {
    // Pure date + ref leaves an empty core; we still emit a working
    // seed pattern so the user has something to sharpen.
    expect(derivePatternFromDescription("2024-05-12 #4823")).toBe(
      "*2024-05-12 #4823*",
    );
  });
});
