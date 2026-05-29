import { describe, expect, it } from "vitest";

import {
  applyMatchRuleOnceToBudget,
  applyMatchRuleOnceToHistory,
  reapplyPatternsToBudget,
} from "../src/data/budget/pattern-apply";
import { mergeTagIds } from "../src/data/match-rules";
import { createDefaultAccountBudget } from "../src/data/sheet-types";
import { findColumnByType } from "../src/data/sheet";
import type { HistoryEntry, MatchRule, Row } from "../src/data/types";

const ACCOUNT_ID = "acc-1";

function rowWith(descId: string, description: string, tagIds?: string[]): Row {
  const row: Row = {
    id: `row-${description}`,
    cells: { [descId]: description },
  };
  if (tagIds) row.tagIds = tagIds;
  return row;
}

describe("mergeTagIds", () => {
  it("appends only the rule's new tags, preserving existing order", () => {
    expect(mergeTagIds(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("returns the original reference when the rule adds nothing new", () => {
    const existing = ["a", "b"];
    expect(mergeTagIds(existing, ["a"])).toBe(existing);
    expect(mergeTagIds(existing, [])).toBe(existing);
    expect(mergeTagIds(existing, undefined)).toBe(existing);
  });

  it("seeds from an empty base when the row has no tags yet", () => {
    expect(mergeTagIds(undefined, ["a"])).toEqual(["a"]);
  });
});

describe("rule tags applied to budget rows", () => {
  const item = createDefaultAccountBudget(ACCOUNT_ID);
  const descId = findColumnByType(item.columns, "description")!.id;

  it("unions a rule's tags onto a matching row via apply-once", () => {
    const seeded = {
      ...item,
      rows: [rowWith(descId, "ICA Supermarket", ["keep"])],
    };
    const rule: MatchRule = {
      id: "r1",
      pattern: "*ICA*",
      tagIds: ["groceries"],
    };
    const next = applyMatchRuleOnceToBudget(seeded, rule);
    expect(next.rows[0].tagIds).toEqual(["keep", "groceries"]);
  });

  it("applies a tags-only rule via reapply (no type required)", () => {
    const seeded = { ...item, rows: [rowWith(descId, "Spotify")] };
    const rule: MatchRule = {
      id: "r1",
      pattern: "*Spotify*",
      tagIds: ["subs"],
    };
    const next = reapplyPatternsToBudget(seeded, [rule]);
    expect(next.rows[0].tagIds).toEqual(["subs"]);
  });

  it("is a no-op when the row already carries every rule tag", () => {
    const seeded = { ...item, rows: [rowWith(descId, "Spotify", ["subs"])] };
    const rule: MatchRule = {
      id: "r1",
      pattern: "*Spotify*",
      tagIds: ["subs"],
    };
    expect(reapplyPatternsToBudget(seeded, [rule])).toBe(seeded);
  });
});

describe("rule tags applied to history entries", () => {
  const entry: HistoryEntry = {
    id: "h1",
    date: "2026-04-12",
    description: "SPOTIFY P1234",
    amount: -119,
    importedAt: 1,
  };

  it("stamps userTagIds onto every matching entry via apply-once", () => {
    const rule: MatchRule = {
      id: "r1",
      pattern: "*SPOTIFY*",
      tagIds: ["subs"],
    };
    const next = applyMatchRuleOnceToHistory({ [ACCOUNT_ID]: [entry] }, rule);
    expect(next[ACCOUNT_ID][0].userTagIds).toEqual(["subs"]);
  });

  it("unions with the entry's pre-existing userTagIds", () => {
    const seeded: HistoryEntry = { ...entry, userTagIds: ["keep"] };
    const rule: MatchRule = {
      id: "r1",
      pattern: "*SPOTIFY*",
      tagIds: ["subs"],
    };
    const next = applyMatchRuleOnceToHistory({ [ACCOUNT_ID]: [seeded] }, rule);
    expect(next[ACCOUNT_ID][0].userTagIds).toEqual(["keep", "subs"]);
  });
});
