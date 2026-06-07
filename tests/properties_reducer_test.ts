import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import { validateUserData } from "../src/data/validate";
import type {
  Mortgage,
  MortgagePayment,
  Property,
  PropertyValuePoint,
  UserData,
} from "../src/data/types";

const PROPERTY: Property = {
  id: "p1",
  name: "Apartment",
  purchaseAmount: 3_000_000,
  valueHistory: [],
  mortgages: [],
  repairs: [],
  files: [],
};

const MORTGAGE: Mortgage = {
  id: "m1",
  name: "SBAB loan 1",
  payments: [],
};

// Round-trip a reducer result through serialize/validate so the test
// proves the output survives a persist + reload. Returns the revalidated
// state (which strips any drift) for further assertions.
function revalidate(data: UserData): UserData {
  const result = validateUserData(JSON.parse(JSON.stringify(data)));
  if (!result.ok) throw new Error(`revalidate failed: ${result.error}`);
  return result.value;
}

function seeded(): UserData {
  return reducer(freshUserData(), { type: "addProperty", property: PROPERTY });
}

describe("properties reducer — properties", () => {
  it("adds, edits, and deletes a property", () => {
    let data = seeded();
    expect(data.properties).toEqual([PROPERTY]);

    data = reducer(data, {
      type: "updateProperty",
      propertyId: "p1",
      patch: { name: "Summer house", purchaseAmount: undefined },
    });
    expect(data.properties[0].name).toBe("Summer house");
    // An explicit `undefined` deletes the key rather than storing it, so
    // the live record matches one reloaded from storage.
    expect("purchaseAmount" in data.properties[0]).toBe(false);
    expect(revalidate(data).properties[0]).toEqual(data.properties[0]);

    data = reducer(data, { type: "deleteProperty", propertyId: "p1" });
    expect(data.properties).toEqual([]);
  });

  it("records and clears a property size, surviving a reload", () => {
    let data = seeded();

    data = reducer(data, {
      type: "updateProperty",
      propertyId: "p1",
      patch: { size: 72.5 },
    });
    expect(data.properties[0].size).toBe(72.5);
    expect(revalidate(data).properties[0].size).toBe(72.5);

    // A negative size is rejected by the validator (dropped to absent)
    // rather than stored.
    const withBadSize = revalidate({
      ...data,
      properties: [{ ...data.properties[0], size: -10 }],
    });
    expect("size" in withBadSize.properties[0]).toBe(false);

    // Clearing the field (undefined patch) removes the key entirely.
    data = reducer(data, {
      type: "updateProperty",
      propertyId: "p1",
      patch: { size: undefined },
    });
    expect("size" in data.properties[0]).toBe(false);
  });
});

describe("properties reducer — value history", () => {
  it("appends, edits, and deletes value points; current value = latest", () => {
    const p1: PropertyValuePoint = { id: "v1", date: "2025-01-01", value: 100 };
    const p2: PropertyValuePoint = { id: "v2", date: "2026-01-01", value: 150 };
    let data = reducer(seeded(), {
      type: "addPropertyValue",
      propertyId: "p1",
      point: p1,
    });
    data = reducer(data, {
      type: "addPropertyValue",
      propertyId: "p1",
      point: p2,
    });
    expect(data.properties[0].valueHistory).toEqual([p1, p2]);
    // Latest by date is the current value.
    const latest = [...data.properties[0].valueHistory].sort((a, b) =>
      a.date < b.date ? 1 : -1,
    )[0];
    expect(latest.value).toBe(150);

    data = reducer(data, {
      type: "updatePropertyValue",
      propertyId: "p1",
      pointId: "v2",
      patch: { value: 175 },
    });
    expect(data.properties[0].valueHistory[1].value).toBe(175);

    data = reducer(data, {
      type: "deletePropertyValue",
      propertyId: "p1",
      pointId: "v1",
    });
    expect(data.properties[0].valueHistory).toEqual([
      { id: "v2", date: "2026-01-01", value: 175 },
    ]);
    expect(revalidate(data).properties[0].valueHistory).toEqual(
      data.properties[0].valueHistory,
    );
  });
});

