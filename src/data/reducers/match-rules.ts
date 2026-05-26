import {
  applyMatchRuleOnceToAllSheets,
  applyMatchRuleOnceToHistory,
  reapplyPatternsToAllSheets,
} from "../pattern-apply";
import type { Action } from "../reducer";
import type { UserData } from "../types";

export function reduceMatchRules(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "clearMerchantHints") {
    if (Object.keys(state.merchantHints).length === 0) return state;
    return { ...state, merchantHints: {} };
  }
  if (action.type === "createMatchRule") {
    // Append, not prepend: rules earlier in the array win, and a
    // fresh rule should defer to whatever the user already set up
    // unless they reorder. The Patterns tab's up/down buttons go
    // through `moveMatchRule` to promote a new rule above its
    // current shadower.
    const matchRules = [...state.matchRules, action.rule];
    // Walk every budget row and re-evaluate against the new ruleset
    // so a freshly authored pattern catches up the rows that were
    // sitting unlabelled because no rule matched when they were
    // first typed. History entries don't need this — they're matched
    // at render time via `findMatchingRule` so they pick up new
    // rules automatically. `typeIdLocked` rows are skipped so the
    // user's manual choices stay sticky.
    const sheets = reapplyPatternsToAllSheets(state.sheets, matchRules);
    return { ...state, matchRules, sheets };
  }
  if (action.type === "updateMatchRule") {
    const idx = state.matchRules.findIndex((r) => r.id === action.rule.id);
    if (idx < 0) return state;
    const matchRules = state.matchRules.slice();
    matchRules[idx] = action.rule;
    // Same retroactive re-evaluation as `createMatchRule` — editing a
    // rule's pattern, type, or filters should immediately re-label
    // every budget row the new shape now wins (or loses) against.
    const sheets = reapplyPatternsToAllSheets(state.sheets, matchRules);
    return { ...state, matchRules, sheets };
  }
  if (action.type === "reapplyMatchRules") {
    const sheets = reapplyPatternsToAllSheets(state.sheets, state.matchRules);
    if (sheets === state.sheets) return state;
    return { ...state, sheets };
  }
  if (action.type === "applyMatchRuleOnce") {
    const sheets = applyMatchRuleOnceToAllSheets(state.sheets, action.rule);
    const history = applyMatchRuleOnceToHistory(state.history, action.rule);
    if (sheets === state.sheets && history === state.history) return state;
    return { ...state, sheets, history };
  }
  if (action.type === "deleteMatchRule") {
    const next = state.matchRules.filter((r) => r.id !== action.ruleId);
    if (next.length === state.matchRules.length) return state;
    return { ...state, matchRules: next };
  }
  if (action.type === "moveMatchRule") {
    const idx = state.matchRules.findIndex((r) => r.id === action.ruleId);
    if (idx < 0) return state;
    const swapWith = action.direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= state.matchRules.length) return state;
    const matchRules = state.matchRules.slice();
    [matchRules[idx], matchRules[swapWith]] = [
      matchRules[swapWith],
      matchRules[idx],
    ];
    // Same retroactive re-evaluation as create / update / delete: the
    // reorder changes which rule wins for every row whose previous
    // winner moved relative to a sibling that also matched. typeIdLocked
    // rows are skipped inside reapplyPatternsToAllSheets so manual picks
    // stay sticky.
    const sheets = reapplyPatternsToAllSheets(state.sheets, matchRules);
    return { ...state, matchRules, sheets };
  }
  return null;
}
