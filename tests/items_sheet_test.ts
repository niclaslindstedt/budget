import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import {
  countSheetItemRows,
  createDefaultItemsView,
  descriptorForItemType,
} from "../src/data/sheet-types";
import { freshUserData } from "../src/storage/local";
import { validateUserData } from "../src/data/validate";
import type { Item, ItemsView, UserData } from "../src/data/types";

// A workspace whose active sheet is an Items sheet, plus the default
// budget sheet `freshUserData` seeds.
function withItemsSheet(items: Item[] = []): UserData {
  const base = freshUserData();
  const itemsSheet = createDefaultSheet("Stuff", null, { type: "items" });
  return {
    ...base,
    sheets: [...base.sheets, itemsSheet],
    items,
  };
}

describe("Items sheet type", () => {
  it("seeds an itemsView item from the registry factory", () => {
    const view = createDefaultItemsView();
    expect(view.type).toBe("itemsView");

    const sheet = createDefaultSheet("Stuff", null, { type: "items" });
    expect(sheet.type).toBe("items");
    expect(sheet.items).toHaveLength(1);
    expect(sheet.items[0].type).toBe("itemsView");
  });

  it("round-trips an Items sheet through validateUserData", () => {
    const data = withItemsSheet([
      { id: "i1", name: "Bike", purchasePrice: 5000 },
    ]);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const itemsSheet = result.value.sheets.find((s) => s.type === "items");
    expect(itemsSheet).toBeDefined();
    expect(itemsSheet?.items[0].type).toBe("itemsView");
  });

  it("rejects an unknown sheet item type", () => {
    const data = withItemsSheet();
    const itemsSheet = data.sheets[data.sheets.length - 1];
    const bogus = {
      ...itemsSheet,
      items: [{ id: "x1", type: "mysteryView" }],
    };
    const result = validateUserData({
      ...data,
      sheets: [...data.sheets.slice(0, -1), bogus],
    });
    expect(result.ok).toBe(false);
  });

  it("dispatches the itemsView discriminant to the items descriptor", () => {
    expect(descriptorForItemType("itemsView")?.id).toBe("items");
    expect(descriptorForItemType("accountBudget")?.id).toBe("budget");
    expect(descriptorForItemType("accountsView")?.id).toBe("accounts");
    expect(descriptorForItemType("mysteryView")).toBeUndefined();
  });

  it("does not count an itemsView toward the backup entry total", () => {
    // The Items sheet holds no rows, so adding one must not change the
    // row tally the backup metadata reports (only budget rows count).
    const withItems = withItemsSheet();
    const view: ItemsView = createDefaultItemsView();
    void view;
    expect(countSheetItemRows(withItems)).toBe(
      countSheetItemRows(freshUserData()),
    );
  });

  it("adds an owned item to the catalog via the addItem action", () => {
    const data = withItemsSheet();
    const next = reducer(data, {
      type: "addItem",
      item: { id: "new-1", name: "Couch", purchasePrice: 8000 },
    });
    expect(next.items).toHaveLength(1);
    expect(next.items[0]).toEqual({
      id: "new-1",
      name: "Couch",
      purchasePrice: 8000,
    });
  });
});
