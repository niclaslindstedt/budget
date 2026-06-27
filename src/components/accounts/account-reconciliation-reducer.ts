import type { MatchCandidate, OrphanRow } from "../../data/reconciliation";
import type { SeriesMatchRule } from "../../data/types";

export type OrphanDecision =
  | { action: "keep" }
  | { action: "delete" }
  | { action: "move"; toDate: string };

// Combined modal state held inside `AccountReconciliationModal`. The
// whole slice runs through `reconciliationReducer` below so every
// transition (toggle a candidate, attach a series rule, set an orphan
// decision, bulk-edit every orphan) corresponds to one named action —
// instead of five parallel `useState` setters where `applyToSeries`
// had to fire three `setState`s in sequence to keep the rule, the
// expanded candidates, and the checked set in agreement.
export type ReconciliationState = {
  showInfo: boolean;
  checked: ReadonlySet<string>;
  seriesRulesById: ReadonlyMap<string, SeriesMatchRule>;
  seriesExpansions: readonly MatchCandidate[];
  orphanDecisions: ReadonlyMap<string, OrphanDecision>;
};

// Named transitions. `applyToSeries` carries the pre-computed rule and
// expansion candidates so the reducer stays pure — the lookups
// (`inferSeriesRule`, `expandToSeries`) need props the reducer doesn't
// see, so the call site computes them and hands the result over for
// the atomic state update.
export type ReconciliationAction =
  | { kind: "toggleInfo" }
  | { kind: "toggleCandidate"; key: string }
  | { kind: "setAllCandidates"; keys: readonly string[]; checked: boolean }
  | {
      kind: "applyToSeries";
      seriesId: string;
      rule: SeriesMatchRule;
      moreCandidates: readonly MatchCandidate[];
    }
  | { kind: "setOrphan"; rowId: string; decision: OrphanDecision }
  | { kind: "setAllOrphans"; decisions: ReadonlyMap<string, OrphanDecision> };

export type ReconciliationInit = {
  candidates: readonly MatchCandidate[];
  orphans: readonly OrphanRow[];
};

export function candidateKey(c: MatchCandidate): string {
  return `${c.rowId}|${c.historyEntryId}`;
}

export function initialReconciliationState({
  candidates,
  orphans,
}: ReconciliationInit): ReconciliationState {
  const checked = new Set<string>();
  for (const c of candidates) {
    if (c.confidence === "high") checked.add(candidateKey(c));
  }
  const orphanDecisions = new Map<string, OrphanDecision>();
  for (const o of orphans) orphanDecisions.set(o.rowId, { action: "keep" });
  return {
    showInfo: false,
    checked,
    seriesRulesById: new Map(),
    seriesExpansions: [],
    orphanDecisions,
  };
}

export function reconciliationReducer(
  state: ReconciliationState,
  action: ReconciliationAction,
): ReconciliationState {
  switch (action.kind) {
    case "toggleInfo":
      return { ...state, showInfo: !state.showInfo };
    case "toggleCandidate": {
      const next = new Set(state.checked);
      if (next.has(action.key)) next.delete(action.key);
      else next.add(action.key);
      return { ...state, checked: next };
    }
    case "setAllCandidates": {
      const next = new Set(state.checked);
      if (action.checked) for (const k of action.keys) next.add(k);
      else for (const k of action.keys) next.delete(k);
      return { ...state, checked: next };
    }
    case "applyToSeries": {
      if (state.seriesRulesById.has(action.seriesId)) return state;
      const nextRules = new Map(state.seriesRulesById);
      nextRules.set(action.seriesId, action.rule);
      const nextChecked = new Set(state.checked);
      for (const c of action.moreCandidates) nextChecked.add(candidateKey(c));
      return {
        ...state,
        seriesRulesById: nextRules,
        seriesExpansions: [...state.seriesExpansions, ...action.moreCandidates],
        checked: nextChecked,
      };
    }
    case "setOrphan": {
      const next = new Map(state.orphanDecisions);
      next.set(action.rowId, action.decision);
      return { ...state, orphanDecisions: next };
    }
    case "setAllOrphans":
      return { ...state, orphanDecisions: action.decisions };
  }
}
