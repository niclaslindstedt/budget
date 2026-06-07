import { describe, expect, it } from "vitest";

import { collectReceiptPaths } from "../src/data/items/link";
import { freshUserData } from "../src/storage/local";
import type { Property, UserData } from "../src/data/types";

// A property carrying one repair that owns a receipt path. Repairs own their
// receipt directly (decoupled from the source transactions); the bytes live in
// the per-property `properties/` store.
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
    files: [],
  };
  return { ...freshUserData(), properties: [property] };
}

// A property carrying one uploaded file with a stored path.
function withPropertyFile(path: string): UserData {
  const property: Property = {
    id: "p1",
    name: "Cabin",
    valueHistory: [],
    mortgages: [],
    repairs: [],
    files: [{ id: "f1", path }],
  };
  return { ...freshUserData(), properties: [property] };
}

describe("collectReceiptPaths — includes property attachments", () => {
  it("counts a repair's receipt so a fresh upload can't collide", () => {
    const data = withRepairReceipt("Cabin/receipts/kitchen.pdf");
    expect(collectReceiptPaths(data).has("Cabin/receipts/kitchen.pdf")).toBe(
      true,
    );
    // `exclude` drops the host's own path so a replace reuses its name.
    expect(
      collectReceiptPaths(data, "Cabin/receipts/kitchen.pdf").has(
        "Cabin/receipts/kitchen.pdf",
      ),
    ).toBe(false);
  });

  it("counts an uploaded property file's path", () => {
    const data = withPropertyFile("Cabin/files/Insurance/policy.pdf");
    expect(
      collectReceiptPaths(data).has("Cabin/files/Insurance/policy.pdf"),
    ).toBe(true);
  });
});
