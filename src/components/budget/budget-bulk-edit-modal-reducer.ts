import type { Settings } from "../../data/types";
import { formatAmountForInput } from "../../utils/format";

// The whole BudgetBulkEditModal input state lives in one slice so the
// reset-on-open transition is one dispatch instead of 11 sequential
// setState calls, and so the per-field enable/value pairs stay grouped
// in one place. The patch derivation that consumes this state stays in
// the component because it depends on the column lookups + onApply* glue.
export type BulkEditState = {
  typeEnabled: boolean;
  typeId: string | null;
  tagsEnabled: boolean;
  tagIds: string[];
  dateEnabled: boolean;
  dateValue: string;
  amountEnabled: boolean;
  amountText: string;
  transferEnabled: boolean;
  transferValue: boolean;
  recurringEnabled: boolean;
  recurringDates: string[];
  // Bumped on every reset so RecurrenceForm re-seeds when the modal
  // re-opens; must stay monotonic across resets, so `reset` increments the
  // prior value rather than replacing it.
  recurrenceResetKey: number;
};

export type BulkEditSeed = {
  seedDate: string;
  sharedAmount: number | null;
  settings: Settings;
};

export type BulkEditAction =
  | { kind: "reset"; seed: BulkEditSeed }
  | { kind: "setTypeEnabled"; value: boolean }
  | { kind: "setTypeId"; value: string | null }
  | { kind: "setTagsEnabled"; value: boolean }
  | { kind: "setTagIds"; value: string[] }
  | { kind: "setDateEnabled"; value: boolean }
  | { kind: "setDateValue"; value: string }
  | { kind: "setAmountEnabled"; value: boolean }
  | { kind: "setAmountText"; value: string }
  | { kind: "setTransferEnabled"; value: boolean }
  | { kind: "setTransferValue"; value: boolean }
  | { kind: "setRecurringEnabled"; value: boolean }
  | { kind: "setRecurringDates"; value: string[] };

function seededAmountText({ sharedAmount, settings }: BulkEditSeed): string {
  if (sharedAmount === null) return "";
  return sharedAmount < 0
    ? `-${formatAmountForInput(Math.abs(sharedAmount), settings)}`
    : formatAmountForInput(sharedAmount, settings);
}

export function initialBulkEditState(seed: BulkEditSeed): BulkEditState {
  return {
    typeEnabled: false,
    typeId: null,
    tagsEnabled: false,
    tagIds: [],
    dateEnabled: false,
    dateValue: seed.seedDate,
    amountEnabled: false,
    amountText: seededAmountText(seed),
    transferEnabled: false,
    transferValue: true,
    recurringEnabled: false,
    recurringDates: [],
    recurrenceResetKey: 0,
  };
}

export function budgetBulkEditModalReducer(
  state: BulkEditState,
  action: BulkEditAction,
): BulkEditState {
  switch (action.kind) {
    case "reset":
      return {
        ...initialBulkEditState(action.seed),
        recurrenceResetKey: state.recurrenceResetKey + 1,
      };
    case "setTypeEnabled":
      return { ...state, typeEnabled: action.value };
    case "setTypeId":
      return { ...state, typeId: action.value };
    case "setTagsEnabled":
      return { ...state, tagsEnabled: action.value };
    case "setTagIds":
      return { ...state, tagIds: action.value };
    case "setDateEnabled":
      return { ...state, dateEnabled: action.value };
    case "setDateValue":
      return { ...state, dateValue: action.value };
    case "setAmountEnabled":
      return { ...state, amountEnabled: action.value };
    case "setAmountText":
      return { ...state, amountText: action.value };
    case "setTransferEnabled":
      return { ...state, transferEnabled: action.value };
    case "setTransferValue":
      return { ...state, transferValue: action.value };
    case "setRecurringEnabled":
      return { ...state, recurringEnabled: action.value };
    case "setRecurringDates":
      return { ...state, recurringDates: action.value };
  }
}
