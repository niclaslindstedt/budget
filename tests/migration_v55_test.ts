import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v55 → v56 step adds `UserData.itemFindExclusionPatterns`, the
// normalised-description keys the user excluded from the Items sheet's
// "Find items" scan via "Exclude similar". Existing v55 snapshots lack
// it, so the migration seeds an empty array.
describe("migration v55 → latest (itemFindExclusionPatterns)", () => {
  it("seeds an empty itemFindExclusionPatterns array", () => {
    const v55 = {
      version: 55,
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
      ignoredItemEntryIds: [],
      matchRules: [],
      seriesMatchRules: [],
      renamePatterns: {},
      seriesMetadata: {},
      primaryIncomeMerchants: [],
      settings: {},
    };
    const result = migrate(v55);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      itemFindExclusionPatterns: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.itemFindExclusionPatterns).toEqual([]);
  });
});
