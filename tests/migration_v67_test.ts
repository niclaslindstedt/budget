import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v66 → v67 step introduces `Property.repairs`, the transaction-linked
// repairs / renovations on each property. It is additive — every property
// gains an empty `repairs` list (a pre-existing one is preserved) and only
// the version bumps.
describe("migration v66 → v67 (Property.repairs)", () => {
  it("seeds an empty repairs list on every property", () => {
    const result = migrate({
      version: 66,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      properties: [
        { id: "p1", name: "Cabin", valueHistory: [], mortgages: [] },
        { id: "p2", name: "Flat", valueHistory: [], mortgages: [] },
      ],
    });

    expect(result.data.version).toBe(LATEST_VERSION);
    const properties = result.data.properties as Array<{
      repairs: unknown[];
    }>;
    expect(properties[0].repairs).toEqual([]);
    expect(properties[1].repairs).toEqual([]);
  });

  it("preserves a repairs list that already exists", () => {
    const repair = {
      id: "r1",
      date: "2026-01-20",
      amount: 6800,
      description: "Plumber",
      typeId: "preset-type-repairs",
      accountId: "a1",
      sourceHistoryId: "h1",
    };
    const result = migrate({
      version: 66,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Cabin",
          valueHistory: [],
          mortgages: [],
          repairs: [repair],
        },
      ],
    });

    const properties = result.data.properties as Array<{ repairs: unknown[] }>;
    expect(properties[0].repairs).toEqual([repair]);
  });

  it("tolerates a missing properties array", () => {
    const result = migrate({
      version: 66,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
    });
    expect(result.data.version).toBe(LATEST_VERSION);
  });
});
