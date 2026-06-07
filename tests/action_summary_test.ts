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

  it("names the moved sheet when reordering sheets", () => {
    const fresh = freshUserData();
    const [first] = fresh.sheets;
    const second = { ...first, id: "sheet2", name: "Savings" };
    const prev: UserData = { ...fresh, sheets: [first, second] };
    expect(
      describe2(
        { type: "reorderSheets", fromId: "sheet2", toId: first.id },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Savings" });
  });

  it("names the sheet when toggling its favorite flag", () => {
    const fresh = freshUserData();
    const [first] = fresh.sheets;
    const prev: UserData = {
      ...fresh,
      sheets: [{ ...first, name: "Vacation" }],
    };
    expect(
      describe2({ type: "toggleSheetFavorite", sheetId: first.id }, prev),
    ).toEqual({ kind: "name", value: "Vacation" });
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

  it("names a property on edit and reads a deleted one off prev", () => {
    const prev: UserData = {
      ...freshUserData(),
      properties: [
        {
          id: "p1",
          name: "Apartment",
          valueHistory: [],
          mortgages: [],
          repairs: [],
        },
      ],
    };
    expect(
      describe2(
        { type: "updateProperty", propertyId: "p1", patch: { name: "Cabin" } },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Cabin" });
    expect(
      describe2({ type: "deleteProperty", propertyId: "p1" }, prev),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        {
          type: "setPropertySaleEstimate",
          propertyId: "p1",
          estimate: { broker: { mode: "none" } },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
  });

  it("names the mortgage and counts added payments", () => {
    const prev: UserData = {
      ...freshUserData(),
      properties: [
        {
          id: "p1",
          name: "Apartment",
          valueHistory: [],
          mortgages: [{ id: "m1", name: "SBAB loan", payments: [] }],
          repairs: [],
        },
      ],
    };
    expect(
      describe2(
        {
          type: "updateMortgage",
          propertyId: "p1",
          mortgageId: "m1",
          patch: { name: "Refinance" },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Refinance" });
    expect(
      describe2(
        {
          type: "addMortgagePayments",
          propertyId: "p1",
          mortgageId: "m1",
          payments: [
            { id: "x", date: "2026-01-28", amount: 5500 },
            { id: "y", date: "2026-02-28", amount: 5490 },
          ],
        },
        prev,
      ),
    ).toEqual({ kind: "count", value: 2 });
    expect(
      describe2(
        {
          type: "addMortgagePaymentsForProperty",
          propertyId: "p1",
          paymentsByMortgageId: {
            m1: [{ id: "x", date: "2026-01-28", amount: 5500 }],
          },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        {
          type: "setMortgageChargeSplit",
          propertyId: "p1",
          updates: [
            {
              mortgageId: "m1",
              paymentId: "x",
              amount: 5400,
              date: "2026-01-28",
            },
          ],
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2({ type: "deleteAllMortgagePayments", propertyId: "p1" }, prev),
    ).toEqual({ kind: "name", value: "Apartment" });
  });

  it("counts added repairs and names the property on delete", () => {
    const prev: UserData = {
      ...freshUserData(),
      properties: [
        {
          id: "p1",
          name: "Apartment",
          valueHistory: [],
          mortgages: [],
          repairs: [
            {
              id: "r1",
              date: "2026-01-20",
              amount: 6800,
              description: "Plumber",
              typeId: "preset-type-repairs",
              accountId: "a1",
              sourceHistoryId: "h1",
            },
          ],
        },
      ],
    };
    expect(
      describe2(
        {
          type: "addRepairs",
          propertyId: "p1",
          repairs: [
            {
              id: "r2",
              date: "2026-03-10",
              amount: 4500,
              description: "Hardware",
              typeId: "preset-type-repairs",
              accountId: "a1",
              sourceHistoryId: "h2",
            },
            {
              id: "r3",
              date: "2026-04-05",
              amount: 3200,
              description: "Paint",
              typeId: "preset-type-renovations",
              accountId: "a1",
              sourceHistoryId: "h3",
            },
          ],
        },
        prev,
      ),
    ).toEqual({ kind: "count", value: 2 });
    expect(
      describe2(
        {
          type: "updateRepair",
          propertyId: "p1",
          repairId: "r1",
          patch: { description: "Plumber — kitchen sink" },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        { type: "deleteRepair", propertyId: "p1", repairId: "r1" },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
  });

  it("names the property on file actions and the category on category actions", () => {
    const prev: UserData = {
      ...freshUserData(),
      properties: [
        {
          id: "p1",
          name: "Apartment",
          valueHistory: [],
          mortgages: [],
          repairs: [],
          files: [{ id: "f1", path: "Apartment/files/policy.pdf" }],
        },
      ],
      fileCategories: [{ id: "fc1", name: "Insurance" }],
    };
    expect(
      describe2(
        {
          type: "addPropertyFile",
          propertyId: "p1",
          file: { id: "f2", path: "Apartment/files/deed.pdf" },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        {
          type: "updatePropertyFile",
          propertyId: "p1",
          fileId: "f1",
          patch: { description: "Home insurance" },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        { type: "deletePropertyFile", propertyId: "p1", fileId: "f1" },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        {
          type: "updateFileCategory",
          categoryId: "fc1",
          patch: { name: "Policies" },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Policies" });
    expect(
      describe2({ type: "deleteFileCategory", categoryId: "fc1" }, prev),
    ).toEqual({ kind: "name", value: "Insurance" });
    expect(
      describeActionSubject(
        { type: "addFileCategory", category: { id: "fc2", name: "Manuals" } },
        prev,
        prev,
        "en",
      ),
    ).toEqual({ kind: "name", value: "Manuals" });
  });

  it("returns undefined for an action with no nameable target", () => {
    const fresh = freshUserData();
    expect(
      describeActionSubject({ type: "reapplyMatchRules" }, fresh, fresh, "en"),
    ).toBeUndefined();
  });
});
