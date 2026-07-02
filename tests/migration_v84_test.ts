import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v83 → v84 step introduces the Cars sheet's collections: `cars`
// plus the two "Find car expenses" dismiss lists. All three seed empty;
// nothing existing is transformed.
describe("migration v83 → latest (cars collections)", () => {
  it("seeds the cars collections empty and bumps the version", () => {
    const v83 = {
      version: 83,
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
      loans: [{ id: "loan-1", name: "Car loan", kind: "car", payments: [] }],
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
      duplicateIgnores: [],
      settings: { currency: "kr" },
    };
    const result = migrate(v83);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      cars: unknown[];
      ignoredCarExpenseEntryIds: string[];
      carExpenseExclusionPatterns: string[];
      loans: unknown[];
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.cars).toEqual([]);
    expect(data.ignoredCarExpenseEntryIds).toEqual([]);
    expect(data.carExpenseExclusionPatterns).toEqual([]);
    // Existing collections survive untouched.
    expect(data.loans).toHaveLength(1);
  });
});
