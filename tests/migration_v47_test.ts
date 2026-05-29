import { describe, expect, it } from "vitest";

import { DEFAULT_SEARCH_RANKING } from "../src/data/constants/defaults";
import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v46 → v47 step seeds `settings.searchRanking` with the defaults so
// existing buckets keep the out-of-the-box search behaviour until the
// user opens the new Search settings tab. Pre-existing settings fields
// must survive untouched.
describe("migration v46 → latest (search ranking settings)", () => {
  it("seeds searchRanking with the defaults and keeps other settings", () => {
    const v46 = {
      version: 46,
      sheets: [],
      activeSheetId: "",
      accounts: [],
      companies: [],
      tags: [],
      categories: [],
      types: [],
      hiddenPresetTypeIds: [],
      presetTypeKindOverrides: {},
      hiddenPresetCategoryIds: [],
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
      settings: { startOfMonth: 1, currency: "€" },
    };
    const result = migrate(v46);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      settings: Record<string, unknown>;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.settings.searchRanking).toEqual(DEFAULT_SEARCH_RANKING);
    // Untouched fields ride through.
    expect(data.settings.startOfMonth).toBe(1);
    expect(data.settings.currency).toBe("€");
  });
});
