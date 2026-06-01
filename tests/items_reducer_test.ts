import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import { validateUserData } from "../src/data/validate";
import type {
  AccountBudget,
  EntryType,
  HistoryEntry,
  Item,
  Subtype,
  UserData,
} from "../src/data/types";

const TYPE: EntryType = {
  id: "ty1",
  name: "Electronics",
  color: "#61afef",
  glyph: "laptop",
  categoryId: "preset-cat-consumption",
};

// Seed a workspace with one budget item holding the given rows so the
// line-item / item cascades have something to sweep.
function seed(
  rows: AccountBudget["rows"],
  extra: Partial<UserData> = {},
): UserData {
  const base = freshUserData();
  const sheet = base.sheets[0];
  const item = sheet.items.find(
    (i): i is AccountBudget => i.type === "accountBudget",
  );
  if (!item) throw new Error("expected an accountBudget item in the seed");
  return {
    ...base,
    types: [TYPE],
    sheets: [{ ...sheet, items: [{ ...item, rows }] }],
    ...extra,
  };
}

function firstBudgetRows(data: UserData): AccountBudget["rows"] {
  const item = data.sheets[0].items.find(
    (i): i is AccountBudget => i.type === "accountBudget",
  );
  if (!item) throw new Error("expected an accountBudget item");
  return item.rows;
}

describe("subtype reducer", () => {
  it("adds, updates, and deletes a subtype", () => {
    const subtype: Subtype = { id: "s1", name: "Laptop", typeId: "ty1" };
    let data = reducer(seed([]), { type: "addSubtype", subtype });
    expect(data.subtypes).toEqual([subtype]);

    data = reducer(data, {
      type: "updateSubtype",
      subtypeId: "s1",
      patch: { name: "Notebook" },
    });
    expect(data.subtypes[0].name).toBe("Notebook");

    data = reducer(data, { type: "deleteSubtype", subtypeId: "s1" });
    expect(data.subtypes).toEqual([]);
  });

  it("deleting a subtype clears it from referencing items but keeps them", () => {
    const subtype: Subtype = { id: "s1", name: "Laptop", typeId: "ty1" };
    const item: Item = { id: "i1", name: "MacBook", subtypeId: "s1" };
    const data = seed([], { subtypes: [subtype], items: [item] });
    const next = reducer(data, { type: "deleteSubtype", subtypeId: "s1" });
    expect(next.items).toEqual([{ id: "i1", name: "MacBook" }]);
  });
});

describe("deleteType cascade to subtypes", () => {
  it("deletes dependent subtypes and clears item.subtypeId", () => {
    const subtype: Subtype = { id: "s1", name: "Laptop", typeId: "ty1" };
    const item: Item = { id: "i1", name: "MacBook", subtypeId: "s1" };
    const data = seed([], { subtypes: [subtype], items: [item] });
    const next = reducer(data, { type: "deleteType", typeId: "ty1" });
    expect(next.subtypes).toEqual([]);
    expect(next.items).toEqual([{ id: "i1", name: "MacBook" }]);
  });
});

describe("item reducer", () => {
  it("deleting an item sweeps its line-item links from rows", () => {
    const item: Item = { id: "i1", name: "iPhone" };
    const data = seed(
      [
        {
          kind: "user",
          id: "r1",
          cells: {},
          lineItems: [
            { id: "l1", itemId: "i1" },
            { id: "l2", itemId: "i2" },
          ],
        },
        {
          kind: "user",
          id: "r2",
          cells: {},
          lineItems: [{ id: "l3", itemId: "i1" }],
        },
      ],
      { items: [item, { id: "i2", name: "Case" }] },
    );
    const next = reducer(data, { type: "deleteItem", itemId: "i1" });
    expect(next.items).toEqual([{ id: "i2", name: "Case" }]);
    const rows = firstBudgetRows(next);
    // r1 keeps the i2 link; r2's only link is dropped along with the field.
    expect(rows[0].lineItems).toEqual([{ id: "l2", itemId: "i2" }]);
    expect(rows[1].lineItems).toBeUndefined();
  });
});

