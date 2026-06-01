import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v56 → v57 step adds `Settings.receiptNamePattern`, the preset that
// names an item's uploaded receipt file. Existing v56 buckets lack it, so
// the migration seeds the `"name-date"` default.
describe("migration v56 → latest (receiptNamePattern)", () => {
  it("seeds receiptNamePattern on the settings block", () => {
    const v56 = {
      version: 56,
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
      itemFindExclusionPatterns: [],
      matchRules: [],
      seriesMatchRules: [],
      renamePatterns: {},
      seriesMetadata: {},
      primaryIncomeMerchants: [],
      settings: { currency: "kr" },
    };
    const result = migrate(v56);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      settings: { receiptNamePattern: unknown; currency: unknown };
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.settings.receiptNamePattern).toBe("name-date");
    // The migration preserves the rest of the settings block.
    expect(data.settings.currency).toBe("kr");
  });
});
