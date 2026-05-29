import { derivePatternFromDescription } from "../../data/budget/pattern-derive";
import type { MatchRule } from "../../data/types";

export type TransferFilter = NonNullable<MatchRule["transferFilter"]>;

// Minimum surface the modal needs from whatever row the user invoked
// the rule from. Both `HistoryEntry` and a budget-row projection map
// onto this shape so the modal doesn't have to branch on which kind it
// got. Re-exported by BudgetMatchRuleModal so external callers keep
// importing it from the modal.
export type MatchRuleSeed = {
  id: string;
  description: string;
  amount: number;
};

// The non-amount form fields live in one slice so the reset-on-open
// transition is a single dispatch instead of six sequential setState
// calls. The amount filter keeps its own sub-state in
// useMatchRuleAmountFilter; the patch derivation that consumes this
// state stays in the component because it depends on the live preview
// + onSubmit glue.
export type MatchRuleFormState = {
  pattern: string;
  description: string;
  typeId: string | null;
  companyId: string | null;
  // Tags the rule stamps on every match. A set — the picker hands back
  // the full selection. Empty means "don't touch tags".
  tagIds: string[];
  transferFilter: TransferFilter;
  // "Save pattern" — when checked (the default) the rule is persisted
  // alongside the labels it applies; when unchecked the parent stamps
  // matching rows once and throws the rule away.
  saveRule: boolean;
};

export type MatchRuleFormSeed = {
  existing: MatchRule | null;
  seedEntry: MatchRuleSeed | null;
};

export type MatchRuleFormAction =
  | { kind: "reset"; seed: MatchRuleFormSeed }
  | { kind: "setPattern"; value: string }
  | { kind: "setDescription"; value: string }
  | { kind: "setTypeId"; value: string | null }
  | { kind: "setCompanyId"; value: string | null }
  | { kind: "setTagIds"; value: string[] }
  | { kind: "setTransferFilter"; value: TransferFilter }
  | { kind: "setSaveRule"; value: boolean };

// Seed the pattern from the source row. Both history entries and
// budget rows go through the date / ref-number stripper in
// `pattern-derive.ts` — bank exports routinely embed the transaction
// date in the description (Skandia ships `<date> <merchant>`) and
// manually-typed descriptions tend to read `<merchant> <date>`. Either
// would otherwise pin the pattern to a single transaction.
function seedPatternFromSeed(seed: MatchRuleSeed): string {
  return derivePatternFromDescription(seed.description);
}

export function initialMatchRuleFormState({
  existing,
  seedEntry,
}: MatchRuleFormSeed): MatchRuleFormState {
  if (existing) {
    return {
      pattern: existing.pattern,
      description: existing.description ?? "",
      typeId: existing.typeId ?? null,
      companyId: existing.companyId ?? null,
      tagIds: existing.tagIds ?? [],
      transferFilter: existing.transferFilter ?? "any",
      saveRule: true,
    };
  }
  return {
    pattern: seedEntry ? seedPatternFromSeed(seedEntry) : "",
    description: "",
    typeId: null,
    companyId: null,
    tagIds: [],
    transferFilter: "exclude",
    saveRule: true,
  };
}

export function budgetMatchRuleModalReducer(
  state: MatchRuleFormState,
  action: MatchRuleFormAction,
): MatchRuleFormState {
  switch (action.kind) {
    case "reset":
      return initialMatchRuleFormState(action.seed);
    case "setPattern":
      return { ...state, pattern: action.value };
    case "setDescription":
      return { ...state, description: action.value };
    case "setTypeId":
      return { ...state, typeId: action.value };
    case "setCompanyId":
      return { ...state, companyId: action.value };
    case "setTagIds":
      return { ...state, tagIds: action.value };
    case "setTransferFilter":
      return { ...state, transferFilter: action.value };
    case "setSaveRule":
      return { ...state, saveRule: action.value };
  }
}