describe("setRowLineItems", () => {
  it("writes links and clears them on an empty set", () => {
    const item: Item = { id: "i1", name: "iPhone" };
    const data = seed([{ kind: "user", id: "r1", cells: {} }], {
      items: [item],
    });
    const sheetId = data.sheets[0].id;
    const itemId = data.sheets[0].items[0].id;
    let next = reducer(data, {
      type: "setRowLineItems",
      sheetId,
      itemId,
      rowId: "r1",
      lineItems: [{ id: "l1", itemId: "i1" }],
    });
    expect(firstBudgetRows(next)[0].lineItems).toEqual([
      { id: "l1", itemId: "i1" },
    ]);
    next = reducer(next, {
      type: "setRowLineItems",
      sheetId,
      itemId,
      rowId: "r1",
      lineItems: [],
    });
    expect(firstBudgetRows(next)[0].lineItems).toBeUndefined();
  });

  it("writes a receipt path alongside the links and clears it on empty string", () => {
    const item: Item = { id: "i1", name: "iPhone" };
    const data = seed([{ kind: "user", id: "r1", cells: {} }], {
      items: [item],
    });
    const sheetId = data.sheets[0].id;
    const itemId = data.sheets[0].items[0].id;
    let next = reducer(data, {
      type: "setRowLineItems",
      sheetId,
      itemId,
      rowId: "r1",
      lineItems: [{ id: "l1", itemId: "i1" }],
      receiptPath: "Apple Store - 2026-06-01.jpg",
    });
    expect(firstBudgetRows(next)[0].receiptPath).toBe(
      "Apple Store - 2026-06-01.jpg",
    );
    // Re-submitting with an empty string clears the receipt but leaves
    // the (re-sent) links in place.
    next = reducer(next, {
      type: "setRowLineItems",
      sheetId,
      itemId,
      rowId: "r1",
      lineItems: [{ id: "l1", itemId: "i1" }],
      receiptPath: "",
    });
    expect(firstBudgetRows(next)[0].receiptPath).toBeUndefined();
    expect(firstBudgetRows(next)[0].lineItems).toHaveLength(1);
  });

  it("leaves the receipt path untouched when the action omits it", () => {
    const item: Item = { id: "i1", name: "iPhone" };
    const data = seed(
      [
        {
          kind: "user",
          id: "r1",
          cells: {},
          receiptPath: "kept.jpg",
        },
      ],
      { items: [item] },
    );
    const sheetId = data.sheets[0].id;
    const itemId = data.sheets[0].items[0].id;
    const next = reducer(data, {
      type: "setRowLineItems",
      sheetId,
      itemId,
      rowId: "r1",
      lineItems: [{ id: "l1", itemId: "i1" }],
    });
    expect(firstBudgetRows(next)[0].receiptPath).toBe("kept.jpg");
  });
});

describe("linkLineItemsToHistoryEntry", () => {
  it("writes links + receipt to the entry and clears each as instructed", () => {
    const entry: HistoryEntry = {
      id: "e1",
      date: "2026-06-01",
      amount: -15000,
      description: "Apple",
    };
    const item: Item = { id: "i1", name: "iPhone" };
    const data = seed([], { items: [item], history: { acct1: [entry] } });
    let next = reducer(data, {
      type: "linkLineItemsToHistoryEntry",
      accountId: "acct1",
      entryId: "e1",
      lineItems: [{ id: "l1", itemId: "i1" }],
      receiptPath: "Apple - 2026-06-01.jpg",
    });
    expect(next.history.acct1[0].lineItems).toEqual([
      { id: "l1", itemId: "i1" },
    ]);
    expect(next.history.acct1[0].receiptPath).toBe("Apple - 2026-06-01.jpg");
    // Clearing the receipt (empty string) while keeping the links.
    next = reducer(next, {
      type: "linkLineItemsToHistoryEntry",
      accountId: "acct1",
      entryId: "e1",
      lineItems: [{ id: "l1", itemId: "i1" }],
      receiptPath: "",
    });
    expect(next.history.acct1[0].receiptPath).toBeUndefined();
    expect(next.history.acct1[0].lineItems).toHaveLength(1);
  });
});

describe("excludeSimilarItemEntries", () => {
  it("appends the normalised description key, dedups, and ignores meaningless ones", () => {
    const data = seed([]);
    // A real merchant label collapses to a meaningful key and is stored.
    let next = reducer(data, {
      type: "excludeSimilarItemEntries",
      description: "Brf Spillkråkan 3  2026-04-24",
    });
    expect(next.itemFindExclusionPatterns).toEqual(["brf spillkråkan 3"]);
    // A cosmetic variant of the same charge collapses to the same key —
    // no duplicate appended.
    next = reducer(next, {
      type: "excludeSimilarItemEntries",
      description: "BRF SPILLKRÅKAN 3",
    });
    expect(next.itemFindExclusionPatterns).toEqual(["brf spillkråkan 3"]);
    // A description that normalises to nothing meaningful is a no-op.
    const after = reducer(next, {
      type: "excludeSimilarItemEntries",
      description: "12",
    });
    expect(after).toBe(next);
  });

  it("clears every excluded pattern", () => {
    const data = seed([], { itemFindExclusionPatterns: ["brf spillkråkan 3"] });
    const next = reducer(data, { type: "clearItemFindExclusions" });
    expect(next.itemFindExclusionPatterns).toEqual([]);
  });
});

describe("validation", () => {
  it("drops a line-item link whose item was deleted, drops a dangling item.subtypeId, and rejects a subtype with an unknown type", () => {
    // Dangling line-item itemId → link dropped.
    const withDangling = seed(
      [
        {
          kind: "user",
          id: "r1",
          cells: {},
          lineItems: [{ id: "l1", itemId: "ghost" }],
        },
      ],
      { items: [{ id: "i1", name: "iPhone", subtypeId: "ghost-subtype" }] },
    );
    const ok = validateUserData(withDangling);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(firstBudgetRows(ok.value)[0].lineItems).toBeUndefined();
      // Dangling subtypeId on the item is dropped silently.
      expect(ok.value.items[0].subtypeId).toBeUndefined();
    }

    // A subtype whose parent type doesn't resolve hard-fails the load.
    const badSubtype = seed([], {
      subtypes: [{ id: "s1", name: "Laptop", typeId: "ghost" }],
    });
    const bad = validateUserData(badSubtype);
    expect(bad.ok).toBe(false);
  });
});
