import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { Loan, UserData } from "../src/data/types";

function loan(over: Partial<Loan> = {}): Loan {
  return {
    id: "loan-1",
    name: "Car loan",
    kind: "car",
    startDate: "2026-01-15",
    monthlyPayment: 2500,
    rate: 4.5,
    startFee: 495,
    payments: [{ id: "p1", date: "2026-02-27", amount: 2500 }],
    balanceHistory: [{ id: "b1", date: "2026-01-15", value: 120495 }],
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
        loan({ kind: "mortgage", propertyId: "prop-1", mortgageIds: ["gone"] }),
      ]),
      properties,
    };
    const r1 = validateUserData(dangling);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.value.loans[0].propertyId).toBeUndefined();
      expect(r1.value.loans[0].mortgageIds).toBeUndefined();
    }

    // A deleted mortgage falls out of the list; the surviving subset
    // keeps the link alive.
    const partial = {
      ...blob([
        loan({
          kind: "mortgage",
          propertyId: "prop-1",
          mortgageIds: ["m-1", "gone"],
        }),
      ]),
      properties,
    };
    const r2 = validateUserData(partial);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value.loans[0].propertyId).toBe("prop-1");
      expect(r2.value.loans[0].mortgageIds).toEqual(["m-1"]);
    }
  });

  it("sweeps malformed payments and balance points instead of failing", () => {
    const data = blob([
      loan({
        payments: [
          { id: "p1", date: "2026-02-27", amount: 2500 },
          { id: "", date: "2026-02-27", amount: 2500 },
          { id: "p2", date: "not-a-date", amount: 2500 },
          { id: "p1", date: "2026-03-27", amount: 2500 },
        ] as Loan["payments"],
        balanceHistory: [
          { id: "b1", date: "2026-01-15", value: 120495 },
          { id: "", date: "2026-01-15", value: 1 },
          { id: "b2", date: "not-a-date", value: 1 },
          { id: "b3", date: "2026-02-15", value: -5 },
          { id: "b1", date: "2026-03-15", value: 1 },
        ] as Loan["balanceHistory"],
      }),
    ]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.loans[0].payments.map((p) => p.id)).toEqual(["p1"]);
      expect(result.value.loans[0].balanceHistory.map((b) => b.id)).toEqual([
        "b1",
      ]);
    }
  });
});

describe("loan migrations", () => {
  it("v72 → fills loans: [] on an old blob", () => {
    const old = { ...freshUserData(), version: 72 } as Record<string, unknown>;
    delete old.loans;
    const { data, migrated } = migrate(old as never);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    expect((data as UserData).loans).toEqual([]);
  });

  it("v73 → converts a single mortgageId link to mortgageIds", () => {
    const old = {
      ...freshUserData(),
      version: 73,
      loans: [
        {
          id: "loan-1",
          name: "Bolån",
          kind: "mortgage",
          propertyId: "prop-1",
          mortgageId: "m-1",
          payments: [],
        },
      ],
    } as Record<string, unknown>;
    const { data, migrated } = migrate(old as never);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const loans = (data as UserData).loans as Array<Record<string, unknown>>;
    expect(loans[0].mortgageIds).toEqual(["m-1"]);
    expect("mortgageId" in loans[0]).toBe(false);
  });

  it("v74 → converts startSum (+ fee) to a balance snapshot at the start date", () => {
    const old = {
      ...freshUserData(),
      version: 74,
      loans: [
        {
          id: "loan-1",
          name: "Billån",
          kind: "car",
          startDate: "2024-08-12",
          startSum: 145000,
          startFee: 595,
          payments: [],
        },
      ],
    } as Record<string, unknown>;
    const { data, migrated } = migrate(old as never);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const loans = (data as UserData).loans as Array<Record<string, unknown>>;
    expect("startSum" in loans[0]).toBe(false);
    // The fee stays as informational metadata; its financed value rides
    // the snapshot.
    expect(loans[0].startFee).toBe(595);
    const points = loans[0].balanceHistory as Array<Record<string, unknown>>;
    expect(points).toHaveLength(1);
    expect(points[0].date).toBe("2024-08-12");
    expect(points[0].value).toBe(145595);
  });

  it("v74 → anchors before the earliest payment when no start date exists", () => {
    const old = {
      ...freshUserData(),
      version: 74,
      loans: [
        {
          id: "loan-1",
          name: "CSN",
          kind: "student",
          startSum: 100000,
          payments: [
            { id: "p2", date: "2026-02-27", amount: 1000 },
            { id: "p1", date: "2026-01-27", amount: 1000 },
          ],
        },
      ],
    } as Record<string, unknown>;
    const { data } = migrate(old as never);
    const loans = (data as UserData).loans as Array<Record<string, unknown>>;
    const points = loans[0].balanceHistory as Array<Record<string, unknown>>;
    expect(points).toHaveLength(1);
    // The day before the earliest payment, so both payments still
    // amortise from the snapshot.
    expect(points[0].date).toBe("2026-01-26");
    expect(points[0].value).toBe(100000);
  });

  it("v74 → seeds an empty balance history when no startSum exists", () => {
    const old = {
      ...freshUserData(),
      version: 74,
      loans: [{ id: "loan-1", name: "Bolån", kind: "mortgage", payments: [] }],
    } as Record<string, unknown>;
    const { data } = migrate(old as never);
    const loans = (data as UserData).loans as Array<Record<string, unknown>>;
    expect(loans[0].balanceHistory).toEqual([]);
  });
});
