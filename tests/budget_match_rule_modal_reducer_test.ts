import { describe, expect, it } from "vitest";

import type { MatchRule } from "../src/data/types";
import {
  budgetMatchRuleModalReducer,
  initialMatchRuleFormState,
  type MatchRuleFormSeed,
  type MatchRuleFormState,
  type MatchRuleSeed,
} from "../src/components/budget/budget-match-rule-modal-reducer";

function existingRule(overrides: Partial<MatchRule> = {}): MatchRule {
  return {
    id: "r1",
    pattern: "ICA*",
    description: "Groceries",
    typeId: "t1",
    companyId: "c1",
    amountSign: "any",
    transferFilter: "only",
    ...overrides,
  } as MatchRule;
}

function seedEntry(overrides: Partial<MatchRuleSeed> = {}): MatchRuleSeed {
  return { id: "e1", description: "ICA Maxi", amount: -120, ...overrides };
}

function makeInitial(seed: MatchRuleFormSeed): MatchRuleFormState {
  return initialMatchRuleFormState(seed);
}

describe("initialMatchRuleFormState", () => {
  it("seeds from an existing rule and always enables saveRule", () => {
    const state = makeInitial({ existing: existingRule(), seedEntry: null });
    expect(state.pattern).toBe("ICA*");
    expect(state.description).toBe("Groceries");
    expect(state.typeId).toBe("t1");
    expect(state.companyId).toBe("c1");
    expect(state.transferFilter).toBe("only");
    expect(state.saveRule).toBe(true);
  });

  it("defaults absent optional fields when editing a sparse rule", () => {
    const state = makeInitial({
      existing: existingRule({
        description: undefined,
        typeId: undefined,
        companyId: undefined,
        transferFilter: undefined,
      }),
      seedEntry: null,
    });
    expect(state.description).toBe("");
    expect(state.typeId).toBeNull();
    expect(state.companyId).toBeNull();
    expect(state.transferFilter).toBe("any");
  });

  it("derives the pattern from a seed entry when creating a new rule", () => {
    const state = makeInitial({ existing: null, seedEntry: seedEntry() });
    expect(state.pattern.length).toBeGreaterThan(0);
    expect(state.description).toBe("");
    expect(state.typeId).toBeNull();
    expect(state.companyId).toBeNull();
    expect(state.transferFilter).toBe("exclude");
    expect(state.saveRule).toBe(true);
  });

  it("starts a blank new rule when there is no seed entry", () => {
    const state = makeInitial({ existing: null, seedEntry: null });
    expect(state.pattern).toBe("");
    expect(state.transferFilter).toBe("exclude");
  });
});

describe("budgetMatchRuleModalReducer", () => {
  it("re-seeds on reset, discarding edits", () => {
    let state = makeInitial({ existing: null, seedEntry: null });
    state = budgetMatchRuleModalReducer(state, {
      kind: "setPattern",
      value: "edited",
    });
    state = budgetMatchRuleModalReducer(state, {
      kind: "setSaveRule",
      value: false,
    });

    state = budgetMatchRuleModalReducer(state, {
      kind: "reset",
      seed: { existing: existingRule(), seedEntry: null },
    });
    expect(state.pattern).toBe("ICA*");
    expect(state.saveRule).toBe(true);
  });

  it("updates only the targeted field for each setter", () => {
    const base = makeInitial({ existing: null, seedEntry: null });
    expect(
      budgetMatchRuleModalReducer(base, { kind: "setPattern", value: "X*" }),
    ).toMatchObject({ ...base, pattern: "X*" });
    expect(
      budgetMatchRuleModalReducer(base, {
        kind: "setDescription",
        value: "note",
      }),
    ).toMatchObject({ ...base, description: "note" });
    expect(
      budgetMatchRuleModalReducer(base, { kind: "setTypeId", value: "t9" }),
    ).toMatchObject({ ...base, typeId: "t9" });
    expect(
      budgetMatchRuleModalReducer(base, { kind: "setCompanyId", value: "c9" }),
    ).toMatchObject({ ...base, companyId: "c9" });
    expect(
      budgetMatchRuleModalReducer(base, {
        kind: "setTransferFilter",
        value: "only",
      }),
    ).toMatchObject({ ...base, transferFilter: "only" });
    expect(
      budgetMatchRuleModalReducer(base, {
        kind: "setSaveRule",
        value: false,
      }),
    ).toMatchObject({ ...base, saveRule: false });
  });
});
