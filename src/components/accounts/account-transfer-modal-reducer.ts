import type { Settings } from "../../data/types";
import { formatAmountForInput } from "../../utils/format";

// Whole AccountTransferModal input state in one slice so the reset on
// open/request transition is one dispatch instead of 9 sequential
// setState calls, and the pick-account-and-close-panel pair becomes
// one atomic transition. Same precedent as
// `budgetEditEntryFullModalReducer` / `recurrenceFormReducer` /
// `reconciliationReducer`: pure reducer, no side effects; the
// component owns the create/edit dispatch and the imperative
// `onClose` notification.
export type TransferModalState = {
  date: string;
  description: string;
  amountText: string;
  fromAccountId: string;
  toAccountId: string;
  typeId: string | null;
  completed: boolean;
  // Imported-pair toggle: clearing it on a "linked" edit triggers an
  // uncollapse instead of a save. Hidden in the JSX in non-imported
  // contexts but kept in state so the reset path is uniform.
  isTransfer: boolean;
  datePickerOpen: boolean;
  fromOpen: boolean;
  toOpen: boolean;
};

export type TransferModalAction =
  | { kind: "reset"; state: TransferModalState }
  | { kind: "setDate"; value: string }
  | { kind: "setDescription"; value: string }
  | { kind: "setAmountText"; value: string }
  | { kind: "swapAccounts" }
  // Picks an account and closes the panel in one transition so the UI
  // never renders the intermediate "panel still open with new value"
  // frame.
  | { kind: "pickFromAccount"; value: string }
  | { kind: "pickToAccount"; value: string }
  | { kind: "setTypeId"; value: string | null }
  | { kind: "setCompleted"; value: boolean }
  | { kind: "setIsTransfer"; value: boolean }
  | { kind: "setDatePickerOpen"; value: boolean }
  | { kind: "setFromOpen"; value: boolean }
  | { kind: "setToOpen"; value: boolean };

// Structural shape of the modal request — narrower than
// `TransferModalRequest` (no `transferId` / `isImportedPair`) so the
// reducer file doesn't have to import from the modal it backs.
export type TransferModalSeed =
  | {
      kind: "edit";
      date: string;
      description: string;
      amount: number;
      fromAccountId: string;
      toAccountId: string;
      typeId: string | null;
      completed: boolean;
    }
  | {
      kind: "create";
      defaultFromId: string | null;
      defaultToId: string | null;
      seedDate: string;
    };

export function initialTransferModalState(
  seed: TransferModalSeed | null,
  settings: Settings,
): TransferModalState {
  if (seed && seed.kind === "edit") {
    return {
      date: seed.date,
      description: seed.description,
      amountText: formatAmountForInput(seed.amount, settings),
      fromAccountId: seed.fromAccountId,
      toAccountId: seed.toAccountId,
      typeId: seed.typeId,
      completed: seed.completed,
      isTransfer: true,
      datePickerOpen: false,
      fromOpen: false,
      toOpen: false,
    };
  }
  if (seed && seed.kind === "create") {
    return {
      date: seed.seedDate,
      description: "",
      amountText: "",
      fromAccountId: seed.defaultFromId ?? "",
      toAccountId: seed.defaultToId ?? "",
      typeId: null,
      completed: false,
      isTransfer: true,
      datePickerOpen: false,
      fromOpen: false,
      toOpen: false,
    };
  }
  return {
    date: "",
    description: "",
    amountText: "",
    fromAccountId: "",
    toAccountId: "",
    typeId: null,
    completed: false,
    isTransfer: true,
    datePickerOpen: false,
    fromOpen: false,
    toOpen: false,
  };
}

export function transferModalReducer(
  state: TransferModalState,
  action: TransferModalAction,
): TransferModalState {
  switch (action.kind) {
    case "reset":
      return action.state;
    case "setDate":
      return { ...state, date: action.value };
    case "setDescription":
      return { ...state, description: action.value };
    case "setAmountText":
      return { ...state, amountText: action.value };
    case "swapAccounts":
      return {
        ...state,
        fromAccountId: state.toAccountId,
        toAccountId: state.fromAccountId,
      };
    case "pickFromAccount":
      return { ...state, fromAccountId: action.value, fromOpen: false };
    case "pickToAccount":
      return { ...state, toAccountId: action.value, toOpen: false };
    case "setTypeId":
      return { ...state, typeId: action.value };
    case "setCompleted":
      return { ...state, completed: action.value };
    case "setIsTransfer":
      return { ...state, isTransfer: action.value };
    case "setDatePickerOpen":
      return { ...state, datePickerOpen: action.value };
    case "setFromOpen":
      return { ...state, fromOpen: action.value };
    case "setToOpen":
      return { ...state, toOpen: action.value };
  }
}
