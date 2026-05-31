import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { DEFAULT_COMPANY_CATEGORY_ID } from "../src/data/presets/company-categories";
import { createDefaultSheet } from "../src/data/sheet";
import type { UserData } from "../src/data/types";
import { validateUserData } from "../src/data/validate";

// The v50 → v51 step introduces user-curated company categories
// (`UserData.companyCategories` + `hiddenPresetCompanyCategoryIds`) and
// the optional `Company.companyCategoryId`. The migration seeds empty
// arrays; the optional reference needs no transform.
describe("migration v50 → latest (company categories)", () => {
  it("seeds empty companyCategories and hiddenPresetCompanyCategoryIds", () => {
    const v50 = {
      version: 50,
      sheets: [],
      activeSheetId: "",
      accounts: [],
      companies: [{ id: "co-1", name: "ICA" }],
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
    const result = migrate(v50);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      companyCategories: unknown;
      hiddenPresetCompanyCategoryIds: unknown;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.companyCategories).toEqual([]);
    expect(data.hiddenPresetCompanyCategoryIds).toEqual([]);
  });
});

function workspace(patch: Partial<UserData> = {}): UserData {
  const sheet = createDefaultSheet("Budget");
  return {
    version: LATEST_VERSION,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
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
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: {},
    ...patch,
  } as UserData;
}

describe("validateUserData — company categories", () => {
  it("keeps a companyCategoryId pointing at a preset", () => {
    const r = validateUserData(
      workspace({
        companies: [
          {
            id: "co-1",
            name: "ICA",
            companyCategoryId: DEFAULT_COMPANY_CATEGORY_ID,
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.companies[0].companyCategoryId).toBe(
        DEFAULT_COMPANY_CATEGORY_ID,
      );
  });

  it("keeps a companyCategoryId pointing at a user category", () => {
    const r = validateUserData(
      workspace({
        companyCategories: [
          { id: "cc-1", name: "Bakeries", color: "#e06c75", icon: "tag" },
        ],
        companies: [
          { id: "co-1", name: "Local Bakery", companyCategoryId: "cc-1" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.companies[0].companyCategoryId).toBe("cc-1");
  });

  it("strips a dangling companyCategoryId, preserving typeIds", () => {
    const r = validateUserData(
      workspace({
        types: [],
        companies: [
          {
            id: "co-1",
            name: "Mystery Shop",
            companyCategoryId: "cc-gone",
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.companies[0].companyCategoryId).toBeUndefined();
  });

  it("rejects a user company category colliding with a preset id", () => {
    const r = validateUserData(
      workspace({
        companyCategories: [
          {
            id: DEFAULT_COMPANY_CATEGORY_ID,
            name: "Mine",
            color: "#e06c75",
            icon: "tag",
          },
        ],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it("drops a hidden-preset id that doesn't match a known preset", () => {
    const r = validateUserData(
      workspace({
        hiddenPresetCompanyCategoryIds: [
          "preset-company-cat-grocery",
          "preset-company-cat-gone",
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.hiddenPresetCompanyCategoryIds).toEqual([
        "preset-company-cat-grocery",
      ]);
  });
});
