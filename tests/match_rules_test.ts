import { describe, expect, it } from "vitest";

import {
  compilePattern,
  findMatchingRule,
  ruleMatchesEntry,
} from "../src/data/match-rules";
import type { HistoryEntry, MatchRule } from "../src/data/types";

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: overrides.id ?? "e",
    date: overrides.date ?? "2026-05-01",
    description: overrides.description ?? "",
    amount: overrides.amount ?? -100,
    balance: overrides.balance ?? 0,
    importedAt: overrides.importedAt ?? 1,
    ...overrides,
  };
}

function rule(overrides: Partial<MatchRule>): MatchRule {
  return {
    id: overrides.id ?? "r",
    pattern: overrides.pattern ?? "*",
    ...overrides,
  };
}

describe("compilePattern", () => {
  it("matches case-insensitively and treats * as any-run", () => {
    const re = compilePattern("*App Store*");
    expect(re.test("APP STORE *Z123")).toBe(true);
    expect(re.test("MyApp Store")).toBe(true);
    expect(re.test("ICA Maxi")).toBe(false);
  });

  it("escapes regex metacharacters so literal punctuation matches literally", () => {
    const re = compilePattern("*ICA.SE*");
    expect(re.test("ica.se 12345")).toBe(true);
    // Without escaping, `.` would also match `,` — assert it doesn't.
    expect(re.test("icaXse 12345")).toBe(false);
  });

  it("anchors the pattern implicitly", () => {
    const re = compilePattern("App Store");
    expect(re.test("App Store")).toBe(true);
    expect(re.test("App Store extras")).toBe(false);
  });

  it("treats empty * as matching anything (including empty)", () => {
    expect(compilePattern("*").test("")).toBe(true);
    expect(compilePattern("*").test("anything")).toBe(true);
  });

  it("treats ? as exactly one character", () => {
    const re = compilePattern("?LA*");
    expect(re.test("BLA")).toBe(true);
    expect(re.test("BLAH")).toBe(true);
    expect(re.test("LAB")).toBe(false);
    // ? must consume exactly one — empty prefix doesn't match.
    expect(re.test("LA")).toBe(false);
  });

  it("composes ? and * in the same pattern", () => {
    const re = compilePattern("*ICA?MAXI*");
    expect(re.test("KORTKÖP ICA MAXI 11-04")).toBe(true);
    expect(re.test("KORTKÖP ICA-MAXI 11-04")).toBe(true);
    // ? requires one char between ICA and MAXI; "ICAMAXI" has none.
    expect(re.test("KORTKÖP ICAMAXI 11-04")).toBe(false);
  });
});

describe("ruleMatchesEntry — amountSign", () => {
  it("any matches both directions", () => {
    const r = rule({ pattern: "*", amountSign: "any" });
    expect(ruleMatchesEntry(r, entry({ amount: -1 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: 1 }))).toBe(true);
  });

  it("negative excludes positive amounts", () => {
    const r = rule({ pattern: "*", amountSign: "negative" });
    expect(ruleMatchesEntry(r, entry({ amount: -1 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: 1 }))).toBe(false);
  });

  it("positive excludes negative amounts", () => {
    const r = rule({ pattern: "*", amountSign: "positive" });
    expect(ruleMatchesEntry(r, entry({ amount: -1 }))).toBe(false);
    expect(ruleMatchesEntry(r, entry({ amount: 1 }))).toBe(true);
  });
});

