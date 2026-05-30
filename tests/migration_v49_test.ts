import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v48 → v49 step adds `UserData.subtypes` and `UserData.items`.
// Existing v48 snapshots had neither, so the migration seeds empty arrays.
// `Row.lineItems` / `HistoryEntry.lineItems` are optional and need no
// backfill.
describe("migration v48 → latest (subtypes + items)", () => {
  it("seeds empty subtypes and items arrays", () => {
    const v48 = {
      version: 48,
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
      settings: {},
    };
    const result = migrate(v48);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      subtypes: unknown;
      items: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.subtypes).toEqual([]);
    expect(data.items).toEqual([]);
  });
});
