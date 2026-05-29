import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v45 → v46 step is a bare version bump. It introduces optional
// `HistoryEntry.userTagIds` and `MatchRule.tagIds`, both additive and
// referencing the already-present `tags` array, so a v45 snapshot just
// passes through unchanged apart from the version stamp.
describe("migration v45 → latest (history + rule tags)", () => {
  it("bumps the version without dropping data", () => {
    const v45 = {
      version: 45,
      sheets: [],
      activeSheetId: "",
      accounts: [],
      companies: [],
      tags: [{ id: "t1", name: "Vacation", color: "#abcabc" }],
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
    const result = migrate(v45);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      tags: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.tags).toEqual([
      { id: "t1", name: "Vacation", color: "#abcabc" },
    ]);
  });
});
