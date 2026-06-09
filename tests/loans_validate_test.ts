import { describe, expect, it } from "vitest";

import { migrate } from "../src/data/migrations";
import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { Loan, UserData } from "../src/data/types";

function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: "loan-1",
    name: "Car loan",
    kind: "car",
    startDate: "2026-01-15",
    startSum: 120000,
    monthlyPayment: 2500,
    rate: 4.5,
    startFee: 495,
    payments: [{ id: "p1", date: "2026-02-27", amount: 2500 }],
    ...over,
  };
}

function blob(loans: unknown[]): UserData {
  return { ...freshUserData(), loans: loans as Loan[] };
}

describe("validateLoan via validateUserData", () => {
  it("round-trips a fully populated loan", () => {
    const data = blob([
      loan({
        glyph: "car",
        color: "#e06c75",
        description: "The Volvo",
        paymentPatterns: ["santander"],
      }),
    ]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.loans).toEqual(data.loans);
  });

  it("rejects an unknown kind and duplicate ids", () => {
    expect(validateUserData(blob([loan({ kind: "payday" as never })])).ok).toBe(
      false,
    );
    expect(validateUserData(blob([loan(), loan()])).ok).toBe(false);
  });

  it("drops a dangling companyId but keeps a resolvable one", () => {
    const data = {
      ...blob([loan({ companyId: "gone" })]),
      companies: [],
    };
    const r1 = validateUserData(data);
    expect(r1.ok && r1.value.loans[0].companyId).toBeFalsy();

    const withCompany = {
      ...blob([loan({ companyId: "co-1" })]),
      companies: [{ id: "co-1", name: "Santander" }],
    };
    const r2 = validateUserData(withCompany);
    expect(r2.ok && r2.value.loans[0].companyId).toBe("co-1");
  });

  it("drops a half-dangling mortgage link as a pair", () => {
    const properties = [
      {
        id: "prop-1",
        name: "Villa",
        purchaseDate: "2020-01-01",
        valueHistory: [],
        repairs: [],
        files: [],
        mortgages: [{ id: "m-1", name: "Loan 1", payments: [] }],
      },
    ];
    const dangling = {
      ...blob([
        loan({ kind: "mortgage", propertyId: "prop-1", mortgageId: "gone" }),
      ]),
      properties,
    };
    const r1 = validateUserData(dangling);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.value.loans[0].propertyId).toBeUndefined();
      expect(r1.value.loans[0].mortgageId).toBeUndefined();
    }

    const linked = {
      ...blob([
        loan({ kind: "mortgage", propertyId: "prop-1", mortgageId: "m-1" }),
      ]),
      properties,
    };
    const r2 = validateUserData(linked);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.loans[0].propertyId).toBe("prop-1");
      expect(r2.value.loans[0].mortgageId).toBe("m-1");
    }
  });

  it("sweeps malformed payments and negative figures instead of failing", () => {
    const data = blob([
      loan({
        startSum: -5 as number,
        payments: [
          { id: "p1", date: "2026-02-27", amount: 2500 },
          { id: "", date: "2026-02-27", amount: 2500 },
          { id: "p2", date: "not-a-date", amount: 2500 },
          { id: "p1", date: "2026-03-27", amount: 2500 },
        ] as Loan["payments"],
      }),
    ]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.loans[0].startSum).toBeUndefined();
      expect(result.value.loans[0].payments.map((p) => p.id)).toEqual(["p1"]);
    }
  });
});

describe("migration v72 → v73", () => {
  it("fills loans: [] on an old blob", () => {
    const old = { ...freshUserData(), version: 72 } as Record<string, unknown>;
    delete old.loans;
    const { data, migrated } = migrate(old as never);
    expect(migrated).toBe(true);
    expect(data.version).toBe(73);
    expect((data as UserData).loans).toEqual([]);
  });
});
