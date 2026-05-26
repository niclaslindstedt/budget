import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v43 → v44 step adds `UserData.primaryIncomeMerchants`. Existing
// v43 snapshots had no such field, so the migration seeds an empty
// array. Per-entry `fiscalMonthShift` is additive on `HistoryEntry`
// and needs no data transform.
describe("migration v43 → latest (primaryIncomeMerchants)", () => {
  it("seeds an empty primaryIncomeMerchants array", () => {
    const v43 = {
      version: 43,
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
      settings: {},
    };
    const result = migrate(v43);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      primaryIncomeMerchants: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.primaryIncomeMerchants).toEqual([]);
  });
});
