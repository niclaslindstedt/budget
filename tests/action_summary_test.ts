import { describe, expect, it } from "vitest";

import { describeActionSubject } from "../src/data/action-summary";
import { reducer, type Action } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type { UserData } from "../src/data/types";

// Apply the real reducer so the before / after snapshots match what the
// dispatch path feeds `describeActionSubject` at runtime.
function describe2(action: Action, prev: UserData) {
  return describeActionSubject(action, prev, reducer(prev, action), "en");
}

describe("describeActionSubject", () => {
  it("names a payslip by employer and pay month", () => {
    const prev: UserData = {
      ...freshUserData(),
      employers: [{ id: "emp1", name: "BookBeat", roles: [] }],
      salaries: [
        { id: "sal1", date: "2026-04-15", net: 16000, employerId: "emp1" },
      ],
    };
    expect(
      describe2({ type: "updateSalary", salaryId: "sal1", patch: {} }, prev),
    ).toEqual({ kind: "name", value: "BookBeat 2026-04" });
  });

  it("reads a deleted entity's name off the previous state", () => {
    const prev: UserData = {
      ...freshUserData(),
      accounts: [{ id: "acc1", name: "Checking" }],
    };
    expect(
      describe2({ type: "deleteAccount", accountId: "acc1" }, prev),
    ).toEqual({
      kind: "name",
      value: "Checking",
    });
  });

  it("counts a multi-row action", () => {
    const fresh = freshUserData();
    const action: Action = {
      type: "deleteRows",
      sheetId: "s",
      itemId: "i",
      rowIds: ["a", "b", "c"],
    };
    expect(describeActionSubject(action, fresh, fresh, "en")).toEqual({
      kind: "count",
      value: 3,
    });
  });

  it("names the single changed setting", () => {
    const prev = freshUserData();
    expect(
      describe2(
        { type: "updateCommonSettings", patch: { currency: "€" } },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Currency" });
  });

  it("counts when several settings change at once", () => {
    const prev = freshUserData();
    const subject = describe2(
      {
        type: "updateCommonSettings",
        patch: { currency: "€", language: "sv" },
      },
      prev,
    );
    expect(subject).toEqual({ kind: "count", value: 2 });
  });

  it("returns undefined for an action with no nameable target", () => {
    const fresh = freshUserData();
    expect(
      describeActionSubject({ type: "reapplyMatchRules" }, fresh, fresh, "en"),
    ).toBeUndefined();
  });
});
