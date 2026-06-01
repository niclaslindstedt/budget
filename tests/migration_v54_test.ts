import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v54 → v55 step adds `UserData.ignoredItemEntryIds`, the history-
// entry ids the user ignored from the Items sheet's "Find items" scan.
// Existing v54 snapshots lack it, so the migration seeds an empty array.
describe("migration v54 → latest (ignoredItemEntryIds)", () => {
  it("seeds an empty ignoredItemEntryIds array", () => {
    const v54 = {
      version: 54,
      sheets: [],
      activeSheetId: "",
      accounts: [],
      salaries: [],
      employers: [],
      companies: [],
      tags: [],
      categories: [],
      types: [],
      subtypes: [],
      items: [],
      hiddenPresetTypeIds: [],
      presetTypeKindOverrides: {},
      hiddenPresetCategoryIds: [],
      companyCategories: [],
      hiddenPresetCompanyCategoryIds: [],
      transfers: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      renamePatterns: {},
      seriesMetadata: {},
      primaryIncomeMerchants: [],
      settings: {},
    };
    const result = migrate(v54);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      ignoredItemEntryIds: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.ignoredItemEntryIds).toEqual([]);
  });
});
