import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v42 → v43 step adds `UserData.seriesMetadata`. Existing v42
// snapshots had no such field, so the migration seeds an empty record.
describe("migration v42 → latest (seriesMetadata)", () => {
  it("seeds an empty seriesMetadata map", () => {
    const v42 = {
      version: 42,
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
      settings: {},
    };
    const result = migrate(v42);
    expect(result.migrated).toBe(true);
    const data = result.data as { version: number; seriesMetadata: unknown };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.seriesMetadata).toEqual({});
  });
});
