import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v64 → v65 step lifts a property's bound bank account from its
// mortgages up to the property — a property is paid to the bank as one
// charge covering every loan, so the account is shared — and strips
// `accountId` off every mortgage.
describe("migration v64 → v65 (lift the account to the property)", () => {
  it("takes the first mortgage's account and drops it from the mortgages", () => {
    const result = migrate({
      version: 64,
      sheets: [],
      activeSheetId: null,
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Home",
          valueHistory: [],
          mortgages: [
            { id: "m1", name: "Loan 1", accountId: "acct-1", payments: [] },
            { id: "m2", name: "Loan 2", accountId: "acct-1", payments: [] },
          ],
        },
      ],
    });

    const properties = result.data.properties as Array<{
      accountId?: string;
      mortgages: Array<Record<string, unknown>>;
    }>;
    expect(result.data.version).toBe(LATEST_VERSION);
    expect(properties[0].accountId).toBe("acct-1");
    expect(properties[0].mortgages.every((m) => !("accountId" in m))).toBe(
      true,
    );
  });

  it("keeps an existing property account over a mortgage's", () => {
    const result = migrate({
      version: 64,
      sheets: [],
      activeSheetId: null,
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Home",
          accountId: "acct-property",
          valueHistory: [],
          mortgages: [
            {
              id: "m1",
              name: "Loan",
              accountId: "acct-mortgage",
              payments: [],
            },
          ],
        },
      ],
    });
    const properties = result.data.properties as Array<{ accountId?: string }>;
    expect(properties[0].accountId).toBe("acct-property");
  });

  it("strips a null mortgage account without setting one on the property", () => {
    const result = migrate({
      version: 64,
      sheets: [],
      activeSheetId: null,
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Home",
          valueHistory: [],
          mortgages: [
            { id: "m1", name: "Loan", accountId: null, payments: [] },
          ],
        },
      ],
    });
    const properties = result.data.properties as Array<{
      accountId?: string;
      mortgages: Array<Record<string, unknown>>;
    }>;
    expect("accountId" in properties[0]).toBe(false);
    expect(properties[0].mortgages.every((m) => !("accountId" in m))).toBe(
      true,
    );
  });
});
