import { describe, expect, it } from "vitest";

import { collectReceiptPaths } from "../src/data/items/link";
import { resolveTxnReceipt } from "../src/data/receipts/target";
import { freshUserData } from "../src/storage/local";
import type { Property, UserData } from "../src/data/types";

// A property carrying one repair that owns a receipt path. Repairs own their
// receipt directly (decoupled from the source transactions), so the receipt
// resolves off the repair, not any bank entry.
function withRepairReceipt(receiptPath?: string): UserData {
  const property: Property = {
    id: "p1",
    name: "Cabin",
    valueHistory: [],
    mortgages: [],
    repairs: [
      {
        id: "r1",
        date: "2026-01-20",
        amount: 6800,
        description: "Kitchen invoice",
        typeId: "preset-type-repairs",
        accountId: "a1",
        sourceHistoryId: "h1",
        ...(receiptPath ? { receiptPath } : {}),
      },
    ],
  };
  return { ...freshUserData(), properties: [property] };
}

describe("resolveTxnReceipt — repair target", () => {
  it("resolves a repair's own receipt with no line items", () => {
    const data = withRepairReceipt("receipts/kitchen.pdf");
    expect(
      resolveTxnReceipt(data, {
        kind: "repair",
        propertyId: "p1",
        repairId: "r1",
      }),
    ).toEqual({ receiptPath: "receipts/kitchen.pdf", lineItems: [] });
  });

  it("returns undefined receiptPath for a repair with no receipt yet", () => {
    const data = withRepairReceipt();
    expect(
      resolveTxnReceipt(data, {
        kind: "repair",
        propertyId: "p1",
        repairId: "r1",
      }),
    ).toEqual({ receiptPath: undefined, lineItems: [] });
  });

  it("returns null for a stale repair / property id", () => {
    const data = withRepairReceipt("receipts/kitchen.pdf");
    expect(
      resolveTxnReceipt(data, {
        kind: "repair",
        propertyId: "p1",
        repairId: "gone",
      }),
    ).toBeNull();
    expect(
      resolveTxnReceipt(data, {
        kind: "repair",
        propertyId: "gone",
        repairId: "r1",
      }),
    ).toBeNull();
  });
});

describe("collectReceiptPaths — includes repair receipts", () => {
  it("counts a repair's receipt so a fresh upload can't collide", () => {
    const data = withRepairReceipt("receipts/kitchen.pdf");
    expect(collectReceiptPaths(data).has("receipts/kitchen.pdf")).toBe(true);
    // `exclude` drops the host's own path so a replace reuses its name.
    expect(
      collectReceiptPaths(data, "receipts/kitchen.pdf").has(
        "receipts/kitchen.pdf",
      ),
    ).toBe(false);
  });
});
