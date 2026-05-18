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

describe("ruleMatchesEntry — transferFilter", () => {
  it("any ignores the collapse marker", () => {
    const r = rule({ pattern: "*", transferFilter: "any" });
    expect(ruleMatchesEntry(r, entry({}))).toBe(true);
    expect(
      ruleMatchesEntry(r, entry({ collapsedIntoTransactionId: "t1" })),
    ).toBe(true);
  });

  it("exclude skips entries collapsed into a transaction", () => {
    const r = rule({ pattern: "*", transferFilter: "exclude" });
    expect(ruleMatchesEntry(r, entry({}))).toBe(true);
    expect(
      ruleMatchesEntry(r, entry({ collapsedIntoTransactionId: "t1" })),
    ).toBe(false);
  });

  it("only matches exclusively the collapsed entries", () => {
    const r = rule({ pattern: "*", transferFilter: "only" });
    expect(ruleMatchesEntry(r, entry({}))).toBe(false);
    expect(
      ruleMatchesEntry(r, entry({ collapsedIntoTransactionId: "t1" })),
    ).toBe(true);
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
          collapsedIntoTransactionId: "tx",
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
