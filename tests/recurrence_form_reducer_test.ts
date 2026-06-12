import { describe, expect, it } from "vitest";

import {
  recurrenceFormReducer,
  initialRecurrenceFormState,
  type RecurrenceFormState,
} from "../src/components/recurrence-form-reducer";

const SEED = "2026-03-15";
const HORIZON = "2026-09-15";

function makeInitial(): RecurrenceFormState {
  return initialRecurrenceFormState(null, SEED, HORIZON, true);
}

describe("initialRecurrenceFormState", () => {
  it("defaults to `once` mode seeded from `seedDate` when no rule is supplied", () => {
    const state = initialRecurrenceFormState(null, SEED, HORIZON, true);
    expect(state.mode).toBe("once");
    expect(state.onceDate).toBe(SEED);
    expect(state.datesList).toEqual([SEED]);
    expect(state.everyNStart).toBe(SEED);
    expect(state.everyNEnd).toBe(HORIZON);
    expect(state.everyNDays).toBe("14");
    expect(state.monthlyStride).toBe("1");
    expect(state.monthlyDay).toBe("15");
    expect(state.monthlyOffset).toBe("0");
    expect(state.monthlyStartMonth).toBe("2026-03");
    expect(state.monthlyEndMonth).toBe("2026-09");
  });

  it("defaults to `monthly` when `includeOnce` is false", () => {
    const state = initialRecurrenceFormState(null, SEED, HORIZON, false);
    expect(state.mode).toBe("monthly");
  });

  it("downgrades a `once` rule to `dates` when `includeOnce` is false", () => {
    const state = initialRecurrenceFormState(
      { kind: "once", date: "2026-04-01" },
      SEED,
      HORIZON,
      false,
    );
    expect(state.mode).toBe("dates");
    expect(state.datesList).toEqual(["2026-04-01"]);
  });

  it("pre-fills `everyNDays` from an `everyNDays` seed rule", () => {
    const state = initialRecurrenceFormState(
      {
        kind: "everyNDays",
        start: "2026-03-01",
        end: "2026-12-01",
        intervalDays: 21,
      },
      SEED,
      HORIZON,
      true,
    );
    expect(state.mode).toBe("everyNDays");
    expect(state.everyNStart).toBe("2026-03-01");
    expect(state.everyNEnd).toBe("2026-12-01");
    expect(state.everyNDays).toBe("21");
  });

  it("pre-fills `monthly` from an `everyNMonths` seed rule", () => {
    const state = initialRecurrenceFormState(
      {
        kind: "everyNMonths",
        intervalMonths: 3,
        dayOfMonth: 28,
        offsetDays: -2,
        start: "2026-01-01",
        end: "2026-12-31",
      },
      SEED,
      HORIZON,
      true,
    );
    expect(state.mode).toBe("monthly");
    expect(state.monthlyStride).toBe("3");
    expect(state.monthlyDay).toBe("28");
    expect(state.monthlyOffset).toBe("-2");
    expect(state.monthlyStartMonth).toBe("2026-01");
    expect(state.monthlyEndMonth).toBe("2026-12");
  });

  it("clamps an `everyNMonths` dayOfMonth above 31 back to 31", () => {
    const state = initialRecurrenceFormState(
      {
        kind: "everyNMonths",
        intervalMonths: 1,
        dayOfMonth: 99,
        offsetDays: 0,
        start: SEED,
        end: HORIZON,
      },
      SEED,
      HORIZON,
      true,
    );
    expect(state.monthlyDay).toBe("31");
  });

  it("falls back to `seedDate` when a `dates` seed rule has only invalid entries", () => {
    const state = initialRecurrenceFormState(
      { kind: "dates", dates: ["not-an-iso", "also-bad"] },
      SEED,
      HORIZON,
      true,
    );
    expect(state.mode).toBe("dates");
    expect(state.datesList).toEqual([SEED]);
  });
});

