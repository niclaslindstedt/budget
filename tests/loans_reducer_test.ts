import { describe, expect, it } from "vitest";

import { learnPaymentPatterns } from "../src/data/loans/patterns";
import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type { Loan, UserData } from "../src/data/types";

function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: "loan-1",
    name: "Car loan",
    kind: "car",
    monthlyPayment: 2500,
    payments: [],
    balanceHistory: [],
    ...over,
  };
}

function state(over: Partial<UserData> = {}): UserData {
  return { ...freshUserData(), ...over };
}

describe("loan CRUD", () => {
  it("adds, edits and deletes a loan", () => {
    const added = reducer(state(), { type: "addLoan", loan: loan() });
    expect(added.loans).toHaveLength(1);

    const edited = reducer(added, {
      type: "updateLoan",
      loanId: "loan-1",
      patch: { name: "Volvo", rate: 4.5 },
    });
    expect(edited.loans[0].name).toBe("Volvo");
    expect(edited.loans[0].rate).toBe(4.5);

    const deleted = reducer(edited, { type: "deleteLoan", loanId: "loan-1" });
    expect(deleted.loans).toHaveLength(0);
  });

  it("deletes a key when the patch carries an explicit undefined", () => {
    const prev = state({ loans: [loan({ rate: 4.5 })] });
    const next = reducer(prev, {
      type: "updateLoan",
      loanId: "loan-1",
      patch: { rate: undefined },
    });
    expect("rate" in next.loans[0]).toBe(false);
  });
});

describe("addLoanPayments", () => {
  it("appends payments and unions learned patterns", () => {
    const prev = state({
      loans: [loan({ paymentPatterns: ["existing key"] })],
    });
    const next = reducer(prev, {
      type: "addLoanPayments",
      loanId: "loan-1",
      payments: [
        { id: "p1", date: "2026-05-27", amount: 2500, sourceHistoryId: "h1" },
      ],
      patterns: ["santander"],
    });
    expect(next.loans[0].payments).toHaveLength(1);
    expect(next.loans[0].paymentPatterns).toEqual([
      "existing key",
      "santander",
    ]);
  });

  it("skips payments whose source entry is already recorded", () => {
    const prev = state({
      loans: [
        loan({
          payments: [
            {
              id: "p1",
              date: "2026-04-27",
              amount: 2500,
              sourceHistoryId: "h1",
            },
          ],
        }),
      ],
    });
    const next = reducer(prev, {
      type: "addLoanPayments",
      loanId: "loan-1",
      payments: [
        { id: "p2", date: "2026-04-27", amount: 2500, sourceHistoryId: "h1" },
        { id: "p3", date: "2026-05-27", amount: 2500, sourceHistoryId: "h2" },
      ],
    });
    expect(next.loans[0].payments.map((p) => p.id)).toEqual(["p1", "p3"]);
  });

  it("stamps type and description overrides onto the imported entries", () => {
    const prev = state({
      loans: [loan()],
      history: {
        "acct-1": [
          {
            id: "h1",
            date: "2026-05-27",
            description: "SANTANDER 12345",
            amount: -2500,
            importedAt: 0,
          },
          {
            id: "h2",
            date: "2026-04-27",
            description: "ICA",
            amount: -300,
            importedAt: 0,
          },
        ],
      },
    });
    const next = reducer(prev, {
      type: "addLoanPayments",
      loanId: "loan-1",
      payments: [
        { id: "p1", date: "2026-05-27", amount: 2500, sourceHistoryId: "h1" },
      ],
      entryOverrides: [
        {
          accountId: "acct-1",
          entryId: "h1",
          userTypeId: "preset-type-car-loan",
          userDescription: "Car loan",
        },
      ],
    });
    const [h1, h2] = next.history["acct-1"];
    expect(h1.userTypeId).toBe("preset-type-car-loan");
    expect(h1.userDescription).toBe("Car loan");
    expect(h1.description).toBe("SANTANDER 12345");
    expect(h2).toBe(prev.history["acct-1"][1]);
  });

  it("leaves history untouched when no overrides are carried", () => {
    const prev = state({
      loans: [loan()],
      history: {
        "acct-1": [
          {
            id: "h1",
            date: "2026-05-27",
            description: "SANTANDER 12345",
            amount: -2500,
            importedAt: 0,
          },
        ],
      },
    });
    const next = reducer(prev, {
      type: "addLoanPayments",
      loanId: "loan-1",
      payments: [
        { id: "p1", date: "2026-05-27", amount: 2500, sourceHistoryId: "h1" },
      ],
    });
    expect(next.history).toBe(prev.history);
  });

  it("deletes one payment and clears all payments", () => {
    const prev = state({
      loans: [
        loan({
          payments: [
            { id: "p1", date: "2026-04-27", amount: 2500 },
            { id: "p2", date: "2026-05-27", amount: 2500 },
          ],
        }),
      ],
    });
    const one = reducer(prev, {
      type: "deleteLoanPayment",
      loanId: "loan-1",
      paymentId: "p1",
    });
    expect(one.loans[0].payments.map((p) => p.id)).toEqual(["p2"]);
    const none = reducer(prev, {
      type: "deleteAllLoanPayments",
      loanId: "loan-1",
    });
    expect(none.loans[0].payments).toHaveLength(0);
  });
});

