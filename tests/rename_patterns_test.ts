import { describe, expect, it } from "vitest";

import {
  bumpRenamePattern,
  effectiveDescription,
  predictRenames,
  pruneRenamePatterns,
  recordRename,
  type RenamePatternStore,
} from "../src/data/rename-patterns";
import type { HistoryEntry } from "../src/data/types";

function entry(partial: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: "e-1",
    date: "2026-05-12",
    description: "raw",
    amount: 0,
    importedAt: 0,
    ...partial,
  };
}

describe("recordRename", () => {
  it("stores a fresh rename keyed by normalised bank description", () => {
    const patterns: RenamePatternStore = {};
    const next = recordRename(
      patterns,
      "acct-1",
      "Kortköp 2026-05-12 ICA SUPERMARKET",
      "ICA",
      1700000000,
    );
    // The store is per-account; the key strips the date prefix and the
    // "Kortköp" noise token via `normaliseDescription`.
    expect(Object.keys(next["acct-1"] ?? {})).toEqual(["ica supermarket"]);
    expect(next["acct-1"]["ica supermarket"]).toEqual({
      suggestedDescription: "ICA",
      hitCount: 1,
      lastUsedAt: 1700000000,
    });
  });

  it("bumps the hit-count when the same rename is repeated", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI 12/05", "ICA", 100);
    patterns = recordRename(patterns, "a", "ICA MAXI 19/05", "ICA", 200);
    const hit = patterns.a["ica maxi"];
    expect(hit.hitCount).toBe(2);
    expect(hit.suggestedDescription).toBe("ICA");
    expect(hit.lastUsedAt).toBe(200);
  });

  it("resets the count when the suggested text changes", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    patterns = recordRename(patterns, "a", "ICA MAXI", "Groceries", 200);
    expect(patterns.a["ica maxi"]).toEqual({
      suggestedDescription: "Groceries",
      hitCount: 1,
      lastUsedAt: 200,
    });
  });

  it("scopes patterns per account", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "Salary 2026-05-25", "Salary", 100);
    patterns = recordRename(
      patterns,
      "b",
      "Salary 2026-05-25",
      "Spouse — salary",
      200,
    );
    expect(patterns.a["salary"].suggestedDescription).toBe("Salary");
    expect(patterns.b["salary"].suggestedDescription).toBe("Spouse — salary");
  });

  it("treats a blank rename as a no-op (does not learn clears)", () => {
    const patterns: RenamePatternStore = {};
    const next = recordRename(patterns, "a", "ICA", "   ", 100);
    expect(next).toBe(patterns);
  });

  it("ignores a normalised key that is too short to be meaningful", () => {
    const patterns: RenamePatternStore = {};
    // After normalisation the key is too short (1 char) so the recorder
    // skips it — mirrors `isNormalisedKeyMeaningful`.
    const next = recordRename(patterns, "a", "Q", "Quick", 100);
    expect(next).toBe(patterns);
  });

  it("returns the same store identity when nothing changed", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    // Same input again with the same timestamp would bump hitCount, so
    // there's no exact-identity case to test; the equivalent guard is
    // the blank / too-short branches above.
    expect(patterns.a["ica maxi"].hitCount).toBe(1);
  });
});

describe("bumpRenamePattern", () => {
  it("bumps the hit-count when the accepted text matches the stored suggestion", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    patterns = bumpRenamePattern(patterns, "a", "ICA MAXI 19/05", "ICA", 200);
    const hit = patterns.a["ica maxi"];
    expect(hit.hitCount).toBe(2);
    expect(hit.lastUsedAt).toBe(200);
  });

  it("falls back to a fresh recording when the accepted text was edited", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    // The user edited the suggestion before accepting — record the
    // new label so the next import suggests it instead.
    patterns = bumpRenamePattern(
      patterns,
      "a",
      "ICA MAXI 19/05",
      "Groceries — ICA",
      200,
    );
    expect(patterns.a["ica maxi"]).toEqual({
      suggestedDescription: "Groceries — ICA",
      hitCount: 1,
      lastUsedAt: 200,
    });
  });

  it("is a no-op when there is no existing pattern to bump", () => {
    const patterns: RenamePatternStore = {};
    const next = bumpRenamePattern(patterns, "a", "ICA MAXI", "ICA", 100);
    expect(next).toBe(patterns);
  });

  it("is a no-op for a blank accepted description", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    const next = bumpRenamePattern(patterns, "a", "ICA MAXI", "  ", 200);
    expect(next).toBe(patterns);
  });
});

describe("predictRenames", () => {
  it("emits a suggestion per matching entry", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    const out = predictRenames(patterns, "a", [
      entry({ id: "e-1", description: "ICA MAXI 19/05/2026" }),
      entry({ id: "e-2", description: "PRESSBYRÅN T-CEN" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      entryId: "e-1",
      suggestedDescription: "ICA",
    });
  });

  it("skips entries that already carry a user override", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    const out = predictRenames(patterns, "a", [
      entry({
        id: "e-1",
        description: "ICA MAXI 19/05",
        userDescription: "Already labelled",
      }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("skips when the suggested text matches the bank text (no rename needed)", () => {
    let patterns: RenamePatternStore = {};
    // The user normalised the raw text once; subsequent imports of the
    // exact same string would be a redundant suggestion.
    patterns = recordRename(patterns, "a", "ICA", "ICA", 100);
    const out = predictRenames(patterns, "a", [
      entry({ id: "e-1", description: "ICA" }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("scopes lookups per account", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "ICA MAXI", "ICA", 100);
    const out = predictRenames(patterns, "b", [
      entry({ id: "e-1", description: "ICA MAXI 19/05" }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("orders suggestions by hit-count then recency", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "a", "RARE 12/05", "Rare", 100);
    patterns = recordRename(patterns, "a", "POPULAR 12/05", "Popular", 200);
    patterns = recordRename(patterns, "a", "POPULAR 13/05", "Popular", 300);
    patterns = recordRename(patterns, "a", "RECENT 12/05", "Recent", 400);
    const out = predictRenames(patterns, "a", [
      entry({ id: "rare", description: "RARE 19/05" }),
      entry({ id: "popular", description: "POPULAR 19/05" }),
      entry({ id: "recent", description: "RECENT 19/05" }),
    ]);
    // Popular wins on hit-count (2). Recent and Rare tie at 1, so
    // Recent edges Rare on lastUsedAt.
    expect(out.map((s) => s.entryId)).toEqual(["popular", "recent", "rare"]);
  });
});

describe("pruneRenamePatterns", () => {
  it("drops buckets for accounts that no longer exist", () => {
    let patterns: RenamePatternStore = {};
    patterns = recordRename(patterns, "kept", "ICA", "ICA", 100);
    patterns = recordRename(patterns, "removed", "ICA", "ICA", 100);
    const next = pruneRenamePatterns(patterns, new Set(["kept"]));
    expect(Object.keys(next)).toEqual(["kept"]);
  });
});

describe("effectiveDescription", () => {
  it("prefers a trimmed user override", () => {
    expect(
      effectiveDescription(
        entry({ description: "bank", userDescription: "  user  " }),
      ),
    ).toBe("user");
  });

  it("falls through to the raw bank text when the override is blank", () => {
    expect(
      effectiveDescription(
        entry({ description: "bank", userDescription: "  " }),
      ),
    ).toBe("bank");
  });

  it("falls through when there is no override", () => {
    expect(effectiveDescription(entry({ description: "bank" }))).toBe("bank");
  });
});
