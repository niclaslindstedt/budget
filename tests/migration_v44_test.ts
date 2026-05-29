import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v44 → v45 step adds `UserData.tags`. Existing v44 snapshots had no
// such field, so the migration seeds an empty array. `Row.tagIds` is
// additive and needs no data transform.
describe("migration v44 → latest (tags)", () => {
  it("seeds an empty tags array", () => {
    const v44 = {
      version: 44,
      sheets: [],
      activeSheetId: "",
      accounts: [],
      companies: [],
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
      settings: {},
    };
    const result = migrate(v44);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      tags: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.tags).toEqual([]);
  });
});
