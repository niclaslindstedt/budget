import { describe, expect, it } from "vitest";

import type { Settings } from "../src/data/types";
import {
  budgetComplexEntryModalReducer,
  initialComplexEntryState,
  type ComplexEntrySeed,
  type ComplexEntrySeedInput,
  type ComplexEntryState,
} from "../src/components/budget/budget-complex-entry-modal-reducer";

const SETTINGS = {
  decimalSeparator: ".",
  thousandsSeparator: ",",
} as unknown as Settings;

function seedInput(
  seed: ComplexEntrySeed | null = null,
  initialDate = "2999-01-01",
): ComplexEntrySeedInput {
  return { seed, settings: SETTINGS, initialDate };
}

function makeSeed(overrides: Partial<ComplexEntrySeed> = {}): ComplexEntrySeed {
  return {
    description: "Rent",
    amount: -1234.5,
    typeId: "t1",
    companyId: "c1",
    tagIds: ["g1"],
    isTransfer: false,
    rule: null,
    ...overrides,
  };
}

function makeInitial(seed: ComplexEntrySeed | null = null): ComplexEntryState {
  return initialComplexEntryState(seedInput(seed));
}

describe("initialComplexEntryState", () => {
  it("opens blank when no seed is supplied", () => {
    const state = makeInitial();
    expect(state.description).toBe("");
    expect(state.amountText).toBe("");
    expect(state.negative).toBe(true);
    expect(state.typeId).toBeNull();
    expect(state.companyId).toBeNull();
    expect(state.tagIds).toEqual([]);
    expect(state.isTransfer).toBe(false);
    expect(state.completed).toBe(false);
    expect(state.dates).toEqual([]);
    expect(state.amountMode).toBe("exact");
    expect(state.amountMinText).toBe("");
    expect(state.amountMaxText).toBe("");
    expect(state.formulaMode).toBe(false);
    expect(state.formulaText).toBe("");
    expect(state.resetKey).toBe(0);
  });

  it("pre-fills the form from a seed", () => {
    const state = makeInitial(makeSeed());
    expect(state.description).toBe("Rent");
    expect(state.amountText).toBe("1234.5");
    expect(state.negative).toBe(true);
    expect(state.typeId).toBe("t1");
    expect(state.companyId).toBe("c1");
    expect(state.tagIds).toEqual(["g1"]);
    expect(state.isTransfer).toBe(false);
    // The always-reset fields ignore the seed.
    expect(state.dates).toEqual([]);
    expect(state.amountMode).toBe("exact");
    expect(state.formulaMode).toBe(false);
  });

  it("seeds the sign from the seed amount", () => {
    expect(makeInitial(makeSeed({ amount: 50 })).negative).toBe(false);
    expect(makeInitial(makeSeed({ amount: -50 })).negative).toBe(true);
  });

  it("seeds blank amount text for a zero seed amount", () => {
    expect(makeInitial(makeSeed({ amount: 0 })).amountText).toBe("");
  });

  it("defaults tagIds to an empty array when the seed omits them", () => {
    expect(makeInitial(makeSeed({ tagIds: undefined })).tagIds).toEqual([]);
  });

  it("seeds completed from the add-context date", () => {
    expect(
      initialComplexEntryState(seedInput(null, "2000-01-01")).completed,
    ).toBe(true);
    expect(
      initialComplexEntryState(seedInput(null, "2999-01-01")).completed,
    ).toBe(false);
  });
});