describe("ruleMatchesEntry — amountMin / amountMax", () => {
  it("includes entries inside the band", () => {
    const r = rule({ pattern: "*", amountMin: -380, amountMax: -250 });
    expect(ruleMatchesEntry(r, entry({ amount: -300 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: -250 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: -380 }))).toBe(true);
  });

  it("excludes entries below the lower bound", () => {
    const r = rule({ pattern: "*", amountMin: -380, amountMax: -250 });
    expect(ruleMatchesEntry(r, entry({ amount: -500 }))).toBe(false);
  });

  it("excludes entries above the upper bound", () => {
    const r = rule({ pattern: "*", amountMin: -380, amountMax: -250 });
    expect(ruleMatchesEntry(r, entry({ amount: -100 }))).toBe(false);
  });

  it("treats a missing lower bound as open-ended (no floor)", () => {
    const r = rule({ pattern: "*", amountMax: 100 });
    expect(ruleMatchesEntry(r, entry({ amount: -1_000_000 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: 100 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: 101 }))).toBe(false);
  });

  it("treats a missing upper bound as open-ended (no ceiling)", () => {
    const r = rule({ pattern: "*", amountMin: 100 });
    expect(ruleMatchesEntry(r, entry({ amount: 100 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: 1_000_000 }))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ amount: 99 }))).toBe(false);
  });

  it("composes with amountSign — both filters must pass", () => {
    const r = rule({
      pattern: "*",
      amountSign: "negative",
      amountMin: -380,
      amountMax: -250,
    });
    expect(ruleMatchesEntry(r, entry({ amount: -300 }))).toBe(true);
    // In-band by value but the sign filter rejects positives.
    expect(ruleMatchesEntry(r, entry({ amount: 300 }))).toBe(false);
  });

  it("matches exact-mode rules where amountMin === amountMax", () => {
    // The "Exact" UI mode persists as a single-value band so the
    // matcher needs no special branch — assert the collapse works.
    const exact = rule({
      pattern: "*APPLE*",
      amountMin: -39,
      amountMax: -39,
    });
    expect(
      ruleMatchesEntry(
        exact,
        entry({ description: "APPLE.COM/BILL", amount: -39 }),
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntry(
        exact,
        entry({ description: "APPLE.COM/BILL", amount: -129 }),
      ),
    ).toBe(false);
    expect(
      ruleMatchesEntry(
        exact,
        entry({ description: "APPLE.COM/BILL", amount: 39 }),
      ),
    ).toBe(false);
  });
});

describe("ruleMatchesEntry — transferFilter", () => {
  it("any ignores the collapse marker", () => {
    const r = rule({ pattern: "*", transferFilter: "any" });
    expect(ruleMatchesEntry(r, entry({}))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ collapsedIntoTransferId: "t1" }))).toBe(
      true,
    );
  });

  it("exclude skips entries collapsed into a transfer", () => {
    const r = rule({ pattern: "*", transferFilter: "exclude" });
    expect(ruleMatchesEntry(r, entry({}))).toBe(true);
    expect(ruleMatchesEntry(r, entry({ collapsedIntoTransferId: "t1" }))).toBe(
      false,
    );
  });

  it("only matches exclusively the collapsed entries", () => {
    const r = rule({ pattern: "*", transferFilter: "only" });
    expect(ruleMatchesEntry(r, entry({}))).toBe(false);
    expect(ruleMatchesEntry(r, entry({ collapsedIntoTransferId: "t1" }))).toBe(
      true,
    );
  });
});

describe("ruleMatchesEntry — pattern + filter interplay", () => {
  it("a BAUHAUS rule scoped to negative purchases skips a positive refund and a transfer", () => {
    const r = rule({
      pattern: "*BAUHAUS*",
      amountSign: "negative",
      transferFilter: "exclude",
    });
    expect(
      ruleMatchesEntry(
        r,
        entry({ description: "KORTKÖP BAUHAUS 11-04", amount: -495 }),
      ),
    ).toBe(true);
    expect(
      ruleMatchesEntry(
        r,
        entry({ description: "BAUHAUS REFUND", amount: 200 }),
      ),
    ).toBe(false);
    expect(
      ruleMatchesEntry(
        r,
        entry({
          description: "BAUHAUS internal swish",
          amount: -100,
          collapsedIntoTransferId: "tx",
        }),
      ),
    ).toBe(false);
  });

  it("returns false on an empty pattern even with a permissive filter", () => {
    expect(
      ruleMatchesEntry(rule({ pattern: "" }), entry({ description: "foo" })),
    ).toBe(false);
  });
});

describe("findMatchingRule", () => {
  it("returns the first matching rule in array order so specific layers win over catch-alls", () => {
    const specific = rule({ id: "specific", pattern: "*Mobil*" });
    const catchAll = rule({ id: "catch-all", pattern: "*App*" });
    const e = entry({ description: "App Store Mobil 123" });
    expect(findMatchingRule([specific, catchAll], e)?.id).toBe("specific");
    expect(findMatchingRule([catchAll, specific], e)?.id).toBe("catch-all");
  });

  it("returns null when nothing matches", () => {
    const r = rule({ pattern: "*never*" });
    expect(
      findMatchingRule([r], entry({ description: "App Store" })),
    ).toBeNull();
  });
});
