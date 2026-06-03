import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v63 → v64 step lifts a property's lender from its mortgages up to the
// property — one lender per home — and strips `companyId` off every
// mortgage.
describe("migration v63 → v64 (lift the lender to the property)", () => {
  it("takes the first mortgage's lender and drops it from the mortgages", () => {
    const result = migrate({
      version: 63,
      sheets: [],
      activeSheetId: null,
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Home",
          valueHistory: [],
          mortgages: [
            { id: "m1", name: "Loan 1", companyId: "co-sbab", payments: [] },
            { id: "m2", name: "Loan 2", companyId: "co-sbab", payments: [] },
          ],
        },
      ],
    });

    const properties = result.data.properties as Array<{
      companyId?: string;
      mortgages: Array<Record<string, unknown>>;
    }>;
    expect(result.data.version).toBe(LATEST_VERSION);
    expect(properties[0].companyId).toBe("co-sbab");
    expect(properties[0].mortgages.every((m) => !("companyId" in m))).toBe(
      true,
    );
  });

  it("keeps an existing property lender over a mortgage's", () => {
    const result = migrate({
      version: 63,
      sheets: [],
      activeSheetId: null,
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Home",
          companyId: "co-property",
          valueHistory: [],
          mortgages: [
            { id: "m1", name: "Loan", companyId: "co-mortgage", payments: [] },
          ],
        },
      ],
    });
    const properties = result.data.properties as Array<{ companyId?: string }>;
    expect(properties[0].companyId).toBe("co-property");
  });
});
