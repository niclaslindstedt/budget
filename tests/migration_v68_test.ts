import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v68 → v69 step turns a repair's single `receiptPath` into a list of
// dated `receipts` — a job can be paid across several invoices, each on its own
// date. The pre-existing receipt is dated with the repair's own date (the only
// date a v68 budget carries for it) and keyed by a derived id.
describe("migration v68 → v69 (PropertyRepair.receipts)", () => {
  it("converts a single receiptPath into a one-element dated receipts list", () => {
    const result = migrate({
      version: 68,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Cabin",
          valueHistory: [],
          mortgages: [],
          files: [],
          repairs: [
            {
              id: "r1",
              date: "2026-01-20",
              amount: 6800,
              description: "Kitchen",
              typeId: "preset-type-repairs",
              receiptPath: "Cabin/receipts/kitchen.pdf",
            },
          ],
        },
      ],
    });

    expect(result.data.version).toBe(LATEST_VERSION);
    const repair = (
      result.data.properties as Array<{
        repairs: Array<Record<string, unknown>>;
      }>
    )[0].repairs[0];
    expect("receiptPath" in repair).toBe(false);
    expect(repair.receipts).toEqual([
      {
        id: "r1-receipt",
        path: "Cabin/receipts/kitchen.pdf",
        date: "2026-01-20",
      },
    ]);
  });

  it("leaves a receiptless repair untouched", () => {
    const result = migrate({
      version: 68,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      properties: [
        {
          id: "p1",
          name: "Cabin",
          valueHistory: [],
          mortgages: [],
          files: [],
          repairs: [
            {
              id: "r1",
              date: "2026-01-20",
              amount: 6800,
              description: "Kitchen",
              typeId: "preset-type-repairs",
            },
          ],
        },
      ],
    });

    const repair = (
      result.data.properties as Array<{
        repairs: Array<Record<string, unknown>>;
      }>
    )[0].repairs[0];
    expect("receipts" in repair).toBe(false);
    expect("receiptPath" in repair).toBe(false);
  });

  it("tolerates a missing properties array", () => {
    const result = migrate({
      version: 68,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
    });
    expect(result.data.version).toBe(LATEST_VERSION);
  });
});
