import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v60 → v61 step drops `LineItemLink.amount`: a line item is now purely
// a link from a transaction to an owned `Item`, and what the item cost lives
// on the item (`Item.purchasePrice`). The migration folds each link's old
// (signed) amount onto its item as a non-negative purchase price — the first
// link to name an item whose price is unset wins — then strips `amount` off
// every link across budget rows and bank history. Items already carrying a
// price are left untouched.
describe("migration v60 → latest (line-item price folds onto the item)", () => {
  function v60() {
    return {
      version: 60,
      sheets: [
        {
          id: "sh1",
          items: [
            {
              type: "accountBudget",
              accountId: "acct1",
              rows: [
                {
                  kind: "user",
                  id: "r1",
                  cells: {},
                  lineItems: [
                    { id: "l1", itemId: "i1", amount: -15000, note: "phone" },
                    { id: "l2", itemId: "i2", amount: -500 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      activeSheetId: "sh1",
      accounts: [],
      history: {
        acct1: [
          {
            id: "e1",
            date: "2026-06-01",
            amount: -200,
            description: "Apple",
            // i1 already seeded above; this later link must NOT overwrite it.
            lineItems: [{ id: "l3", itemId: "i1", amount: -200 }],
          },
        ],
      },
      items: [
        { id: "i1", name: "iPhone" },
        { id: "i2", name: "Case" },
        // Already priced — the migration must leave it alone.
        { id: "i3", name: "Desk", purchasePrice: 4000 },
      ],
    };
  }

  it("seeds purchasePrice from the first link and strips link amounts", () => {
    const result = migrate(v60());
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      sheets: {
        items: { rows: { lineItems: Record<string, unknown>[] }[] }[];
      }[];
      history: Record<string, { lineItems: Record<string, unknown>[] }[]>;
      items: { id: string; name: string; purchasePrice?: number }[];
    };
    expect(data.version).toBe(LATEST_VERSION);

    const byId = Object.fromEntries(data.items.map((it) => [it.id, it]));
    // Signed link amount folds onto the item as a non-negative price.
    expect(byId.i1.purchasePrice).toBe(15000);
    expect(byId.i2.purchasePrice).toBe(500);
    // Pre-priced item untouched.
    expect(byId.i3.purchasePrice).toBe(4000);

    // Links keep id / itemId / note but shed `amount`.
    const rowLinks = data.sheets[0].items[0].rows[0].lineItems;
    expect(rowLinks).toEqual([
      { id: "l1", itemId: "i1", note: "phone" },
      { id: "l2", itemId: "i2" },
    ]);
    const histLinks = data.history.acct1[0].lineItems;
    expect(histLinks).toEqual([{ id: "l3", itemId: "i1" }]);
  });
});
