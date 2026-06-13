import { describe, expect, it } from "vitest";

import {
  budgetMetadataSplitReducer,
  buildFinalSplits,
  canCommitContinue,
  canFinish,
  draftSignedAmount,
  makeInitialSplitState,
  splitRemaining,
  type MetadataSplitState,
} from "../src/components/budget/budget-metadata-split-reducer";
import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";

// Begin a split against a -7764 expense, mirroring the screenshot's
// Klarna autogiro that pays for several differently-typed purchases.
function begin(
  total = -7764,
  fallback = "Autogiro K* Klarna",
): MetadataSplitState {
  return budgetMetadataSplitReducer(makeInitialSplitState(), {
    kind: "begin",
    total,
    fallbackDescription: fallback,
    settings: DEFAULT_SETTINGS,
  });
}

describe("budgetMetadataSplitReducer · begin", () => {
  it("seeds the draft amount to the full magnitude and inherits the sign", () => {
    const state = begin();
    expect(state.total).toBe(-7764);
    expect(state.committed).toHaveLength(0);
    expect(state.draft.negative).toBe(true);
    // The draft amount is the magnitude only (sign on `negative`).
    expect(state.draft.amount).not.toBe("");
    expect(draftSignedAmount(state.draft)).toBeLessThan(0);
    expect(Math.abs(draftSignedAmount(state.draft) ?? 0)).toBeCloseTo(7764);
  });

  it("starts with the whole amount still to allocate", () => {
    expect(splitRemaining(begin())).toBe(-7764);
  });
});

describe("budgetMetadataSplitReducer · gating", () => {
  it("blocks 'Split again' until a smaller same-direction slice is typed", () => {
    let state = begin();
    // Default draft equals the full remaining → not strictly smaller.
    expect(canCommitContinue(state)).toBe(false);
    // Carve off a smaller chunk.
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "2000",
    });
    expect(canCommitContinue(state)).toBe(true);
  });

  it("blocks 'Split again' when the slice meets or exceeds the remaining", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "7764",
    });
    expect(canCommitContinue(state)).toBe(false);
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "8000",
    });
    expect(canCommitContinue(state)).toBe(false);
  });

  it("blocks an opposite-direction slice", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "1000",
    });
    state = budgetMetadataSplitReducer(state, { kind: "toggleSign" });
    expect(state.draft.negative).toBe(false);
    expect(canCommitContinue(state)).toBe(false);
  });

  it("blocks 'Next' until at least one part is committed", () => {
    expect(canFinish(begin())).toBe(false);
  });
});

describe("budgetMetadataSplitReducer · commit", () => {
  it("commits the typed slice and re-seeds the draft to the new remaining", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "2000",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setType",
      value: "t-food",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setDescription",
      value: "Groceries",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });

    expect(state.committed).toHaveLength(1);
    expect(state.committed[0]).toMatchObject({
      description: "Groceries",
      amount: -2000,
      typeId: "t-food",
    });
    // Remaining shrinks; the fresh draft is sized to it and clears
    // the metadata.
    expect(splitRemaining(state)).toBe(-5764);
    expect(state.draft.typeId).toBeNull();
    expect(state.draft.description).toBe("");
    expect(Math.abs(draftSignedAmount(state.draft) ?? 0)).toBeCloseTo(5764);
    expect(canFinish(state)).toBe(true);
  });

  it("falls back to the bank text when a part's description is blank", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "2000",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });
    expect(state.committed[0].description).toBe("Autogiro K* Klarna");
  });

  it("persists companyId: null for a part the user omits a company on", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "2000",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setNoCompany",
      value: true,
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });
    expect(state.committed[0].companyId).toBeNull();
  });

  it("carries per-part tags only when present", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "2000",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setTags",
      value: ["tag-a", "tag-b"],
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });
    expect(state.committed[0].tagIds).toEqual(["tag-a", "tag-b"]);
  });
});

describe("budgetMetadataSplitReducer · company opt-out", () => {
  it("clears a picked company when the opt-out is enabled", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "pickCompany",
      companyId: "co-acme",
      autoTypeId: undefined,
    });
    expect(state.draft.companyId).toBe("co-acme");
    state = budgetMetadataSplitReducer(state, {
      kind: "setNoCompany",
      value: true,
    });
    expect(state.draft.noCompany).toBe(true);
    expect(state.draft.companyId).toBeNull();
  });

  it("clears the opt-out when a real company is picked", () => {
    let state = begin();
    state = budgetMetadataSplitReducer(state, {
      kind: "setNoCompany",
      value: true,
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "pickCompany",
      companyId: "co-acme",
      autoTypeId: undefined,
    });
    expect(state.draft.noCompany).toBe(false);
    expect(state.draft.companyId).toBe("co-acme");
  });
});

describe("budgetMetadataSplitReducer · finish", () => {
  it("the final part absorbs the remainder so the parts sum to the total", () => {
    let state = begin();
    // Part 1: -2000
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "2000",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setDescription",
      value: "Groceries",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });
    // Part 2: -3000
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "3000",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setDescription",
      value: "Electronics",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });
    // Final part (Next) carries the draft metadata + the remainder.
    state = budgetMetadataSplitReducer(state, {
      kind: "setType",
      value: "t-clothes",
    });
    state = budgetMetadataSplitReducer(state, {
      kind: "setDescription",
      value: "Clothes",
    });

    const splits = buildFinalSplits(state);
    expect(splits).toHaveLength(3);
    expect(splits.map((s) => s.amount)).toEqual([-2000, -3000, -2764]);
    expect(splits[2]).toMatchObject({
      description: "Clothes",
      amount: -2764,
      typeId: "t-clothes",
    });
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(sum).toBe(-7764);
  });

  it("supports a positive (refund) entry the same way", () => {
    let state = begin(500, "Refund");
    state = budgetMetadataSplitReducer(state, {
      kind: "setAmount",
      value: "200",
    });
    expect(canCommitContinue(state)).toBe(true);
    state = budgetMetadataSplitReducer(state, {
      kind: "commit",
      settings: DEFAULT_SETTINGS,
    });
    expect(state.committed[0].amount).toBe(200);
    const splits = buildFinalSplits(state);
    expect(splits.map((s) => s.amount)).toEqual([200, 300]);
  });
});
