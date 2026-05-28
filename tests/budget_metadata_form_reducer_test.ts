import { describe, expect, it } from "vitest";

import {
  budgetMetadataFormReducer,
  EMPTY_METADATA_FORM_FIELDS,
  initialMetadataFormState,
  type MetadataFormFields,
  type MetadataFormState,
} from "../src/components/budget/budget-metadata-form-reducer";

const SEED: MetadataFormFields = {
  description: "Rent",
  typeId: "t-rent",
  companyId: "co-1",
  noCompany: false,
  isTransfer: false,
};

function makeInitial(): MetadataFormState {
  return initialMetadataFormState(SEED);
}

describe("initialMetadataFormState", () => {
  it("mirrors the seed into both the live fields and the snapshot", () => {
    const state = initialMetadataFormState(SEED);
    expect(state.description).toBe("Rent");
    expect(state.typeId).toBe("t-rent");
    expect(state.companyId).toBe("co-1");
    expect(state.noCompany).toBe(false);
    expect(state.isTransfer).toBe(false);
    expect(state.initial).toEqual(SEED);
  });

  it("seeds an empty form from EMPTY_METADATA_FORM_FIELDS", () => {
    const state = initialMetadataFormState(EMPTY_METADATA_FORM_FIELDS);
    expect(state.description).toBe("");
    expect(state.typeId).toBeNull();
    expect(state.companyId).toBeNull();
    expect(state.noCompany).toBe(false);
    expect(state.isTransfer).toBe(false);
    expect(state.initial).toEqual(EMPTY_METADATA_FORM_FIELDS);
  });
});

describe("budgetMetadataFormReducer", () => {
  it("re-seeds both the live fields and the snapshot on `reset`", () => {
    const init = makeInitial();
    const dirtied = budgetMetadataFormReducer(init, {
      kind: "setDescription",
      value: "Edited",
    });
    expect(dirtied.description).toBe("Edited");
    const fields: MetadataFormFields = {
      description: "Salary",
      typeId: "t-salary",
      companyId: null,
      noCompany: true,
      isTransfer: false,
    };
    const after = budgetMetadataFormReducer(dirtied, { kind: "reset", fields });
    expect(after.description).toBe("Salary");
    expect(after.typeId).toBe("t-salary");
    expect(after.companyId).toBeNull();
    expect(after.noCompany).toBe(true);
    expect(after.isTransfer).toBe(false);
    expect(after.initial).toEqual(fields);
  });

  it("updates one field without disturbing the others or the snapshot", () => {
    const init = makeInitial();
    const after = budgetMetadataFormReducer(init, {
      kind: "setDescription",
      value: "Renamed",
    });
    expect(after.description).toBe("Renamed");
    expect(after.typeId).toBe(init.typeId);
    expect(after.companyId).toBe(init.companyId);
    expect(after.noCompany).toBe(init.noCompany);
    expect(after.isTransfer).toBe(init.isTransfer);
    expect(after.initial).toEqual(init.initial);
  });

  it("`setTypeId` updates only the type", () => {
    const init = makeInitial();
    const after = budgetMetadataFormReducer(init, {
      kind: "setTypeId",
      value: "t-other",
    });
    expect(after.typeId).toBe("t-other");
    expect(after.companyId).toBe(init.companyId);
  });

  it("`pickCompany` with an `autoTypeId` updates both companyId and typeId atomically", () => {
    const init: MetadataFormState = {
      ...makeInitial(),
      typeId: null,
    };
    const after = budgetMetadataFormReducer(init, {
      kind: "pickCompany",
      companyId: "co-2",
      autoTypeId: "t-auto",
    });
    expect(after.companyId).toBe("co-2");
    expect(after.typeId).toBe("t-auto");
  });

  it("`pickCompany` with an undefined `autoTypeId` leaves typeId alone", () => {
    const init: MetadataFormState = {
      ...makeInitial(),
      typeId: "t-locked",
    };
    const after = budgetMetadataFormReducer(init, {
      kind: "pickCompany",
      companyId: "co-2",
      autoTypeId: undefined,
    });
    expect(after.companyId).toBe("co-2");
    expect(after.typeId).toBe("t-locked");
  });

  it("`pickCompany` clearing the company does not touch the typeId", () => {
    const init: MetadataFormState = {
      ...makeInitial(),
      typeId: "t-existing",
    };
    const after = budgetMetadataFormReducer(init, {
      kind: "pickCompany",
      companyId: null,
      autoTypeId: undefined,
    });
    expect(after.companyId).toBeNull();
    expect(after.typeId).toBe("t-existing");
  });

  it("`setNoCompany` and `setIsTransfer` toggle their own flags", () => {
    const init = makeInitial();
    const noComp = budgetMetadataFormReducer(init, {
      kind: "setNoCompany",
      value: true,
    });
    expect(noComp.noCompany).toBe(true);
    expect(noComp.isTransfer).toBe(false);
    const transfer = budgetMetadataFormReducer(init, {
      kind: "setIsTransfer",
      value: true,
    });
    expect(transfer.isTransfer).toBe(true);
    expect(transfer.noCompany).toBe(false);
  });
});
