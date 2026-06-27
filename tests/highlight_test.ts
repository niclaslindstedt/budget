import { describe, expect, it } from "vitest";

import { matchPrefixRange } from "../src/utils/highlight";

describe("matchPrefixRange", () => {
  it("returns null for an empty or whitespace-only query", () => {
    expect(matchPrefixRange("Apoteket", "")).toBeNull();
    expect(matchPrefixRange("Apoteket", "   ")).toBeNull();
  });

  it("matches a case-insensitive prefix", () => {
    expect(matchPrefixRange("Apoteket", "apo")).toEqual({ start: 0, end: 3 });
    expect(matchPrefixRange("apoteket", "APO")).toEqual({ start: 0, end: 3 });
  });

  it("returns null when the label does not start with the query", () => {
    expect(matchPrefixRange("Kronans Apotek", "apo")).toBeNull();
  });

  it("skips leading whitespace the matcher ignores", () => {
    // The matcher compares against the trimmed label, so a leading
    // space in the label must not throw the highlight off by one.
    expect(matchPrefixRange("  Apoteket", "apo")).toEqual({ start: 2, end: 5 });
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(matchPrefixRange("Apoteket", " ap ")).toEqual({ start: 0, end: 2 });
  });

  it("can match the whole label", () => {
    expect(matchPrefixRange("ICA", "ica")).toEqual({ start: 0, end: 3 });
  });
});
