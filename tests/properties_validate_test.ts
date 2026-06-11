import { describe, expect, it } from "vitest";

import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { Property, UserData } from "../src/data/types";

function property(over: Partial<Property> = {}): Property {
  return {
    id: "prop-1",
    name: "Apartment",
    valueHistory: [],
    mortgages: [],
    repairs: [],
    files: [],
    ...over,
  };
}

function blob(properties: unknown[]): UserData {
  return { ...freshUserData(), properties: properties as Property[] };
}

describe("validateProperty via validateUserData — sale fields", () => {
  it("round-trips a sold property", () => {
    const data = blob([
      property({
        purchaseAmount: 1_450_000,
        purchaseDate: "2016-02-01",
        soldDate: "2021-08-15",
        soldAmount: 2_050_000,
      }),
    ]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.properties).toEqual(data.properties);
  });

  it("keeps a sale date with no recorded amount", () => {
    const data = blob([property({ soldDate: "2021-08-15" })]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties[0].soldDate).toBe("2021-08-15");
      expect(result.value.properties[0].soldAmount).toBeUndefined();
    }
  });

  it("drops a sale amount that has no sale date to ride with", () => {
    const data = blob([property({ soldAmount: 2_050_000 })]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties[0].soldDate).toBeUndefined();
      expect(result.value.properties[0].soldAmount).toBeUndefined();
    }
  });

  it("drops a malformed sale date and the amount with it", () => {
    const data = blob([property({ soldDate: "not-a-date", soldAmount: 100 })]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties[0].soldDate).toBeUndefined();
      expect(result.value.properties[0].soldAmount).toBeUndefined();
    }
  });

  it("drops a negative sale amount but keeps the date", () => {
    const data = blob([property({ soldDate: "2021-08-15", soldAmount: -1 })]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties[0].soldDate).toBe("2021-08-15");
      expect(result.value.properties[0].soldAmount).toBeUndefined();
    }
  });
});
