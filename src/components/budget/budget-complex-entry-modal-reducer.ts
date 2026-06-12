import { defaultCompletedForDate } from "../../data/budget/rows";
import type { RecurrenceRule } from "../../data/recurrence";
import type { Settings } from "../../data/types";
import { normalizeAmountInput } from "../../utils/format";
import type { AmountMode } from "./budget-amount-span";

// Optional pre-fill payload used when the modal opens. The recurring-
// candidate promote flow passes one so the user can adjust the detected
// description / amount / cadence before committing. When `seed` is null
// the modal opens blank (the "New entry" behaviour from the budget
// add-row button). Lives here rather than in the modal so the reset
// factory can consume it without a circular import; the modal re-exports
// it for the existing external consumers.
export type ComplexEntrySeed = {
  description: string;
  // Signed: negative seeds the sign toggle as "−"; positive as "+".
  amount: number;
  typeId: string | null;
  companyId: string | null;
  tagIds?: string[];
  isTransfer: boolean;
  rule: RecurrenceRule | null;
};

// The whole BudgetComplexEntryModal input state lives in one slice so the
// reset-on-open transition is one dispatch instead of 14 sequential
// setState calls. The formula / amount derivations and the submit glue
// stay in the component because they depend on `sheets` + the onCreate
// callback.
export type ComplexEntryState = {
  description: string;
  amountText: string;
  negative: boolean;
  // Exact vs estimate band; the estimate stays in `amountText`, the band
  // magnitudes (positive strings, sign from `negative`) live here.
  amountMode: AmountMode;
  amountMinText: string;
  amountMaxText: string;
  typeId: string | null;
  companyId: string | null;
  tagIds: string[];
  isTransfer: boolean;
  // Whether every generated row lands marked completed. Seeded from the
  // add-context date (past dates default completed, today / future stay
  // open — see `defaultCompletedForDate`) and applied uniformly to all
  // generated rows once the user has the checkbox in view.
  completed: boolean;
  dates: string[];
  // fx mode swaps the numeric amount input for a formula textarea.
  formulaMode: boolean;
  formulaText: string;
  // Bumped on every reset so RecurrenceForm re-seeds when the modal
  // re-opens; must stay monotonic across resets, so `reset` increments the
  // prior value rather than replacing it.
  resetKey: number;
};

export type ComplexEntrySeedInput = {
  seed: ComplexEntrySeed | null;
  settings: Settings;
  // The add-context date (the row the user clicked "add" on, or the
  // promote-flow anchor). Seeds the initial `completed` value via
  // `defaultCompletedForDate`.
  initialDate: string;
};

export type ComplexEntryAction =
  | { kind: "reset"; seed: ComplexEntrySeedInput }
  | { kind: "setDescription"; value: string }
  | { kind: "setAmountText"; value: string }
  | { kind: "toggleSign" }
  | { kind: "setAmountMode"; value: AmountMode }
  | { kind: "setAmountMinText"; value: string }
  | { kind: "setAmountMaxText"; value: string }
  | { kind: "setTypeId"; value: string | null }
  // The company picker auto-fills the type from the company's most
  // common type via `autoTypeForCompany(...)`. `undefined` means leave
  // `typeId` alone; a string overwrites it. The lookup needs
  // `companyTypeSuggestions` (a prop the reducer doesn't see) so the
  // dispatcher runs it before dispatching.
  | {
      kind: "pickCompany";
      companyId: string | null;
      autoTypeId: string | undefined;
    }
  | { kind: "setTagIds"; value: string[] }
  | { kind: "setIsTransfer"; value: boolean }
  | { kind: "setCompleted"; value: boolean }
  | { kind: "setDates"; value: string[] }
  | { kind: "toggleFormulaMode" }
  | { kind: "setFormulaText"; value: string };

export function initialComplexEntryState(
  input: ComplexEntrySeedInput,
): ComplexEntryState {
  const { seed, settings, initialDate } = input;
  const seeded = seed
    ? {
        description: seed.description,
        amountText:
          Math.abs(seed.amount) === 0
            ? ""
            : normalizeAmountInput(String(Math.abs(seed.amount)), settings),
        negative: seed.amount < 0,
        typeId: seed.typeId,
        companyId: seed.companyId,
        tagIds: seed.tagIds ?? [],
        isTransfer: seed.isTransfer,
      }
    : {
        description: "",
        amountText: "",
        negative: true,
        typeId: null,
        companyId: null,
        tagIds: [] as string[],
        isTransfer: false,
      };
  return {
    ...seeded,
    completed: defaultCompletedForDate(initialDate),
    dates: [],
    amountMode: "exact",
    amountMinText: "",
    amountMaxText: "",
    formulaMode: false,
    formulaText: "",
    resetKey: 0,
  };
}

export function budgetComplexEntryModalReducer(
  state: ComplexEntryState,
  action: ComplexEntryAction,
): ComplexEntryState {
  switch (action.kind) {
    case "reset":
      return {
        ...initialComplexEntryState(action.seed),
        resetKey: state.resetKey + 1,
      };
    case "setDescription":
      return { ...state, description: action.value };
    case "setAmountText":
      return { ...state, amountText: action.value };
    case "toggleSign":
      return { ...state, negative: !state.negative };
    case "setAmountMode":
      return { ...state, amountMode: action.value };
    case "setAmountMinText":
      return { ...state, amountMinText: action.value };
    case "setAmountMaxText":
      return { ...state, amountMaxText: action.value };
    case "setTypeId":
      return { ...state, typeId: action.value };
    case "pickCompany": {
      const next: ComplexEntryState = { ...state, companyId: action.companyId };
      if (action.autoTypeId !== undefined) {
        next.typeId = action.autoTypeId;
      }
      return next;
    }
    case "setTagIds":
      return { ...state, tagIds: action.value };
    case "setIsTransfer":
      return { ...state, isTransfer: action.value };
    case "setCompleted":
      return { ...state, completed: action.value };
    case "setDates":
      return { ...state, dates: action.value };
    case "toggleFormulaMode":
      return { ...state, formulaMode: !state.formulaMode };
    case "setFormulaText":
      return { ...state, formulaText: action.value };
  }
}
