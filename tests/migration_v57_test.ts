import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v57 → v58 step binds the Salary sheet to a pay account
// (`SalaryView.accountId`). Existing v57 `salaryView` items lack the
// field, so the migration seeds `accountId: null` (unbound) and leaves
// every other sheet item untouched.
describe("migration v57 → latest (salaryView account binding)", () => {
  it("seeds accountId: null on existing salaryView items", () => {
    const v57 = {
      version: 57,
      sheets: [
        {
          id: "sheet-salary",
          name: "Pay",
          type: "salary",
          glyph: "banknote",
          color: "#fff",
          description: "",
          items: [{ id: "item-1", type: "salaryView" }],
        },
        {
          id: "sheet-budget",
          name: "Budget",
          type: "budget",
          glyph: "wallet",
          color: "#fff",
          description: "",
          items: [
            {
              id: "item-2",
              type: "accountBudget",
              accountId: "acc-1",
              columns: [],
              rows: [],
            },
          ],
        },
      ],
      activeSheetId: "sheet-salary",
      accounts: [],
      salaries: [],
      employers: [],
    };
    const result = migrate(v57);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      sheets: { items: { type: string; accountId?: unknown }[] }[];
    };
    expect(data.version).toBe(LATEST_VERSION);
    // The salaryView item gains an explicit null binding.
    expect(data.sheets[0].items[0].accountId).toBeNull();
    // The accountBudget item keeps its existing binding untouched.
    expect(data.sheets[1].items[0].accountId).toBe("acc-1");
  });
});
