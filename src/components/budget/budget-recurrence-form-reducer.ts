import { isIsoDate, type RecurrenceRule } from "../../data/recurrence";

export type Mode = "once" | "dates" | "everyNDays" | "monthly";

// The whole BudgetRecurrenceForm input state lives in one slice so the
// reset-on-`resetKey` transition is one dispatch instead of 11 sequential
// setState calls, and so the mode-vs-fields shape is explicit in one
// place. The rule derivation that consumes this state stays in the
// component because it depends on the mode-specific validation helpers.
export type RecurrenceFormState = {
  mode: Mode;
  onceDate: string;
  datesList: string[];
  everyNStart: string;
  everyNEnd: string;
  everyNDays: string;
  monthlyStride: string;
  monthlyDay: string;
  monthlyOffset: string;
  monthlyStartMonth: string;
  monthlyEndMonth: string;
};

export type RecurrenceFormAction =
  | { kind: "reset"; state: RecurrenceFormState }
  | { kind: "setMode"; mode: Mode }
  | { kind: "setOnceDate"; value: string }
  | { kind: "setDateAt"; index: number; value: string }
  | { kind: "addDate"; fallback: string }
  | { kind: "removeDateAt"; index: number }
  | { kind: "setEveryNStart"; value: string }
  | { kind: "setEveryNEnd"; value: string }
  | { kind: "setEveryNDays"; value: string }
  | { kind: "setMonthlyStride"; value: string }
  | { kind: "setMonthlyDay"; value: string }
  | { kind: "setMonthlyOffset"; value: string }
  | { kind: "setMonthlyStartMonth"; value: string }
  | { kind: "setMonthlyEndMonth"; value: string };

function todayDayOfMonth(): string {
  return String(new Date().getDate());
}

function seedDayOfMonth(seed: string): string {
  if (!isIsoDate(seed)) return todayDayOfMonth();
  return String(Number(seed.slice(8, 10)));
}

export function initialRecurrenceFormState(
  seedRule: RecurrenceRule | null,
  seedDate: string,
  horizonEnd: string,
  includeOnce: boolean,
): RecurrenceFormState {
  const defaults: RecurrenceFormState = {
    mode: includeOnce ? "once" : "monthly",
    onceDate: seedDate,
    datesList: [seedDate],
    everyNStart: seedDate,
    everyNEnd: horizonEnd,
    everyNDays: "14",
    monthlyStride: "1",
    monthlyDay: seedDayOfMonth(seedDate),
    monthlyOffset: "0",
    monthlyStartMonth: seedDate.slice(0, 7),
    monthlyEndMonth: horizonEnd.slice(0, 7),
  };
  if (!seedRule) return defaults;
  switch (seedRule.kind) {
    case "once":
      return includeOnce
        ? { ...defaults, mode: "once", onceDate: seedRule.date }
        : { ...defaults, mode: "dates", datesList: [seedRule.date] };
    case "dates": {
      const valid = seedRule.dates.filter(isIsoDate);
      return {
        ...defaults,
        mode: "dates",
        datesList: valid.length > 0 ? valid : [seedDate],
      };
    }
    case "everyNDays":
      return {
        ...defaults,
        mode: "everyNDays",
        everyNStart: isIsoDate(seedRule.start) ? seedRule.start : seedDate,
        everyNEnd: isIsoDate(seedRule.end) ? seedRule.end : horizonEnd,
        everyNDays: String(Math.max(1, Math.floor(seedRule.intervalDays))),
      };
    case "everyNMonths":
      return {
        ...defaults,
        mode: "monthly",
        monthlyStride: String(Math.max(1, Math.floor(seedRule.intervalMonths))),
        monthlyDay: String(
          Math.min(31, Math.max(1, Math.floor(seedRule.dayOfMonth))),
        ),
        monthlyOffset: String(Math.floor(seedRule.offsetDays)),
        monthlyStartMonth: isIsoDate(seedRule.start)
          ? seedRule.start.slice(0, 7)
          : seedDate.slice(0, 7),
        monthlyEndMonth: isIsoDate(seedRule.end)
          ? seedRule.end.slice(0, 7)
          : horizonEnd.slice(0, 7),
      };
  }
}

export function budgetRecurrenceFormReducer(
  state: RecurrenceFormState,
  action: RecurrenceFormAction,
): RecurrenceFormState {
  switch (action.kind) {
    case "reset":
      return action.state;
    case "setMode":
      return { ...state, mode: action.mode };
    case "setOnceDate":
      return { ...state, onceDate: action.value };
    case "setDateAt": {
      if (action.index < 0 || action.index >= state.datesList.length) {
        return state;
      }
      const next = [...state.datesList];
      next[action.index] = action.value;
      return { ...state, datesList: next };
    }
    case "addDate": {
      const last =
        state.datesList[state.datesList.length - 1] ?? action.fallback;
      return { ...state, datesList: [...state.datesList, last] };
    }
    case "removeDateAt": {
      if (state.datesList.length <= 1) return state;
      if (action.index < 0 || action.index >= state.datesList.length) {
        return state;
      }
      return {
        ...state,
        datesList: state.datesList.filter((_, j) => j !== action.index),
      };
    }
    case "setEveryNStart":
      return { ...state, everyNStart: action.value };
    case "setEveryNEnd":
      return { ...state, everyNEnd: action.value };
    case "setEveryNDays":
      return { ...state, everyNDays: action.value };
    case "setMonthlyStride":
      return { ...state, monthlyStride: action.value };
    case "setMonthlyDay":
      return { ...state, monthlyDay: action.value };
    case "setMonthlyOffset":
      return { ...state, monthlyOffset: action.value };
    case "setMonthlyStartMonth":
      return { ...state, monthlyStartMonth: action.value };
    case "setMonthlyEndMonth":
      return { ...state, monthlyEndMonth: action.value };
  }
}
