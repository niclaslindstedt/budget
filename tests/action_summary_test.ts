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

  it("names a deleted history entry by its description off the previous state", () => {
    const prev: UserData = {
      ...freshUserData(),
      accounts: [{ id: "acc1", name: "Checking" }],
      history: {
        acc1: [
          {
            id: "h1",
            date: "2026-05-01",
            description: "Grocery store",
            amount: -120,
            importedAt: 0,
          },
        ],
      },
    };
    expect(
      describe2(
        { type: "deleteHistoryEntry", accountId: "acc1", entryId: "h1" },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Grocery store" });
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

  it("names the sheet when updating insights net-worth settings", () => {
    const fresh = freshUserData();
    const insights: UserData["sheets"][number] = {
      ...fresh.sheets[0],
      id: "sheet-insights",
      name: "Insights",
      type: "insights",
      items: [{ id: "view-1", type: "insightsView" }],
    };
    const prev: UserData = {
      ...fresh,
      sheets: [...fresh.sheets, insights],
      accounts: [{ id: "acc-1", name: "Checking" }],
    };
    expect(
      describe2(
        {
          type: "setInsightsNetWorthSettings",
          sheetId: "sheet-insights",
          itemId: "view-1",
          settings: { overrides: { "acc-1": { excluded: true } } },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Insights" });
  });

  it("names scenarios actions by scenario or sheet", () => {
    const fresh = freshUserData();
    const scenariosSheet: UserData["sheets"][number] = {
      ...fresh.sheets[0],
      id: "sheet-scn",
      name: "What if",
      type: "scenarios",
      items: [
        {
          id: "view-1",
          type: "scenariosView",
          baseSheetId: null,
          monitors: [],
          scenarios: [
            { id: "scn-1", name: "Lose my job", overrides: [], addedRows: [] },
          ],
        },
      ],
    };
    const prev: UserData = {
      ...fresh,
      sheets: [...fresh.sheets, scenariosSheet],
    };
    const target = { sheetId: "sheet-scn", itemId: "view-1" } as const;

    // Sheet-level actions name the sheet.
    expect(
      describe2(
        { type: "setScenariosMonitors", ...target, monitors: ["2026-12-31"] },
        prev,
      ),
    ).toEqual({ kind: "name", value: "What if" });
    expect(
      describe2(
        {
          type: "setScenariosBaseSheet",
          ...target,
          baseSheetId: fresh.sheets[0].id,
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "What if" });

    // Creates name the payload; per-scenario edits resolve off next.
    expect(
      describe2(
        {
          type: "addScenario",
          ...target,
          scenario: {
            id: "scn-2",
            name: "New car",
            overrides: [],
            addedRows: [],
          },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "New car" });
    expect(
      describe2(
        {
          type: "setScenarioOverride",
          ...target,
          scenarioId: "scn-1",
          override: { rowId: "r1", amount: 0 },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Lose my job" });
    expect(
      describe2(
        {
          type: "propagateScenarioOverrideToFuture",
          ...target,
          scenarioId: "scn-1",
          rowId: "r1",
          field: "amount",
          value: 0,
          untilIso: null,
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Lose my job" });
    expect(
      describe2(
        {
          type: "addScenarioRows",
          ...target,
          scenarioId: "scn-1",
          rows: [{ id: "a1", date: "2026-01-01", description: "X", amount: 1 }],
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Lose my job" });
    expect(
      describe2(
        {
          type: "deleteScenarioRows",
          ...target,
          scenarioId: "scn-1",
          rowIds: ["a1"],
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Lose my job" });

    // Deletes read the name off prev (the scenario is gone in next).
    expect(
      describe2(
        { type: "deleteScenario", ...target, scenarioId: "scn-1" },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Lose my job" });
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

  it("names a loan across its CRUD and payment actions", () => {
    const prev: UserData = {
      ...freshUserData(),
      loans: [
        {
          id: "loan-1",
          name: "Volvo loan",
          kind: "car",
          payments: [{ id: "pay-1", date: "2026-05-27", amount: 2500 }],
          balanceHistory: [{ id: "bal-1", date: "2026-05-01", value: 90000 }],
        },
      ],
    };
    expect(
      describe2(
        {
          type: "addLoan",
          loan: {
            id: "l2",
            name: "CSN",
            kind: "student",
            payments: [],
            balanceHistory: [],
          },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "CSN" });
    expect(
      describe2(
        { type: "updateLoan", loanId: "loan-1", patch: { rate: 4.5 } },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Volvo loan" });
    expect(describe2({ type: "deleteLoan", loanId: "loan-1" }, prev)).toEqual({
      kind: "name",
      value: "Volvo loan",
    });
    expect(
      describe2(
        {
          type: "addLoanPayments",
          loanId: "loan-1",
          payments: [{ id: "pay-2", date: "2026-06-27", amount: 2500 }],
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Volvo loan" });
    expect(
      describe2(
        { type: "deleteLoanPayment", loanId: "loan-1", paymentId: "pay-1" },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Volvo loan" });
    expect(
      describe2({ type: "deleteAllLoanPayments", loanId: "loan-1" }, prev),
    ).toEqual({ kind: "name", value: "Volvo loan" });
    expect(
      describe2(
        {
          type: "addLoanBalance",
          loanId: "loan-1",
          point: { id: "bal-2", date: "2026-06-01", value: 87500 },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Volvo loan" });
    expect(
      describe2(
        { type: "deleteLoanBalance", loanId: "loan-1", pointId: "bal-1" },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Volvo loan" });
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
    expect(
      describe2(
        {
          type: "addRepairReceipt",
          propertyId: "p1",
          repairId: "r1",
          receipt: {
            id: "rc1",
            path: "Apartment/receipts/a.pdf",
            date: "2026-01-20",
          },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        {
          type: "updateRepairReceipt",
          propertyId: "p1",
          repairId: "r1",
          receiptId: "rc1",
          patch: { date: "2026-02-01" },
        },
        prev,
      ),
    ).toEqual({ kind: "name", value: "Apartment" });
    expect(
      describe2(
        {
          type: "removeRepairReceipt",
          propertyId: "p1",
          repairId: "r1",
          receiptId: "rc1",
        },
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
