import { describe, expect, it } from "vitest";

import { collectReceiptPaths } from "../src/data/items/link";
import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { Property, UserData } from "../src/data/types";

// A property carrying one repair that owns receipt paths. Repairs own their
// receipts directly (decoupled from the source transactions); the bytes live
// in the per-property `properties/` store.
function withRepairReceipts(...receiptPaths: string[]): UserData {
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
        ...(receiptPaths.length > 0
          ? {
              receipts: receiptPaths.map((path, i) => ({
                id: `rc${i}`,
                path,
                date: "2026-01-20",
              })),
            }
          : {}),
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
  it("counts every one of a repair's receipts so a fresh upload can't collide", () => {
    const data = withRepairReceipts(
      "Cabin/receipts/kitchen.pdf",
      "Cabin/receipts/kitchen-2.pdf",
    );
    const paths = collectReceiptPaths(data);
    expect(paths.has("Cabin/receipts/kitchen.pdf")).toBe(true);
    expect(paths.has("Cabin/receipts/kitchen-2.pdf")).toBe(true);
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

// Build a workspace with one repair whose `receipts` field is whatever the
// caller passes (raw, to exercise the validator's leniency).
function workspaceWithRawReceipts(receipts: unknown): UserData {
  return {
    ...freshUserData(),
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
            receipts,
          },
        ],
      } as unknown as Property,
    ],
  };
}

describe("validateRepair — receipts", () => {
  it("keeps well-formed receipts and survives a reload", () => {
    const receipts = [
      { id: "rc1", path: "Cabin/receipts/a.pdf", date: "2026-01-20" },
      { id: "rc2", path: "Cabin/receipts/b.pdf", date: "2026-03-05" },
    ];
    const result = validateUserData(workspaceWithRawReceipts(receipts));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.properties[0].repairs[0].receipts).toEqual(receipts);
  });

  it("drops malformed entries and defaults a missing date to the repair's date", () => {
    const result = validateUserData(
      workspaceWithRawReceipts([
        { id: "rc1", path: "Cabin/receipts/a.pdf" }, // no date → repair date
        { id: "", path: "x" }, // bad id, dropped
        { id: "rc3", path: "" }, // empty path, dropped
        { id: "rc1", path: "dupe" }, // duplicate id, dropped
        "nope", // not an object, dropped
      ]),
    );
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.properties[0].repairs[0].receipts).toEqual([
        { id: "rc1", path: "Cabin/receipts/a.pdf", date: "2026-01-20" },
      ]);
  });

  it("omits an empty receipts list so the repair stays receiptless", () => {
    const result = validateUserData(workspaceWithRawReceipts([]));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect("receipts" in result.value.properties[0].repairs[0]).toBe(false);
  });

  it("absorbs a legacy single receiptPath into a one-element receipts list", () => {
    const data: UserData = {
      ...freshUserData(),
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
              receiptPath: "Cabin/receipts/legacy.pdf",
            } as unknown as Property["repairs"][number],
          ],
        },
      ],
    };
    const result = validateUserData(JSON.parse(JSON.stringify(data)));
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.properties[0].repairs[0].receipts).toEqual([
        {
          id: "r1-receipt",
          path: "Cabin/receipts/legacy.pdf",
          date: "2026-01-20",
        },
      ]);
  });
});
