// BudgetMetadataModal's per-entry form fields in one slice so the
// reset-on-entry-id transition is one dispatch instead of 5 sequential
// setState calls (plus the `initialRef` snapshot write). Same precedent
// as `budgetEditEntryFullModalReducer`: pure reducer, no side effects;
// the component owns the save dispatch and the session skip/complete
// sets (which reset on a different trigger — modal close — and stay as
// plain `useState`).

export type MetadataFormFields = {
  description: string;
  typeId: string | null;
  companyId: string | null;
  // Per-entry tags. Optional — tags never gate an entry out of the
  // metadata queue, they're just an extra label the user can add while
  // walking. The full selection the picker hands back (not a diff).
  tagIds: string[];
  noCompany: boolean;
  isTransfer: boolean;
};

// The live fields plus a snapshot of the values the form was seeded
// with, so the save handler only stamps per-entry overrides for fields
// the user actually changed and `dirty` can compare against the seed.
// Folding the snapshot into the reducer state (rather than a separate
// `initialRef`) keeps the reset atomic — one dispatch re-seeds both the
// live fields and the comparison baseline.
export type MetadataFormState = MetadataFormFields & {
  initial: MetadataFormFields;
};

export type MetadataFormAction =
  | { kind: "reset"; fields: MetadataFormFields }
  | { kind: "setDescription"; value: string }
  | { kind: "setTypeId"; value: string | null }
  // Picks a company; `autoTypeId` is the pre-computed result of
  // `autoTypeForCompany(...)`. `undefined` means leave `typeId` alone;
  // a string overwrites it. The lookup needs `companyTypeSuggestions`
  // (a prop the reducer doesn't see) so the dispatcher runs it before
  // dispatching.
  | {
      kind: "pickCompany";
      companyId: string | null;
      autoTypeId: string | undefined;
    }
  | { kind: "setTagIds"; value: string[] }
  | { kind: "setNoCompany"; value: boolean }
  | { kind: "setIsTransfer"; value: boolean };

export const EMPTY_METADATA_FORM_FIELDS: MetadataFormFields = {
  description: "",
  typeId: null,
  companyId: null,
  tagIds: [],
  noCompany: false,
  isTransfer: false,
};

export function initialMetadataFormState(
  fields: MetadataFormFields,
): MetadataFormState {
  return { ...fields, initial: fields };
}

export function budgetMetadataFormReducer(
  state: MetadataFormState,
  action: MetadataFormAction,
): MetadataFormState {
  switch (action.kind) {
    case "reset":
      return { ...action.fields, initial: action.fields };
    case "setDescription":
      return { ...state, description: action.value };
    case "setTypeId":
      return { ...state, typeId: action.value };
    case "setTagIds":
      return { ...state, tagIds: action.value };
    case "pickCompany": {
      const next: MetadataFormState = { ...state, companyId: action.companyId };
      if (action.autoTypeId !== undefined) {
        next.typeId = action.autoTypeId;
      }
      return next;
    }
    case "setNoCompany":
      return { ...state, noCompany: action.value };
    case "setIsTransfer":
      return { ...state, isTransfer: action.value };
  }
}
