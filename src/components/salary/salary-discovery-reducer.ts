// The per-month editable fields for the guided salary-discovery walk,
// folded into one slice so the reset-on-month transition is a single
// dispatch instead of three sequential setState calls. Same precedent
// as `budget-metadata-form-reducer.ts`: pure reducer, no side effects;
// the modal owns the accept dispatch and the session accepted/skipped
// maps (which reset on modal close and stay plain `useState`).

export type DiscoveryFormFields = {
  // Magnitude text the `SignedAmountInput` edits. A salary is positive,
  // so `negative` is effectively always false, but the shared input
  // needs both halves and the accept handler takes the magnitude.
  netText: string;
  negative: boolean;
  employerId: string | undefined;
};

export type DiscoveryFormState = DiscoveryFormFields;

export type DiscoveryFormAction =
  | { kind: "reset"; fields: DiscoveryFormFields }
  | { kind: "setNet"; value: string }
  | { kind: "toggleSign" }
  | { kind: "setEmployer"; value: string | undefined };

export const EMPTY_DISCOVERY_FORM: DiscoveryFormFields = {
  netText: "",
  negative: false,
  employerId: undefined,
};

export function salaryDiscoveryReducer(
  state: DiscoveryFormState,
  action: DiscoveryFormAction,
): DiscoveryFormState {
  switch (action.kind) {
    case "reset":
      return { ...action.fields };
    case "setNet":
      return { ...state, netText: action.value };
    case "toggleSign":
      return { ...state, negative: !state.negative };
    case "setEmployer":
      return { ...state, employerId: action.value };
  }
}