describe("budgetComplexEntryModalReducer", () => {
  it("re-seeds on reset and increments resetKey monotonically", () => {
    let state = makeInitial();
    state = budgetComplexEntryModalReducer(state, {
      kind: "setDescription",
      value: "edited",
    });
    state = budgetComplexEntryModalReducer(state, {
      kind: "setDates",
      value: ["2026-04-01"],
    });

    state = budgetComplexEntryModalReducer(state, {
      kind: "reset",
      seed: seedInput(makeSeed({ description: "Salary", amount: 9000 })),
    });
    expect(state.description).toBe("Salary");
    expect(state.amountText).toBe("9000");
    expect(state.negative).toBe(false);
    expect(state.dates).toEqual([]);
    expect(state.resetKey).toBe(1);

    state = budgetComplexEntryModalReducer(state, {
      kind: "reset",
      seed: seedInput(),
    });
    expect(state.description).toBe("");
    expect(state.resetKey).toBe(2);
  });

  it("folds the company + auto-type write into one pickCompany transition", () => {
    const base = makeInitial();
    const withType = budgetComplexEntryModalReducer(base, {
      kind: "pickCompany",
      companyId: "c9",
      autoTypeId: "t9",
    });
    expect(withType.companyId).toBe("c9");
    expect(withType.typeId).toBe("t9");

    const keepsType = budgetComplexEntryModalReducer(
      { ...base, typeId: "t1" },
      { kind: "pickCompany", companyId: "c2", autoTypeId: undefined },
    );
    expect(keepsType.companyId).toBe("c2");
    expect(keepsType.typeId).toBe("t1");
  });

  it("keeps the omit flag and a picked company mutually exclusive", () => {
    const base = makeInitial();
    expect(base.noCompany).toBe(false);

    // Enabling omit clears any picked company.
    const omitted = budgetComplexEntryModalReducer(
      { ...base, companyId: "c1" },
      { kind: "setNoCompany", value: true },
    );
    expect(omitted.noCompany).toBe(true);
    expect(omitted.companyId).toBeNull();

    // Picking a real company lowers the omit flag.
    const picked = budgetComplexEntryModalReducer(omitted, {
      kind: "pickCompany",
      companyId: "c2",
      autoTypeId: undefined,
    });
    expect(picked.companyId).toBe("c2");
    expect(picked.noCompany).toBe(false);

    // Clearing the company (null) leaves the omit flag untouched.
    const cleared = budgetComplexEntryModalReducer(picked, {
      kind: "pickCompany",
      companyId: null,
      autoTypeId: undefined,
    });
    expect(cleared.companyId).toBeNull();
    expect(cleared.noCompany).toBe(false);
  });

  it("toggles the sign and formula mode", () => {
    const base = makeInitial();
    expect(
      budgetComplexEntryModalReducer(base, { kind: "toggleSign" }).negative,
    ).toBe(false);
    expect(
      budgetComplexEntryModalReducer(base, { kind: "toggleFormulaMode" })
        .formulaMode,
    ).toBe(true);
  });

  it("updates only the targeted field for each setter", () => {
    const base = makeInitial();
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setAmountText",
        value: "42",
      }),
    ).toMatchObject({ ...base, amountText: "42" });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setAmountMode",
        value: "estimate",
      }),
    ).toMatchObject({ ...base, amountMode: "estimate" });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setAmountMinText",
        value: "10",
      }),
    ).toMatchObject({ ...base, amountMinText: "10" });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setAmountMaxText",
        value: "20",
      }),
    ).toMatchObject({ ...base, amountMaxText: "20" });
    expect(
      budgetComplexEntryModalReducer(base, { kind: "setTypeId", value: "t5" }),
    ).toMatchObject({ ...base, typeId: "t5" });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setTagIds",
        value: ["g2"],
      }),
    ).toMatchObject({ ...base, tagIds: ["g2"] });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setIsTransfer",
        value: true,
      }),
    ).toMatchObject({ ...base, isTransfer: true });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setCompleted",
        value: true,
      }),
    ).toMatchObject({ ...base, completed: true });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setDates",
        value: ["2026-01-01"],
      }),
    ).toMatchObject({ ...base, dates: ["2026-01-01"] });
    expect(
      budgetComplexEntryModalReducer(base, {
        kind: "setFormulaText",
        value: "1+1",
      }),
    ).toMatchObject({ ...base, formulaText: "1+1" });
  });
});
