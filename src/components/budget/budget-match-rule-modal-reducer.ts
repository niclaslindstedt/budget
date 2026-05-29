import { derivePatternFromDescription } from "../../data/budget/pattern-derive";
import type { MatchRule } from "../../data/types";

export type TransferFilter = NonNullable<MatchRule["transferFilter"]>;

// Minimum surface the modal needs from whatever row the user invoked
// the rule from. Both `HistoryEntry` and a budget-row projection map
// onto this shape so the modal doesn't have to branch on which kind it
// got. Re-exported by BudgetMatchRuleModal so external callers keep
// importing it from the modal.
//
// The label fields (`typeId` / `companyId` / `tagIds` /
// `userDescription`) carry whatever the source row already shows so a
// "label similar" invocation prefills the new rule with the labels the
// user just assigned — pressing it on a row that's already typed
// `Banking` + `Skandiabanken` seeds the type and company instead of
// making the user re-pick them. They're the *resolved* values (after
// the rule / hint / per-entry override chain), so prefilling carries
// forward exactly what the row renders. `userDescription` is the
// custom description before the company / type / bank-text fallbacks —
// `null` when the row has no real override, which leaves the modal's
// "Description (optional)" field blank so the bank text is kept.
export type MatchRuleSeed = {
  id: string;
  description: string;
  amount: number;
  typeId?: string | null;
  companyId?: string | null;
  tagIds?: readonly string[];
  userDescription?: string | null;
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
    // Prefill the relabel fields from the source row's resolved labels
    // so "label similar" carries the type / company / tags / custom
    // description forward. The description stays blank when the source
    // has no real override (`userDescription` null) so the bank text is
    // kept.
    description: seedEntry?.userDescription ?? "",
    typeId: seedEntry?.typeId ?? null,
    companyId: seedEntry?.companyId ?? null,
    tagIds: seedEntry?.tagIds ? [...seedEntry.tagIds] : [],
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