describe("recurrenceFormReducer", () => {
  it("replaces the whole slice atomically on `reset`", () => {
    const init = makeInitial();
    const next: RecurrenceFormState = {
      ...init,
      mode: "monthly",
      monthlyStride: "3",
      everyNDays: "30",
    };
    const after = recurrenceFormReducer(init, {
      kind: "reset",
      state: next,
    });
    expect(after).toEqual(next);
  });

  it("changes the mode without disturbing other fields", () => {
    const init = makeInitial();
    const after = recurrenceFormReducer(init, {
      kind: "setMode",
      mode: "monthly",
    });
    expect(after.mode).toBe("monthly");
    expect(after.onceDate).toBe(init.onceDate);
    expect(after.datesList).toBe(init.datesList);
  });

  it("updates a single date in the list at the requested index", () => {
    const init: RecurrenceFormState = {
      ...makeInitial(),
      datesList: ["2026-03-01", "2026-03-15", "2026-03-31"],
    };
    const after = recurrenceFormReducer(init, {
      kind: "setDateAt",
      index: 1,
      value: "2026-04-10",
    });
    expect(after.datesList).toEqual(["2026-03-01", "2026-04-10", "2026-03-31"]);
  });

  it("ignores `setDateAt` for an out-of-range index", () => {
    const init = makeInitial();
    const after = recurrenceFormReducer(init, {
      kind: "setDateAt",
      index: 99,
      value: "2026-04-10",
    });
    expect(after).toBe(init);
  });

  it("appends a duplicate of the last entry on `addDate`", () => {
    const init: RecurrenceFormState = {
      ...makeInitial(),
      datesList: ["2026-03-15"],
    };
    const after = recurrenceFormReducer(init, {
      kind: "addDate",
      fallback: SEED,
    });
    expect(after.datesList).toEqual(["2026-03-15", "2026-03-15"]);
  });

  it("falls back to `fallback` on `addDate` when the list is somehow empty", () => {
    const init: RecurrenceFormState = { ...makeInitial(), datesList: [] };
    const after = recurrenceFormReducer(init, {
      kind: "addDate",
      fallback: "2026-05-01",
    });
    expect(after.datesList).toEqual(["2026-05-01"]);
  });

  it("removes the date at the requested index", () => {
    const init: RecurrenceFormState = {
      ...makeInitial(),
      datesList: ["a", "b", "c"],
    };
    const after = recurrenceFormReducer(init, {
      kind: "removeDateAt",
      index: 1,
    });
    expect(after.datesList).toEqual(["a", "c"]);
  });

  it("refuses to remove the last remaining date", () => {
    const init: RecurrenceFormState = {
      ...makeInitial(),
      datesList: ["a"],
    };
    const after = recurrenceFormReducer(init, {
      kind: "removeDateAt",
      index: 0,
    });
    expect(after).toBe(init);
  });

  it("ignores `removeDateAt` for an out-of-range index", () => {
    const init: RecurrenceFormState = {
      ...makeInitial(),
      datesList: ["a", "b"],
    };
    const after = recurrenceFormReducer(init, {
      kind: "removeDateAt",
      index: 5,
    });
    expect(after).toBe(init);
  });

  it("updates the simple string fields one at a time", () => {
    const init = makeInitial();
    const after = recurrenceFormReducer(init, {
      kind: "setEveryNDays",
      value: "30",
    });
    expect(after.everyNDays).toBe("30");
    expect(after.monthlyStride).toBe(init.monthlyStride);
  });

  it("threads all the simple setter arms", () => {
    let state = makeInitial();
    state = recurrenceFormReducer(state, {
      kind: "setOnceDate",
      value: "2026-06-01",
    });
    state = recurrenceFormReducer(state, {
      kind: "setEveryNStart",
      value: "2026-06-02",
    });
    state = recurrenceFormReducer(state, {
      kind: "setEveryNEnd",
      value: "2026-12-31",
    });
    state = recurrenceFormReducer(state, {
      kind: "setMonthlyStride",
      value: "12",
    });
    state = recurrenceFormReducer(state, {
      kind: "setMonthlyDay",
      value: "27",
    });
    state = recurrenceFormReducer(state, {
      kind: "setMonthlyOffset",
      value: "-1",
    });
    state = recurrenceFormReducer(state, {
      kind: "setMonthlyStartMonth",
      value: "2026-07",
    });
    state = recurrenceFormReducer(state, {
      kind: "setMonthlyEndMonth",
      value: "2027-01",
    });
    expect(state.onceDate).toBe("2026-06-01");
    expect(state.everyNStart).toBe("2026-06-02");
    expect(state.everyNEnd).toBe("2026-12-31");
    expect(state.monthlyStride).toBe("12");
    expect(state.monthlyDay).toBe("27");
    expect(state.monthlyOffset).toBe("-1");
    expect(state.monthlyStartMonth).toBe("2026-07");
    expect(state.monthlyEndMonth).toBe("2027-01");
  });
});
