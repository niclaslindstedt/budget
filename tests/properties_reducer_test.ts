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
};

const MORTGAGE: Mortgage = {
  id: "m1",
  name: "SBAB loan 1",
  accountId: null,
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
      { id: "pay1", date: "2026-01-28", principal: 4000, interest: 1500 },
      { id: "pay2", date: "2026-02-28", principal: 4010, interest: 1490 },
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
      patch: { interest: 1600 },
    });
    expect(data.properties[0].mortgages[0].payments[0].interest).toBe(1600);

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
});
