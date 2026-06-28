import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v81 → v82 step adds `UserData.duplicateIgnores`, the "not a
// duplicate" rules the cross-account duplicate finder consults. Existing
// v81 buckets lack it, so the migration seeds an empty array.
describe("migration v81 → latest (duplicateIgnores)", () => {
  it("seeds an empty duplicateIgnores array", () => {
    const v81 = {
      version: 81,
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
    const result = migrate(v81);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      duplicateIgnores: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.duplicateIgnores).toEqual([]);
  });
});
