import { getStandardColumns } from "../../data/sheet";
import type { Column, Row, SeriesMetadata, Settings } from "../../data/types";
import { formatAmountForInput } from "../../utils/format";
import {
  amountModeFromRow,
  spanInputStringsFromBounds,
  type AmountMode,
} from "./budget-amount-span";

export type ScopeKind = "just-this" | "future" | "all";

// Whole BudgetEditEntryFullModal input state in one slice so the
// reset-on-row-id transition is one dispatch instead of 14 sequential
// setState calls. Same precedent as `recurrenceFormReducer` /
// `reconciliationReducer`: pure reducer, no side effects; the component
// owns the row-save dispatch and the imperative
// `onSetSeriesPrimaryIncome` notification.
export type EditFullState = {
  description: string;
  amount: string;
  // Sign lives on a +/- toggle button; tracked separately from
  // `amount` so a transient empty input still remembers which sign
  // the user picked.
  negative: boolean;
  // Exact (single amount) vs estimate (min / estimate / max band). The
  // estimate stays in `amount`; the band magnitudes live in
  // `amountMin` / `amountMax` (positive strings; sign comes from
  // `negative`).
  amountMode: AmountMode;
  amountMin: string;
  amountMax: string;
  date: string;
  typeId: string | null;
  companyId: string | null;
  tagIds: string[];
  isTransfer: boolean;
  completed: boolean;
  isPrimaryIncome: boolean;
  anchorDayText: string;
  scopeKind: ScopeKind;
  untilEnabled: boolean;
  untilDate: string;
  shiftDaysText: string;
};

export type EditFullAction =
  | { kind: "reset"; state: EditFullState }
  | { kind: "setDescription"; value: string }
  | { kind: "setAmount"; value: string }
  | { kind: "setAmountMode"; value: AmountMode }
  | { kind: "setAmountMin"; value: string }
  | { kind: "setAmountMax"; value: string }
  | { kind: "toggleNegative" }
  | { kind: "setDate"; value: string }
  | { kind: "setTypeId"; value: string | null }
  // Picks a company; `autoTypeId` is the pre-computed result of
  // `autoTypeForCompany(...)`. `undefined` means leave `typeId`
  // alone; a string overwrites it. The lookup needs
  // `companyTypeSuggestions` (a prop the reducer doesn't see) so
  // the dispatcher runs it before dispatching.
  | {
      kind: "pickCompany";
      companyId: string | null;
      autoTypeId: string | undefined;
    }
  | { kind: "setTagIds"; value: string[] }
  | { kind: "setIsTransfer"; value: boolean }
  | { kind: "setCompleted"; value: boolean }
  | { kind: "setIsPrimaryIncome"; value: boolean }
  | { kind: "setAnchorDayText"; value: string }
  | { kind: "setScopeKind"; value: ScopeKind }
  | { kind: "setUntilEnabled"; value: boolean }
  | { kind: "setUntilDate"; value: string }
  | { kind: "setShiftDaysText"; value: string };

// Snapshot the props into a full state. Both the `useReducer`
// initializer and the reset-on-open effect read from this — and
// because it's a pure function of the inputs, the component can
// retain the snapshot as `initialState` and compare against it to
// decide whether `companyId` / `isTransfer` were touched.
export function initialEditFullState(
  row: Row | null,
  columns: readonly Column[],
  settings: Settings,
  seriesMetadata: SeriesMetadata | undefined,
  lastSeriesDate: string | null,
): EditFullState {
  const { descCol, amountCol, dateCol, completedCol } =
    getStandardColumns(columns);

  const description =
    descCol && row && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  const amount =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? formatAmountForInput(
          Math.abs(row.cells[amountCol.id] as number),
          settings,
        )
      : "";
  const negative =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number) <= 0
      : true;
  const date =
    dateCol && row && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";
  const completed =
    completedCol && row && typeof row.cells[completedCol.id] === "boolean"
      ? (row.cells[completedCol.id] as boolean)
      : false;

  const amountMode = amountModeFromRow(row?.amountMin, row?.amountMax);
  const band =
    row?.amountMin !== undefined && row?.amountMax !== undefined
      ? spanInputStringsFromBounds(row.amountMin, row.amountMax, settings)
      : { min: "", max: "" };

  return {
    description,
    amount,
    negative,
    amountMode,
    amountMin: band.min,
    amountMax: band.max,
    date,
    typeId: row?.typeId ?? null,
    companyId: row?.companyId ?? null,
    tagIds: row?.tagIds ? [...row.tagIds] : [],
    isTransfer: row?.isTransfer === true,
    completed,
    isPrimaryIncome: seriesMetadata?.isPrimaryIncome === true,
    anchorDayText: String(seriesMetadata?.anchorDayOfMonth ?? 25),
    scopeKind: "just-this",
    untilEnabled: false,
    untilDate: lastSeriesDate ?? date ?? "",
    shiftDaysText: "0",
  };
}

export function budgetEditEntryFullModalReducer(
  state: EditFullState,
  action: EditFullAction,
): EditFullState {
  switch (action.kind) {
    case "reset":
      return action.state;
    case "setDescription":
      return { ...state, description: action.value };
    case "setAmount":
      return { ...state, amount: action.value };
    case "setAmountMode":
      return { ...state, amountMode: action.value };
    case "setAmountMin":
      return { ...state, amountMin: action.value };
    case "setAmountMax":
      return { ...state, amountMax: action.value };
    case "toggleNegative":
      return { ...state, negative: !state.negative };
    case "setDate":
      return { ...state, date: action.value };
    case "setTypeId":
      return { ...state, typeId: action.value };
    case "pickCompany": {
      const next: EditFullState = { ...state, companyId: action.companyId };
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
    case "setIsPrimaryIncome":
      return { ...state, isPrimaryIncome: action.value };
    case "setAnchorDayText":
      return { ...state, anchorDayText: action.value };
    case "setScopeKind":
      return { ...state, scopeKind: action.value };
    case "setUntilEnabled":
      return { ...state, untilEnabled: action.value };
    case "setUntilDate":
      return { ...state, untilDate: action.value };
    case "setShiftDaysText":
      return { ...state, shiftDaysText: action.value };
  }
}
