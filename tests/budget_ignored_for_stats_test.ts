import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import { freshUserData } from "../src/storage/local";
import type { AccountBudget, Sheet, UserData } from "../src/data/types";

function withSheets(sheets: Sheet[]): UserData {
  return { ...freshUserData(), sheets, activeSheetId: sheets[0].id };
}

function budgetItem(sheet: Sheet): AccountBudget {
  const item = sheet.items.find(
    (it): it is AccountBudget => it.type === "accountBudget",
  );
  if (!item) throw new Error("expected an accountBudget item");
  return item;
}

describe("setBudgetIgnoredForStats reducer", () => {
  it("sets the flag on the budget item", () => {
    const s = createDefaultSheet("Partner");
    const next = reducer(withSheets([s]), {
      type: "setBudgetIgnoredForStats",
      sheetId: s.id,
      itemId: budgetItem(s).id,
      ignoredForStats: true,
    });
    expect(budgetItem(next.sheets[0]).ignoredForStats).toBe(true);
  });

  it("clears the flag by dropping it (not storing false)", () => {
    const s = createDefaultSheet("Partner");
    const item = budgetItem(s);
    const on = withSheets([
      { ...s, items: [{ ...item, ignoredForStats: true }] },
    ]);
    const next = reducer(on, {
      type: "setBudgetIgnoredForStats",
      sheetId: s.id,
      itemId: item.id,
      ignoredForStats: false,
    });
    expect("ignoredForStats" in budgetItem(next.sheets[0])).toBe(false);
  });

  it("is a no-op when the flag already matches", () => {
    const s = createDefaultSheet("Partner");
    const state = withSheets([s]);
    const next = reducer(state, {
      type: "setBudgetIgnoredForStats",
      sheetId: s.id,
      itemId: budgetItem(s).id,
      ignoredForStats: false,
    });
    expect(next).toBe(state);
  });

  it("ignores an unknown sheet id", () => {
    const s = createDefaultSheet("Partner");
    const state = withSheets([s]);
    const next = reducer(state, {
      type: "setBudgetIgnoredForStats",
      sheetId: "nope",
      itemId: budgetItem(s).id,
      ignoredForStats: true,
    });
    expect(next).toBe(state);
  });
});