describe("loan balance snapshots", () => {
  it("appends and deletes balance points", () => {
    const prev = state({ loans: [loan()] });
    const added = reducer(prev, {
      type: "addLoanBalance",
      loanId: "loan-1",
      point: { id: "b1", date: "2026-05-01", value: 90000 },
    });
    expect(added.loans[0].balanceHistory).toEqual([
      { id: "b1", date: "2026-05-01", value: 90000 },
    ]);

    const deleted = reducer(added, {
      type: "deleteLoanBalance",
      loanId: "loan-1",
      pointId: "b1",
    });
    expect(deleted.loans[0].balanceHistory).toHaveLength(0);
  });
});

describe("importBankHistory auto-attach", () => {
  const patterns = learnPaymentPatterns(undefined, ["SANTANDER 12345"]);

  function importAction(accountId = "acct-1") {
    return {
      type: "importBankHistory",
      accountId,
      entries: [
        {
          id: "h-new",
          date: "2026-06-01",
          description: "SANTANDER 99887",
          amount: -2500,
          importedAt: 0,
        },
      ],
      bankParserId: "test",
      filename: "statement.csv",
      now: 1000,
    } as const;
  }

  it("attaches a matching new entry as a payment", () => {
    const prev = state({
      accounts: [{ id: "acct-1", name: "Checking" }],
      loans: [loan({ paymentPatterns: patterns })],
    });
    const next = reducer(prev, importAction());
    expect(next.loans[0].payments).toHaveLength(1);
    expect(next.loans[0].payments[0].amount).toBe(2500);
    expect(next.loans[0].payments[0].date).toBe("2026-06-01");
    const sourceId = next.loans[0].payments[0].sourceHistoryId;
    expect(next.history["acct-1"].some((e) => e.id === sourceId)).toBe(true);
  });

  it("does not re-attach on a duplicate re-import", () => {
    const prev = state({
      accounts: [{ id: "acct-1", name: "Checking" }],
      loans: [loan({ paymentPatterns: patterns })],
    });
    const once = reducer(prev, importAction());
    const twice = reducer(once, importAction());
    expect(twice.loans[0].payments).toHaveLength(1);
  });

  it("skips loans without patterns and linked mortgage loans", () => {
    const prev = state({
      accounts: [{ id: "acct-1", name: "Checking" }],
      properties: [
        {
          id: "prop-1",
          name: "Villa",
          purchaseDate: "2020-01-01",
          valueHistory: [],
          repairs: [],
          files: [],
          mortgages: [{ id: "m-1", name: "Loan 1", payments: [] }],
        },
      ],
      loans: [
        loan({ id: "loan-1" }),
        loan({
          id: "loan-2",
          kind: "mortgage",
          propertyId: "prop-1",
          mortgageIds: ["m-1"],
          paymentPatterns: patterns,
        }),
      ],
    });
    const next = reducer(prev, importAction());
    expect(next.loans[0].payments).toHaveLength(0);
    expect(next.loans[1].payments).toHaveLength(0);
    // Nothing matched ⇒ the loans array is the same reference.
    expect(next.loans).toBe(prev.loans);
  });
});