describe("properties reducer — mortgages and payments", () => {
  it("adds, edits, and deletes a mortgage under a property", () => {
    let data = reducer(seeded(), {
      type: "addMortgage",
      propertyId: "p1",
      mortgage: MORTGAGE,
    });
    expect(data.properties[0].mortgages).toEqual([MORTGAGE]);

    data = reducer(data, {
      type: "updateMortgage",
      propertyId: "p1",
      mortgageId: "m1",
      patch: { name: "Refinanced loan" },
    });
    expect(data.properties[0].mortgages[0].name).toBe("Refinanced loan");

    data = reducer(data, {
      type: "deleteMortgage",
      propertyId: "p1",
      mortgageId: "m1",
    });
    expect(data.properties[0].mortgages).toEqual([]);
  });

  it("bulk-adds payments and edits / deletes one", () => {
    const payments: MortgagePayment[] = [
      { id: "pay1", date: "2026-01-28", amount: 5500 },
      { id: "pay2", date: "2026-02-28", amount: 5500 },
    ];
    let data = reducer(seeded(), {
      type: "addMortgage",
      propertyId: "p1",
      mortgage: MORTGAGE,
    });
    data = reducer(data, {
      type: "addMortgagePayments",
      propertyId: "p1",
      mortgageId: "m1",
      payments,
    });
    expect(data.properties[0].mortgages[0].payments).toEqual(payments);

    data = reducer(data, {
      type: "updateMortgagePayment",
      propertyId: "p1",
      mortgageId: "m1",
      paymentId: "pay1",
      patch: { amount: 1600 },
    });
    expect(data.properties[0].mortgages[0].payments[0].amount).toBe(1600);

    data = reducer(data, {
      type: "deleteMortgagePayment",
      propertyId: "p1",
      mortgageId: "m1",
      paymentId: "pay2",
    });
    expect(data.properties[0].mortgages[0].payments).toHaveLength(1);
    expect(revalidate(data).properties[0].mortgages[0].payments).toEqual(
      data.properties[0].mortgages[0].payments,
    );
  });

  it("clears every payment across a property's mortgages in one pass", () => {
    let data = reducer(seeded(), {
      type: "addMortgage",
      propertyId: "p1",
      mortgage: { ...MORTGAGE, id: "m1" },
    });
    data = reducer(data, {
      type: "addMortgage",
      propertyId: "p1",
      mortgage: { ...MORTGAGE, id: "m2", name: "SBAB loan 2" },
    });
    data = reducer(data, {
      type: "addMortgagePaymentsForProperty",
      propertyId: "p1",
      paymentsByMortgageId: {
        m1: [
          { id: "a", date: "2026-01-28", amount: 8000, sourceHistoryId: "h1" },
        ],
        m2: [
          { id: "b", date: "2026-01-28", amount: 2000, sourceHistoryId: "h1" },
        ],
      },
    });
    expect(data.properties[0].mortgages[0].payments).toHaveLength(1);
    expect(data.properties[0].mortgages[1].payments).toHaveLength(1);

    data = reducer(data, {
      type: "deleteAllMortgagePayments",
      propertyId: "p1",
    });
    expect(data.properties[0].mortgages[0].payments).toEqual([]);
    expect(data.properties[0].mortgages[1].payments).toEqual([]);
    expect(revalidate(data).properties[0].mortgages).toEqual(
      data.properties[0].mortgages,
    );
  });

  it("adds split payments to several mortgages in one pass", () => {
    let data = reducer(seeded(), {
      type: "addMortgage",
      propertyId: "p1",
      mortgage: { ...MORTGAGE, id: "m1" },
    });
    data = reducer(data, {
      type: "addMortgage",
      propertyId: "p1",
      mortgage: { ...MORTGAGE, id: "m2", name: "SBAB loan 2" },
    });
    data = reducer(data, {
      type: "addMortgagePaymentsForProperty",
      propertyId: "p1",
      paymentsByMortgageId: {
        m1: [
          { id: "a", date: "2026-01-28", amount: 8000, sourceHistoryId: "h1" },
        ],
        m2: [
          { id: "b", date: "2026-01-28", amount: 4000, sourceHistoryId: "h1" },
        ],
      },
    });
    const mortgages = data.properties[0].mortgages;
    expect(mortgages.find((m) => m.id === "m1")?.payments).toHaveLength(1);
    expect(mortgages.find((m) => m.id === "m2")?.payments[0].amount).toBe(4000);
    // The same source transaction backs both legs (1-1 connection).
    expect(mortgages.every((m) => m.payments[0].sourceHistoryId === "h1")).toBe(
      true,
    );
    expect(revalidate(data).properties[0].mortgages).toEqual(mortgages);
  });

  it("strips a property's lender when the company is deleted", () => {
    let data = reducer(seeded(), {
      type: "addCompany",
      company: { id: "co1", name: "SBAB" },
    });
    data = reducer(data, {
      type: "updateProperty",
      propertyId: "p1",
      patch: { companyId: "co1" },
    });
    expect(data.properties[0].companyId).toBe("co1");

    data = reducer(data, { type: "deleteCompany", companyId: "co1" });
    expect("companyId" in data.properties[0]).toBe(false);
    // The cleaned record matches one reloaded from storage.
    expect(revalidate(data).properties[0]).toEqual(data.properties[0]);
  });

  it("drops a dangling lender reference on load", () => {
    const data = reducer(seeded(), {
      type: "updateProperty",
      propertyId: "p1",
      patch: { companyId: "ghost" },
    });
    // No such company exists, so the validator sweeps the reference.
    expect("companyId" in revalidate(data).properties[0]).toBe(false);
  });
});

