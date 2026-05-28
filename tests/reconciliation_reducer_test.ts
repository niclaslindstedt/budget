import { describe, expect, it } from "vitest";

import {
  initialReconciliationState,
  reconciliationReducer,
} from "../src/components/accounts/account-reconciliation-reducer";
import type { MatchCandidate, OrphanRow } from "../src/data/reconciliation";
import type { SeriesMatchRule } from "../src/data/types";

function candidate(over: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    rowId: "r1",
    historyEntryId: "h1",
    amountDelta: 0,
    dateLagDays: 0,
    confidence: "low",
    seriesId: null,
    ...over,
  };
}

function key(c: MatchCandidate): string {
  return `${c.rowId}|${c.historyEntryId}`;
}

const stubRule: SeriesMatchRule = {
  id: "rule-1",
  seriesId: "series-A",
  pattern: "*SPOTIFY*",
  amountTolerancePct: 0,
  dateLagDays: 0,
};

describe("initialReconciliationState", () => {
  it("pre-checks high-confidence candidates and defaults orphans to keep", () => {
    const candidates = [
      candidate({ rowId: "r1", historyEntryId: "h1", confidence: "high" }),
      candidate({ rowId: "r2", historyEntryId: "h2", confidence: "low" }),
    ];
    const orphans: OrphanRow[] = [
      { rowId: "x1", monthKey: "2026-03" },
      { rowId: "x2", monthKey: "2026-04" },
    ];
    const state = initialReconciliationState({ candidates, orphans });
    expect(state.showInfo).toBe(false);
    expect(state.checked.has(key(candidates[0]!))).toBe(true);
    expect(state.checked.has(key(candidates[1]!))).toBe(false);
    expect(state.seriesRulesById.size).toBe(0);
    expect(state.seriesExpansions).toEqual([]);
    expect(state.orphanDecisions.get("x1")).toEqual({ action: "keep" });
    expect(state.orphanDecisions.get("x2")).toEqual({ action: "keep" });
  });
});

describe("reconciliationReducer", () => {
  it("toggles the info flag", () => {
    const init = initialReconciliationState({ candidates: [], orphans: [] });
    const after = reconciliationReducer(init, { kind: "toggleInfo" });
    expect(after.showInfo).toBe(true);
    const again = reconciliationReducer(after, { kind: "toggleInfo" });
    expect(again.showInfo).toBe(false);
  });

  it("toggles a candidate's checked state", () => {
    const init = initialReconciliationState({ candidates: [], orphans: [] });
    const on = reconciliationReducer(init, {
      kind: "toggleCandidate",
      key: "r1|h1",
    });
    expect(on.checked.has("r1|h1")).toBe(true);
    const off = reconciliationReducer(on, {
      kind: "toggleCandidate",
      key: "r1|h1",
    });
    expect(off.checked.has("r1|h1")).toBe(false);
  });

  it("attaches a series rule and checks every expansion candidate atomically", () => {
    const init = initialReconciliationState({ candidates: [], orphans: [] });
    const more = [
      candidate({ rowId: "r2", historyEntryId: "h2" }),
      candidate({ rowId: "r3", historyEntryId: "h3" }),
    ];
    const after = reconciliationReducer(init, {
      kind: "applyToSeries",
      seriesId: "series-A",
      rule: stubRule,
      moreCandidates: more,
    });
    expect(after.seriesRulesById.get("series-A")).toBe(stubRule);
    expect(after.seriesExpansions).toEqual(more);
    expect(after.checked.has(key(more[0]!))).toBe(true);
    expect(after.checked.has(key(more[1]!))).toBe(true);
  });

  it("ignores a duplicate applyToSeries for the same seriesId", () => {
    const init = initialReconciliationState({ candidates: [], orphans: [] });
    const after = reconciliationReducer(init, {
      kind: "applyToSeries",
      seriesId: "series-A",
      rule: stubRule,
      moreCandidates: [],
    });
    const again = reconciliationReducer(after, {
      kind: "applyToSeries",
      seriesId: "series-A",
      rule: { ...stubRule, id: "rule-2" },
      moreCandidates: [candidate({ rowId: "r9", historyEntryId: "h9" })],
    });
    expect(again).toBe(after);
  });

  it("sets a single orphan decision without disturbing siblings", () => {
    const init = initialReconciliationState({
      candidates: [],
      orphans: [
        { rowId: "x1", monthKey: "2026-03" },
        { rowId: "x2", monthKey: "2026-04" },
      ],
    });
    const after = reconciliationReducer(init, {
      kind: "setOrphan",
      rowId: "x1",
      decision: { action: "move", toDate: "2026-04-01" },
    });
    expect(after.orphanDecisions.get("x1")).toEqual({
      action: "move",
      toDate: "2026-04-01",
    });
    expect(after.orphanDecisions.get("x2")).toEqual({ action: "keep" });
  });

  it("replaces all orphan decisions in one shot", () => {
    const init = initialReconciliationState({
      candidates: [],
      orphans: [
        { rowId: "x1", monthKey: "2026-03" },
        { rowId: "x2", monthKey: "2026-04" },
      ],
    });
    const decisions = new Map<string, { action: "delete" }>([
      ["x1", { action: "delete" }],
      ["x2", { action: "delete" }],
    ]);
    const after = reconciliationReducer(init, {
      kind: "setAllOrphans",
      decisions,
    });
    expect(after.orphanDecisions).toBe(decisions);
  });
});
