import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v82 → v83 step is a bare additive bump: history entries gain the
// optional `importId` backref to their import session. Existing buckets
// carry no such field and need no transformation — only the version moves.
describe("migration v82 → latest (importId backref)", () => {
  it("bumps the version without disturbing existing history", () => {
    const v82 = {
      version: 82,
      sheets: [],
      activeSheetId: "",
      accounts: [{ id: "acc", name: "Account" }],
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
      history: {
        acc: [
          {
            id: "e1",
            date: "2026-01-10",
            description: "Grocery store",
            amount: -120,
            importedAt: 0,
          },
        ],
      },
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
    const result = migrate(v82);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      history: Record<string, { id: string; importId?: string }[]>;
    };
    expect(data.version).toBe(LATEST_VERSION);
    // The pre-existing entry survives untouched and carries no importId.
    expect(data.history.acc).toHaveLength(1);
    expect(data.history.acc[0].id).toBe("e1");
    expect(data.history.acc[0].importId).toBeUndefined();
  });
});