describe("properties reducer — repairs", () => {
  const REPAIR = {
    id: "r1",
    date: "2026-01-20",
    amount: 6800,
    description: "Plumber",
    typeId: "preset-type-repairs",
    accountId: "a1",
    sourceHistoryId: "h1",
  } as const;

  it("adds repairs, then deletes one, surviving a reload", () => {
    let data = reducer(seeded(), {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [
        { ...REPAIR },
        {
          id: "r2",
          date: "2026-04-05",
          amount: 3200,
          description: "Paint",
          typeId: "preset-type-renovations",
          accountId: "a1",
          sourceHistoryId: "h2",
        },
      ],
    });
    expect(data.properties[0].repairs).toHaveLength(2);
    expect(revalidate(data).properties[0].repairs).toEqual(
      data.properties[0].repairs,
    );

    data = reducer(data, {
      type: "deleteRepair",
      propertyId: "p1",
      repairId: "r1",
    });
    expect(data.properties[0].repairs.map((r) => r.id)).toEqual(["r2"]);
  });

  it("is a no-op when adding an empty repairs list", () => {
    const data = seeded();
    const next = reducer(data, {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [],
    });
    expect(next).toBe(data);
  });

  it("keeps a manual repair and coerces a half-present source pair to manual", () => {
    const data = reducer(seeded(), {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [
        { ...REPAIR },
        // A manual repair — no backing transaction (work older than the
        // imported history reaches). Kept rather than dropped.
        {
          id: "r3",
          date: "2025-06-01",
          amount: 4200,
          description: "Old roof work",
          typeId: "preset-type-renovations",
        },
        // A half-present pair (accountId but blank sourceHistoryId) drops both,
        // becoming a manual repair rather than an unresolvable half-link.
        { ...REPAIR, id: "r4", sourceHistoryId: "" },
      ],
    });
    const repairs = revalidate(data).properties[0].repairs;
    expect(repairs.map((r) => r.id)).toEqual(["r1", "r3", "r4"]);
    for (const id of ["r3", "r4"]) {
      const r = repairs.find((x) => x.id === id)!;
      expect(r.accountId).toBeUndefined();
      expect(r.sourceHistoryId).toBeUndefined();
    }
  });

  it("round-trips a manual repair's company and tags, dropping a dangling company", () => {
    let data = reducer(seeded(), {
      type: "addCompany",
      company: { id: "co1", name: "Roofer AB" },
    });
    data = reducer(data, {
      type: "addTag",
      tag: { id: "tg1", name: "deductible", color: "#ffffff" },
    });
    data = reducer(data, {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [
        {
          id: "r5",
          date: "2024-03-01",
          amount: 5000,
          description: "Roof",
          typeId: "preset-type-renovations",
          companyId: "co1",
          tagIds: ["tg1"],
        },
        // A dangling company id (no such company) is dropped on load.
        {
          id: "r6",
          date: "2024-03-02",
          amount: 100,
          description: "Gutter",
          typeId: "preset-type-repairs",
          companyId: "ghost",
        },
      ],
    });
    const repairs = revalidate(data).properties[0].repairs;
    const r5 = repairs.find((r) => r.id === "r5")!;
    expect(r5.companyId).toBe("co1");
    expect(r5.tagIds).toEqual(["tg1"]);
    const r6 = repairs.find((r) => r.id === "r6")!;
    expect(r6.companyId).toBeUndefined();
  });

  it("sweeps a manual repair's company on company delete", () => {
    let data = reducer(seeded(), {
      type: "addCompany",
      company: { id: "co1", name: "Roofer AB" },
    });
    data = reducer(data, {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [
        {
          id: "r7",
          date: "2024-03-01",
          amount: 5000,
          description: "Roof",
          typeId: "preset-type-renovations",
          companyId: "co1",
        },
      ],
    });
    data = reducer(data, { type: "deleteCompany", companyId: "co1" });
    const r7 = data.properties[0].repairs.find((r) => r.id === "r7")!;
    expect("companyId" in r7).toBe(false);
  });

  it("round-trips a multi-transaction repair's additional sources", () => {
    const data = reducer(seeded(), {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [
        {
          ...REPAIR,
          amount: 9800,
          additionalSources: [
            { accountId: "a1", entryId: "h2" },
            { accountId: "a2", entryId: "h3" },
          ],
        },
      ],
    });
    const repair = revalidate(data).properties[0].repairs[0];
    expect(repair.additionalSources).toEqual([
      { accountId: "a1", entryId: "h2" },
      { accountId: "a2", entryId: "h3" },
    ]);

    // Clearing the field via an `updateRepair` patch leaves the record
    // byte-identical to a single-source one reloaded from storage.
    const cleared = reducer(data, {
      type: "updateRepair",
      propertyId: "p1",
      repairId: "r1",
      patch: { additionalSources: undefined, amount: 6800 },
    });
    const single = cleared.properties[0].repairs[0];
    expect("additionalSources" in single).toBe(false);
    expect(revalidate(cleared).properties[0].repairs[0]).toEqual(single);
  });

  it("drops malformed additional sources on load", () => {
    const data = reducer(seeded(), {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [
        {
          ...REPAIR,
          additionalSources: [
            { accountId: "a1", entryId: "h2" },
            // Malformed entries are swept; an all-bad list drops the field.
            { accountId: "", entryId: "h3" },
            { accountId: "a2", entryId: "" },
          ],
        } as never,
      ],
    });
    expect(revalidate(data).properties[0].repairs[0].additionalSources).toEqual(
      [{ accountId: "a1", entryId: "h2" }],
    );
  });

  it("sets and clears a repair's own receipt, surviving a reload", () => {
    let data = reducer(seeded(), {
      type: "addRepairs",
      propertyId: "p1",
      repairs: [{ ...REPAIR }],
    });

    data = reducer(data, {
      type: "setRepairReceipt",
      propertyId: "p1",
      repairId: "r1",
      receiptPath: "receipts/kitchen-invoice.pdf",
    });
    expect(data.properties[0].repairs[0].receiptPath).toBe(
      "receipts/kitchen-invoice.pdf",
    );
    expect(revalidate(data).properties[0].repairs[0]).toEqual(
      data.properties[0].repairs[0],
    );

    // "" clears the receipt and drops the key, so the repair stays
    // byte-identical to a reloaded one with no receipt.
    data = reducer(data, {
      type: "setRepairReceipt",
      propertyId: "p1",
      repairId: "r1",
      receiptPath: "",
    });
    expect("receiptPath" in data.properties[0].repairs[0]).toBe(false);
    expect(revalidate(data).properties[0].repairs[0]).toEqual(
      data.properties[0].repairs[0],
    );
  });
});
